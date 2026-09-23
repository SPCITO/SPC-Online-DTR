// ============================================================
// SPC Online DTR — Synchronization Service
//
// Core logic for receiving sync events from the local agent
// and writing them to the online attendance_logs table.
//
// IDEMPOTENCY STRATEGY:
//   Source identity: dtr_entry.PK_entry (NOT employee+time)
//   A sync_source_map table in the online DB tracks:
//     source_pk_entry → attendance_logs.id
//   This ensures crash-safe idempotency:
//     1. Agent sends PK_entry
//     2. API inserts into attendance_logs + sync_source_map
//     3. If response is lost, agent retries same PK_entry
//     4. API finds existing mapping → returns existing attendance_logs.id
//   Multiple sessions per day are preserved — each PK_entry maps independently.
//
// Does NOT:
//   - Modify employees
//   - Create employees automatically
//   - Write to dtr_entry
//   - Use (employee, date, time) as identity
// ============================================================

const db = require("../config/db");
const { computeSourceHash } = require("../sync/syncHash");

// sync_source_map table is defined in database/schema.sql.
// It must be created before the sync service can operate.
// Runtime code assumes the table exists — it does NOT auto-create it.

/**
 * Resolve a dtr_user_id to an employees.id.
 */
async function resolveEmployeeId(dtrUserId) {
  const [rows] = await db.promise().query(
    "SELECT id FROM employees WHERE dtr_user_id = ? LIMIT 1",
    [dtrUserId]
  );
  return rows.length > 0 ? rows[0].id : null;
}

/**
 * Look up existing sync mapping by source PK_entry.
 * This is the authoritative idempotency check.
 */
