// ============================================================
// SPC Online DTR — Local Synchronization Agent
//
// Reads attendance records from the school's local DTR database
// (sysa_dtr.dtr_entry) and pushes them to the online sync API.
//
// Usage:
//   node scripts/syncAgent.js              — incremental sync
//   node scripts/syncAgent.js --full 2026-09-23  — full day reconciliation
//   node scripts/syncAgent.js --status     — show sync state
//   node scripts/syncAgent.js --retry      — retry failed records
//
// Environment:
//   SYNC_API_URL     — online sync API base URL (default: http://localhost:5000/api/sync)
//   SYNC_API_KEY     — API key for authentication
//   SYNC_STATE_DB    — SQLite state database path (default: ./sync/sync_state.db)
//   DTR_DB_HOST      — local DTR MySQL host (default: dtrserver)
//   DTR_DB_PORT      — local DTR MySQL port (default: 3306)
//   DTR_DB_USER      — local DTR MySQL user
//   DTR_DB_PASSWORD  — local DTR MySQL password
//   DTR_DB_NAME      — local DTR MySQL database (default: sysa_dtr)
//
// SAFETY: This agent executes ONLY SELECT queries against the
// local school DTR database. It NEVER writes to dtr_entry or dtr_user.
// ============================================================

const mysql = require("mysql2/promise");
const http = require("https");
const url = require("url");
const { hashFromRow } = require("../sync/syncHash");
const syncState = require("../sync/syncState");

// ---------- Configuration ----------

function getConfig() {
  return {
    apiUrl: process.env.SYNC_API_URL || "http://localhost:5000/api/sync",
    apiKey: process.env.SYNC_API_KEY || "",
    dtrHost: process.env.DTR_DB_HOST || "dtrserver",
    dtrPort: Number(process.env.DTR_DB_PORT || 3306),
    dtrUser: process.env.DTR_DB_USER || "spcadmin",
    dtrPassword: process.env.DTR_DB_PASSWORD || "",
    dtrDatabase: process.env.DTR_DB_NAME || "sysa_dtr",
    batchSize: 50,
  };
}

// ---------- Local DTR Connection ----------

async function connectLocalDtr(config) {
  return mysql.createConnection({
    host: config.dtrHost,
    port: config.dtrPort,
    user: config.dtrUser,
    password: config.dtrPassword,
    database: config.dtrDatabase,
    connectTimeout: 10000,
    timezone: "+08:00",
  });
}

// ---------- HTTP Client ----------

function apiRequest(config, method, path, body) {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(path, config.apiUrl);
    const isHttps = fullUrl.protocol === "https:";
    const client = isHttps ? http : require("http");

    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      method,
      hostname: fullUrl.hostname,
      port: fullUrl.port || (isHttps ? 443 : 80),
      path: fullUrl.pathname + fullUrl.search,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      timeout: 30000,
    };

    if (bodyStr) {
      options.headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }

    const req = client.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: { raw: data } });
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timeout")); });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ---------- Sync Logic ----------

/**
 * Discover new records: PK_entry > last_sync_pk
 * Discover modified records: tstamp >= (last_sync_time - 1s) AND PK_entry <= last_sync_pk
 * Combine, deduplicate by PK_entry, process in order.
 */
async function discoverRecords(dtrConn, cursor) {
  const allRecords = new Map();

  // 1. New records (PK cursor)
  const [newRows] = await dtrConn.query(
    `SELECT PK_entry, FK_user, tdate, timein, timeout, tstamp
     FROM dtr_entry
     WHERE PK_entry > ?
     ORDER BY PK_entry ASC`,
    [cursor.last_sync_pk]
  );
  for (const row of newRows) {
    allRecords.set(row.PK_entry, row);
  }

  // 2. Modified records (tstamp overlap window)
  const [modifiedRows] = await dtrConn.query(
    `SELECT PK_entry, FK_user, tdate, timein, timeout, tstamp
     FROM dtr_entry
     WHERE tstamp >= ? AND PK_entry <= ?
     ORDER BY tstamp ASC, PK_entry ASC`,
    [cursor.last_sync_time, cursor.last_sync_pk]
  );
  for (const row of modifiedRows) {
    if (!allRecords.has(row.PK_entry)) {
      allRecords.set(row.PK_entry, row);
    }
  }

  // Sort by PK_entry for deterministic processing
  return Array.from(allRecords.values()).sort((a, b) => a.PK_entry - b.PK_entry);
}

/**
 * Check if a record needs syncing by comparing source hash.
 * Returns true if the record is new or has been modified.
 */
