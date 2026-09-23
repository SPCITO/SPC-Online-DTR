// ============================================================
// SPC Online DTR — Synchronization Source Hash
//
// Deterministic SHA-256 hash for detecting source record changes.
// Used by both the sync agent (local) and sync service (online)
// to detect whether a dtr_entry record has been modified.
//
// Hash input: FK_user|tdate|timein|timeout
// NULL values become empty strings.
// Raw MySQL DATE/TIME string representations are preserved.
// ============================================================

const crypto = require("crypto");

/**
 * Compute a deterministic SHA-256 hash of a dtr_entry record.
 *
 * The hash captures the attendance-relevant fields so that
 * modifications to timein/timeout can be detected.
 *
 * @param {Object} record
 * @param {number|string} record.FK_user   — dtr_user.PK_user
 * @param {string}        record.tdate     — DATE value (YYYY-MM-DD or ISO)
 * @param {string|null}   record.timein    — TIME value (HH:MM:SS) or null
 * @param {string|null}   record.timeout   — TIME value (HH:MM:SS) or null
 * @returns {string} 64-character hex SHA-256 hash
 */
function computeSourceHash(record) {
  const parts = [
    String(record.FK_user ?? ""),
    String(record.tdate ?? ""),
    String(record.timein ?? ""),
    String(record.timeout ?? ""),
  ];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

/**
 * Normalize a raw dtr_entry row into the hash input format.
 * Handles MySQL driver's Date objects and various null representations.
 *
 * @param {Object} row — raw dtr_entry row from mysql2
 * @returns {Object} normalized record suitable for computeSourceHash
 */
function normalizeRecord(row) {
  return {
    FK_user: row.FK_user,
    tdate: row.tdate instanceof Date
      ? row.tdate.toISOString().split("T")[0]
      : String(row.tdate || ""),
    timein: row.timein != null ? String(row.timein) : null,
    timeout: row.timeout != null ? String(row.timeout) : null,
  };
}

/**
 * Compute hash directly from a raw mysql2 dtr_entry row.
 *
 * @param {Object} row — raw dtr_entry row
 * @returns {string} SHA-256 hash
 */
function hashFromRow(row) {
  return computeSourceHash(normalizeRecord(row));
}

module.exports = { computeSourceHash, normalizeRecord, hashFromRow };