async function findSyncMapping(sourcePkEntry) {
  const [rows] = await db.promise().query(
    "SELECT * FROM sync_source_map WHERE source_pk_entry = ? LIMIT 1",
    [sourcePkEntry]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Build a MySQL DATETIME string from tdate + timein/timeout.
 * Uses explicit PHT (Asia/Manila = UTC+8) interpretation.
 */
function buildDatetime(tdate, timeVal) {
  let dateStr;
  if (tdate instanceof Date) {
    const phtDate = new Date(tdate.getTime() + 8 * 60 * 60 * 1000);
    dateStr = phtDate.toISOString().split("T")[0];
  } else {
    dateStr = String(tdate).slice(0, 10);
  }
  return `${dateStr} ${timeVal}`;
}

/**
 * Process a single sync event from the local agent.
 *
 * @param {Object} event
 * @param {number} event.source_pk_entry — dtr_entry.PK_entry (authoritative identity)
 * @param {number} event.dtr_user_id     — dtr_user.PK_user
 * @param {string} event.tdate           — dtr_entry.tdate
 * @param {string|null} event.timein     — dtr_entry.timein
 * @param {string|null} event.timeout    — dtr_entry.timeout
 * @param {string} event.source_hash     — SHA-256 of source record
 * @returns {Promise<Object>} result with status and details
 */
async function processSyncEvent(event) {
  const { source_pk_entry, dtr_user_id, tdate, timein, timeout, source_hash } = event;

  // 1. NULL-timein policy: skip with business decision status
  if (!timein) {
    return {
      source_pk_entry,
      status: "skipped_business_decision",
      message: "NULL-timein records are skipped until business policy is decided",
    };
  }

  // 2. Check existing sync mapping (CRASH-SAFE IDEMPOTENCY)
  const existingMapping = await findSyncMapping(source_pk_entry);
  if (existingMapping) {
    // Already synced — verify the attendance record still exists
    const [attRows] = await db.promise().query(
      "SELECT id, time_in, time_out FROM attendance_logs WHERE id = ? LIMIT 1",
      [existingMapping.online_log_id]
    );

    if (attRows.length > 0) {
      // Source modification detection: if hash changed, update the SAME attendance record
      if (source_hash && existingMapping.source_hash !== source_hash) {
        // Source was modified — update the existing attendance record
        const timeOutDatetime = timeout ? buildDatetime(tdate, timeout) : null;
        if (timeOutDatetime) {
          await db.promise().query(
            "UPDATE attendance_logs SET time_out = ? WHERE id = ?",
            [timeOutDatetime, existingMapping.online_log_id]
          );
        }
        // Update the stored hash
        await db.promise().query(
          "UPDATE sync_source_map SET source_hash = ?, synced_at = NOW() WHERE source_pk_entry = ?",
          [source_hash, source_pk_entry]
        );
        return {
          source_pk_entry,
          status: "synced",
          online_log_id: existingMapping.online_log_id,
          message: "Source modified — updated existing record",
          action: "updated",
        };
      }

      // Same hash, already synced — idempotent skip
      return {
        source_pk_entry,
        status: "synced",
        online_log_id: existingMapping.online_log_id,
        message: "Already synced (idempotent)",
        action: "skipped",
      };
    }

    // Attendance record was deleted but mapping exists — re-insert
    // Fall through to create a new record
  }

  // 3. Resolve employee
  const employeeDbId = await resolveEmployeeId(dtr_user_id);
  if (!employeeDbId) {
    return {
      source_pk_entry,
      status: "failed",
      message: `No online employee found for dtr_user_id=${dtr_user_id}`,
    };
  }

  // 4. Build target datetime
  const timeInDatetime = buildDatetime(tdate, timein);
  const timeOutDatetime = timeout ? buildDatetime(tdate, timeout) : null;

  // 5. Insert new attendance record + sync mapping atomically
  const conn = await db.pool.promise().getConnection();
  try {
    await conn.beginTransaction();

    // Double-check mapping inside transaction (race condition protection)
    const [existingInTx] = await conn.query(
      "SELECT online_log_id FROM sync_source_map WHERE source_pk_entry = ? FOR UPDATE",
      [source_pk_entry]
    );

    if (existingInTx.length > 0) {
      // Another concurrent request already created the mapping
      await conn.rollback();
      conn.release();
      return {
        source_pk_entry,
        status: "synced",
        online_log_id: existingInTx[0].online_log_id,
        message: "Created by concurrent request (idempotent)",
        action: "skipped",
      };
    }

    // Insert attendance record
    const [result] = await conn.query(
      "INSERT INTO attendance_logs (employee_db_id, time_in, time_out) VALUES (?, ?, ?)",
      [employeeDbId, timeInDatetime, timeOutDatetime]
    );
    const onlineLogId = result.insertId;

    // Insert sync source mapping
    await conn.query(
      "INSERT INTO sync_source_map (source_pk_entry, online_log_id, source_hash) VALUES (?, ?, ?)",
      [source_pk_entry, onlineLogId, source_hash]
    );

    await conn.commit();
    conn.release();

    return {
      source_pk_entry,
      status: "synced",
      online_log_id: onlineLogId,
      message: "New attendance record created",
      action: "inserted",
    };
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    conn.release();
    throw err;
  }
}

/**
 * Process a batch of sync events.
 * Returns per-event results for the agent to update its state.
 *
 * @param {Array<Object>} events
 * @returns {Promise<Object>} { results: [...], errors: [...] }
 */
async function processBatch(events) {
  const results = [];
  const errors = [];

  for (const event of events) {
    try {
      const result = await processSyncEvent(event);
      results.push(result);
    } catch (err) {
      errors.push({
        source_pk_entry: event.source_pk_entry,
        status: "failed",
        message: err.message,
      });
    }
  }

  return { results, errors };
}

/**
 * Get sync service status/statistics.
 *
 * @returns {Promise<Object>}
 */
async function getSyncStatus() {
  const [[totalLogs]] = await db.promise().query(
    "SELECT COUNT(*) AS total FROM attendance_logs"
  );
  const [[todayLogs]] = await db.promise().query(
    "SELECT COUNT(*) AS total FROM attendance_logs WHERE DATE(time_in) = CURDATE()"
  );

  return {
    status: "operational",
    total_attendance_records: totalLogs.total,
    today_attendance_records: todayLogs.total,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { processSyncEvent, processBatch, getSyncStatus, resolveEmployeeId };