function needsSync(localPk, sourceHash) {
  const existing = syncState.getMappingByLocalPk(localPk);
  if (!existing) return true; // New record
  if (existing.status === "synced" && existing.source_hash === sourceHash) return false; // Already synced, unchanged
  if (existing.status === "skipped_business_decision") return false; // Policy skip
  return true; // Failed, conflict, or modified
}

/**
 * Run incremental synchronization.
 */
async function runIncrementalSync(config) {
  const dtrConn = await connectLocalDtr(config);
  const cursor = syncState.getCursor();

  console.log(`[SyncAgent] Incremental sync from PK ${cursor.last_sync_pk}, time ${cursor.last_sync_time}`);

  try {
    const records = await discoverRecords(dtrConn, cursor);
    console.log(`[SyncAgent] Found ${records.length} candidate records`);

    if (records.length === 0) {
      syncState.log("info", "Incremental sync: no new records");
      return { processed: 0, synced: 0, skipped: 0, failed: 0 };
    }

    // Filter to records that actually need syncing
    const toProcess = [];
    for (const row of records) {
      const sourceHash = hashFromRow(row);
      if (needsSync(row.PK_entry, sourceHash)) {
        toProcess.push({ row, sourceHash });
      }
    }

    console.log(`[SyncAgent] ${toProcess.length} records need syncing (${records.length - toProcess.length} already up to date)`);

    if (toProcess.length === 0) {
      // All candidate records are already synced — no cursor change needed
      // (cursor already at the right position from previous runs)
      return { processed: 0, synced: 0, skipped: records.length, failed: 0 };
    }

    // Process in batches
    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < toProcess.length; i += config.batchSize) {
      const batch = toProcess.slice(i, i + config.batchSize);

      const events = batch.map(({ row, sourceHash }) => ({
        source_pk_entry: row.PK_entry,
        dtr_user_id: row.FK_user,
        tdate: row.tdate instanceof Date ? row.tdate.toISOString().split("T")[0] : String(row.tdate),
        timein: row.timein != null ? String(row.timein) : null,
        timeout: row.timeout != null ? String(row.timeout) : null,
        source_hash: sourceHash,
      }));

      try {
        const response = await apiRequest(config, "POST", "/push", { events });

        if (response.status !== 200) {
          console.error(`[SyncAgent] API error: ${response.status}`, response.data);
          for (const { row, sourceHash } of batch) {
            syncState.updateMappingStatus(row.PK_entry, "local_to_online", {
              status: "failed",
              sourceHash,
              errorMessage: `API returned ${response.status}`,
            });
            failed++;
          }
          continue;
        }

        // Process per-event results
        const resultMap = new Map();
        for (const r of (response.data.results || [])) {
          resultMap.set(r.source_pk_entry, r);
        }
        for (const r of (response.data.errors || [])) {
          resultMap.set(r.source_pk_entry, r);
        }

        for (const { row, sourceHash } of batch) {
          const result = resultMap.get(row.PK_entry);
          if (!result) {
            syncState.updateMappingStatus(row.PK_entry, "local_to_online", {
              status: "failed",
              sourceHash,
              errorMessage: "No result returned from API",
            });
            failed++;
            continue;
          }

          if (result.status === "synced") {
            syncState.updateMappingStatus(row.PK_entry, "local_to_online", {
              status: "synced",
              onlineLogId: result.online_log_id,
              sourceHash,
            });
            synced++;
          } else if (result.status === "skipped_business_decision") {
            syncState.updateMappingStatus(row.PK_entry, "local_to_online", {
              status: "skipped_business_decision",
              sourceHash,
            });
            skipped++;
          } else {
            syncState.updateMappingStatus(row.PK_entry, "local_to_online", {
              status: "failed",
              sourceHash,
              errorMessage: result.message,
            });
            failed++;
          }
        }
      } catch (err) {
        console.error(`[SyncAgent] Batch request failed:`, err.message);
        for (const { row, sourceHash } of batch) {
          syncState.updateMappingStatus(row.PK_entry, "local_to_online", {
            status: "failed",
            sourceHash,
            errorMessage: err.message,
          });
          failed++;
        }
      }
    }

    // Advance cursor to the highest CONTIGUOUS successfully processed PK.
    // If PK 100 failed but PK 101 succeeded, cursor stays at 99.
    // PK 101's mapping is still recorded — it won't be reprocessed.
    // Once PK 100 is retried and succeeds, cursor advances through 101.
    const newCursorPk = syncState.computeContiguousCursor(cursor.last_sync_pk);
    if (newCursorPk > cursor.last_sync_pk) {
      // Compute the max tstamp among the newly advanced range for the tstamp cursor
      const advancedMappings = syncState.getDb().prepare(
        `SELECT local_pk_entry FROM sync_mapping
         WHERE local_pk_entry > ? AND local_pk_entry <= ?
         AND status IN ('synced', 'skipped_business_decision')
         ORDER BY local_pk_entry DESC LIMIT 1`
      ).get(cursor.last_sync_pk, newCursorPk);

      syncState.updateCursor(newCursorPk, cursor.last_sync_time);
    }

    syncState.log("info", `Incremental sync complete: ${synced} synced, ${skipped} skipped, ${failed} failed`);

    return { processed: toProcess.length, synced, skipped, failed };
  } finally {
    await dtrConn.end();
  }
}

