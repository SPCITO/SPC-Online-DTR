// ============================================================
// SPC Online DTR — Synchronization State Store (SQLite)
//
// Manages the sync agent's local state in SQLite.
// This database belongs to the sync agent — it is NOT stored
// in the school's MySQL or the online application database.
//
// Tables:
//   sync_mapping  — source PK_entry → target attendance_logs.id
//   sync_cursor   — single-row cursor for incremental sync
//   sync_log      — operational log entries
//
// Statuses:
//   pending, synced, failed, conflict, source_deleted,
//   skipped_business_decision
// ============================================================

const Database = require("better-sqlite3");
const path = require("path");

const DEFAULT_DB_PATH = path.join(__dirname, "sync_state.db");

let _db = null;

/**
 * Open (or return existing) SQLite database connection.
 * Creates the database and tables on first use.
 */
function getDb(dbPath) {
  if (_db) return _db;

  const resolvedPath = dbPath || process.env.SYNC_STATE_DB || DEFAULT_DB_PATH;
  _db = new Database(resolvedPath);

  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS sync_mapping (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      local_pk_entry   INTEGER NOT NULL,
      online_log_id    INTEGER,
      sync_direction   TEXT NOT NULL DEFAULT 'local_to_online',
      status           TEXT NOT NULL DEFAULT 'pending',
      source_hash      TEXT,
      synced_at        TEXT,
      last_attempt_at  TEXT,
      retry_count      INTEGER DEFAULT 0,
      error_message    TEXT,
      created_at       TEXT DEFAULT (datetime('now')),
      UNIQUE(local_pk_entry, sync_direction)
    );

    CREATE TABLE IF NOT EXISTS sync_cursor (
      id              INTEGER PRIMARY KEY CHECK (id = 1),
      last_sync_pk    INTEGER DEFAULT 0,
      last_sync_time  TEXT DEFAULT '1970-01-01T00:00:00',
      updated_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp  TEXT DEFAULT (datetime('now')),
      level      TEXT NOT NULL DEFAULT 'info',
      message    TEXT NOT NULL,
      details    TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sync_mapping_status
      ON sync_mapping(status);
    CREATE INDEX IF NOT EXISTS idx_sync_mapping_local_pk
      ON sync_mapping(local_pk_entry);
    CREATE INDEX IF NOT EXISTS idx_sync_mapping_online_id
      ON sync_mapping(online_log_id);
  `);

  _db.prepare(
    "INSERT OR IGNORE INTO sync_cursor (id, last_sync_pk, last_sync_time) VALUES (1, 0, '1970-01-01T00:00:00')"
  ).run();

  return _db;
}

// ---------- Cursor Operations ----------

function getCursor() {
  const db = getDb();
  return db.prepare("SELECT last_sync_pk, last_sync_time FROM sync_cursor WHERE id = 1").get();
}

function updateCursor(lastPk, lastTime) {
  const db = getDb();
  db.prepare(
    "UPDATE sync_cursor SET last_sync_pk = ?, last_sync_time = ?, updated_at = datetime('now') WHERE id = 1"
  ).run(lastPk, lastTime);
}

/**
 * Compute the safe cursor position: highest contiguous synced PK.
 * Walks forward from the current cursor, stopping at the first gap.
 */
function computeContiguousCursor(fromPk) {
  const db = getDb();
  const rows = db.prepare(
    `SELECT local_pk_entry FROM sync_mapping
     WHERE local_pk_entry >= ? AND status IN ('synced', 'skipped_business_decision')
     ORDER BY local_pk_entry ASC`
  ).all(fromPk);

  let contiguous = fromPk;
  for (const row of rows) {
    if (row.local_pk_entry === contiguous + 1 || row.local_pk_entry === fromPk) {
      contiguous = row.local_pk_entry;
    } else {
      break; // Gap found
    }
  }
  // Handle the case where fromPk itself is the first entry
  if (rows.length > 0 && rows[0].local_pk_entry === fromPk) {
    contiguous = fromPk;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].local_pk_entry === contiguous + 1) {
        contiguous = rows[i].local_pk_entry;
      } else {
        break;
      }
    }
  }
  return contiguous;
}

// ---------- Mapping Operations ----------

function getMappingByLocalPk(localPk, direction = "local_to_online") {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM sync_mapping WHERE local_pk_entry = ? AND sync_direction = ?"
  ).get(localPk, direction);
}

function insertMapping({ localPk, onlineLogId, direction, status, sourceHash, errorMessage }) {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO sync_mapping (local_pk_entry, online_log_id, sync_direction, status, source_hash, synced_at, last_attempt_at, error_message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    localPk,
    onlineLogId || null,
    direction || "local_to_online",
    status || "pending",
    sourceHash || null,
    status === "synced" ? now : null,
    now,
    errorMessage || null
  );
}

function updateMappingStatus(localPk, direction, { status, onlineLogId, sourceHash, errorMessage }) {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = getMappingByLocalPk(localPk, direction);

  if (!existing) {
    return insertMapping({ localPk, onlineLogId, direction, status, sourceHash, errorMessage });
  }

  const sets = ["status = ?", "last_attempt_at = ?"];
  const values = [status, now];

  if (status === "synced") {
    sets.push("synced_at = ?");
    values.push(now);
    sets.push("retry_count = 0");
  } else if (status === "failed") {
    sets.push("retry_count = retry_count + 1");
  }

  if (onlineLogId !== undefined) {
    sets.push("online_log_id = ?");
    values.push(onlineLogId);
  }
  if (sourceHash !== undefined) {
    sets.push("source_hash = ?");
    values.push(sourceHash);
  }
  if (errorMessage !== undefined) {
    sets.push("error_message = ?");
    values.push(errorMessage);
  }

  values.push(localPk, direction);
  db.prepare(
    `UPDATE sync_mapping SET ${sets.join(", ")} WHERE local_pk_entry = ? AND sync_direction = ?`
  ).run(...values);
}

function getFailedMappings(direction = "local_to_online", limit = 100) {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM sync_mapping WHERE status = 'failed' AND sync_direction = ? ORDER BY local_pk_entry ASC LIMIT ?"
  ).all(direction, limit);
}

function getSyncedMappingBySourceHash(sourceHash, direction = "local_to_online") {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM sync_mapping WHERE source_hash = ? AND sync_direction = ? AND status = 'synced'"
  ).get(sourceHash, direction);
}

function countByStatus(direction = "local_to_online") {
  const db = getDb();
  return db.prepare(
    "SELECT status, COUNT(*) as count FROM sync_mapping WHERE sync_direction = ? GROUP BY status"
  ).all(direction);
}

// ---------- Logging ----------

function log(level, message, details) {
  const db = getDb();
  db.prepare(
    "INSERT INTO sync_log (level, message, details) VALUES (?, ?, ?)"
  ).run(level, message, details ? JSON.stringify(details) : null);
}

function getRecentLogs(limit = 50) {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM sync_log ORDER BY id DESC LIMIT ?"
  ).all(limit);
}

// ---------- Lifecycle ----------

function close() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = {
  getDb,
  getCursor,
  updateCursor,
  computeContiguousCursor,
  getMappingByLocalPk,
  insertMapping,
  updateMappingStatus,
  getFailedMappings,
  getSyncedMappingBySourceHash,
  countByStatus,
  log,
  getRecentLogs,
  close,
};