/**
 * Retry previously failed records.
 */
async function retryFailed(config) {
  const failed = syncState.getFailedMappings("local_to_online", 50);
  if (failed.length === 0) {
    console.log("[SyncAgent] No failed records to retry");
    return { retried: 0 };
  }

  console.log(`[SyncAgent] Retrying ${failed.length} failed records`);
  const dtrConn = await connectLocalDtr(config);

  try {
    const events = [];
    for (const mapping of failed) {
      const [rows] = await dtrConn.query(
        "SELECT PK_entry, FK_user, tdate, timein, timeout FROM dtr_entry WHERE PK_entry = ?",
        [mapping.local_pk_entry]
      );
      if (rows.length === 0) {
        // Source record no longer exists
        syncState.updateMappingStatus(mapping.local_pk_entry, "local_to_online", {
          status: "source_deleted",
          sourceHash: mapping.source_hash,
        });
        continue;
      }
      const row = rows[0];
      events.push({
        source_pk_entry: row.PK_entry,
        dtr_user_id: row.FK_user,
        tdate: row.tdate instanceof Date ? row.tdate.toISOString().split("T")[0] : String(row.tdate),
        timein: row.timein != null ? String(row.timein) : null,
        timeout: row.timeout != null ? String(row.timeout) : null,
        source_hash: hashFromRow(row),
      });
    }

    if (events.length === 0) {
      return { retried: 0 };
    }

    const response = await apiRequest(config, "POST", "/push", { events });
    let retried = 0;
    if (response.status === 200) {
      for (const r of (response.data.results || [])) {
        if (r.status === "synced") {
          syncState.updateMappingStatus(r.source_pk_entry, "local_to_online", {
            status: "synced",
            onlineLogId: r.online_log_id,
          });
          retried++;
        }
      }
    }

    syncState.log("info", `Retry complete: ${retried} recovered`);
    return { retried };
  } finally {
    await dtrConn.end();
  }
}

/**
 * Show current sync status.
 */
function showStatus() {
  const cursor = syncState.getCursor();
  const counts = syncState.countByStatus();
  const recentLogs = syncState.getRecentLogs(10);

  console.log("=== Sync Status ===");
  console.log("Cursor:", JSON.stringify(cursor, null, 2));
  console.log("Mapping counts by status:");
  for (const row of counts) {
    console.log(`  ${row.status}: ${row.count}`);
  }
  console.log("\nRecent log entries:");
  for (const entry of recentLogs) {
    console.log(`  [${entry.timestamp}] ${entry.level}: ${entry.message}`);
  }
}

// ---------- Main ----------

async function main() {
  const args = process.argv.slice(2);
  const config = getConfig();

  if (args.includes("--status")) {
    showStatus();
    syncState.close();
    return;
  }

  if (!config.apiKey) {
    console.error("[SyncAgent] SYNC_API_KEY not set");
    process.exit(1);
  }

  try {
    if (args.includes("--retry")) {
      await retryFailed(config);
    } else if (args.includes("--full")) {
      const dateIdx = args.indexOf("--full") + 1;
      const date = args[dateIdx];
      if (!date) {
        console.error("[SyncAgent] --full requires a date argument (YYYY-MM-DD)");
        process.exit(1);
      }
      console.log(`[SyncAgent] Full reconciliation for ${date} (not yet implemented — use incremental)`);
    } else {
      await runIncrementalSync(config);
    }
  } catch (err) {
    console.error("[SyncAgent] Fatal error:", err);
    syncState.log("error", `Fatal: ${err.message}`);
    process.exit(1);
  } finally {
    syncState.close();
  }
}

// Only run when executed directly
if (require.main === module) {
  main();
}

module.exports = { runIncrementalSync, retryFailed, showStatus };
