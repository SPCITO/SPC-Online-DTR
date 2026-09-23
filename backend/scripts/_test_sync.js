// ============================================================
// M.6.1 Focused Synthetic Tests
// Tests the sync components without any live production writes.
// Uses in-memory SQLite and synthetic data only.
// ============================================================

const crypto = require("crypto");
const path = require("path");

// Override state DB to use in-memory for testing
process.env.SYNC_STATE_DB = ":memory:";

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ ${testName}`);
    failed++;
  }
}

// ========== Test 1: Source Hash Determinism ==========
console.log("\n=== Test 1: Source Hash Determinism ===");
const { computeSourceHash, hashFromRow } = require("../sync/syncHash");

const hash1 = computeSourceHash({ FK_user: 115, tdate: "2026-09-23", timein: "07:58:12", timeout: null });
const hash2 = computeSourceHash({ FK_user: 115, tdate: "2026-09-23", timein: "07:58:12", timeout: null });
const hash3 = computeSourceHash({ FK_user: 115, tdate: "2026-09-23", timein: "07:58:12", timeout: "17:00:00" });
assert(hash1 === hash2, "Same input produces same hash");
assert(hash1 !== hash3, "Different input produces different hash");
assert(hash1.length === 64, "Hash is 64-char hex (SHA-256)");

// NULL handling
const hashNull = computeSourceHash({ FK_user: 115, tdate: "2026-09-23", timein: null, timeout: null });
const hashEmpty = computeSourceHash({ FK_user: 115, tdate: "2026-09-23", timein: "", timeout: "" });
assert(hashNull === hashEmpty, "NULL and empty string produce same hash");

// ========== Test 2: SQLite State Creation ==========
console.log("\n=== Test 2: SQLite State Creation ===");
const syncState = require("../sync/syncState");

const db = syncState.getDb();
assert(db !== null, "SQLite database created");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
const tableNames = tables.map(t => t.name);
assert(tableNames.includes("sync_mapping"), "sync_mapping table exists");
assert(tableNames.includes("sync_cursor"), "sync_cursor table exists");
assert(tableNames.includes("sync_log"), "sync_log table exists");

// ========== Test 3: Mapping Uniqueness ==========
console.log("\n=== Test 3: Mapping Uniqueness ===");
syncState.insertMapping({ localPk: 100, onlineLogId: 500, status: "synced", sourceHash: "abc123" });
const m1 = syncState.getMappingByLocalPk(100);
assert(m1 !== null, "Mapping inserted for PK 100");
assert(m1.online_log_id === 500, "online_log_id is 500");
assert(m1.status === "synced", "Status is synced");

// Try duplicate — should not throw (UNIQUE constraint with INSERT OR IGNORE pattern)
try {
  syncState.insertMapping({ localPk: 100, onlineLogId: 999, status: "synced", sourceHash: "xyz" });
  const m1b = syncState.getMappingByLocalPk(100);
  // The UNIQUE constraint should prevent the duplicate
  assert(m1b.online_log_id === 500, "Duplicate insert did not overwrite (UNIQUE constraint)");
} catch (e) {
  // SQLite UNIQUE constraint error is expected
  assert(e.message.includes("UNIQUE"), "Duplicate insert rejected by UNIQUE constraint");
}

// ========== Test 4: New PK Entry ==========
console.log("\n=== Test 4: New PK Entry ===");
const testPk = 99999;
const newMapping = syncState.getMappingByLocalPk(testPk);
assert(!newMapping, `Unknown PK ${testPk} returns falsy (no mapping)`);
syncState.insertMapping({ localPk: testPk, onlineLogId: 600, status: "synced", sourceHash: "def456" });
const m2 = syncState.getMappingByLocalPk(testPk);
assert(m2 !== undefined && m2 !== null && m2.online_log_id === 600, `PK ${testPk} mapped to online_log_id 600`);

// ========== Test 5: Duplicate PK Retry ==========
console.log("\n=== Test 5: Duplicate PK Retry (Idempotency) ===");
const existing = syncState.getMappingByLocalPk(testPk);
assert(existing.status === "synced", `PK ${testPk} is already synced`);
assert(existing.online_log_id === 600, "Retry sees same online_log_id");

// ========== Test 6: Source Modification ==========
console.log("\n=== Test 6: Source Modification ===");
const m3 = syncState.getMappingByLocalPk(100);
assert(m3.source_hash === "abc123", "Original hash is abc123");
syncState.updateMappingStatus(100, "local_to_online", { status: "synced", onlineLogId: 500, sourceHash: "new_hash_789" });
const m4 = syncState.getMappingByLocalPk(100);
assert(m4.source_hash === "new_hash_789", "Hash updated to new_hash_789");
assert(m4.online_log_id === 500, "Same online_log_id preserved after source modification");

// ========== Test 7: Multiple Sessions Same Date ==========
console.log("\n=== Test 7: Multiple Sessions Same Date ===");
syncState.insertMapping({ localPk: 301, onlineLogId: 701, status: "synced", sourceHash: "session1" });
syncState.insertMapping({ localPk: 302, onlineLogId: 702, status: "synced", sourceHash: "session2" });
const s1 = syncState.getMappingByLocalPk(301);
const s2 = syncState.getMappingByLocalPk(302);
assert(s1.online_log_id !== s2.online_log_id, "Different PK_entries map to different attendance_logs IDs");
assert(s1.online_log_id === 701 && s2.online_log_id === 702, "Both sessions preserved independently");

// ========== Test 8: NULL-timein ==========
console.log("\n=== Test 8: NULL-timein Handling ===");
syncState.insertMapping({ localPk: 400, status: "skipped_business_decision", sourceHash: "nullti" });
const m5 = syncState.getMappingByLocalPk(400);
assert(m5.status === "skipped_business_decision", "NULL-timein recorded as skipped_business_decision");
assert(m5.online_log_id === null, "No attendance_logs record for NULL-timein");

// ========== Test 9: Cursor ==========
console.log("\n=== Test 9: Cursor Operations ===");
syncState.updateCursor(100, "2026-09-23T00:00:00");
const cursor = syncState.getCursor();
assert(cursor.last_sync_pk === 100, "Cursor PK is 100");
assert(cursor.last_sync_time === "2026-09-23T00:00:00", "Cursor time is correct");

// ========== Test 10: Contiguous Cursor ==========
console.log("\n=== Test 10: Contiguous Cursor ===");
// Insert mappings: 101=synced, 102=synced, 103=FAILED, 104=synced
syncState.insertMapping({ localPk: 101, status: "synced", sourceHash: "h" });
syncState.insertMapping({ localPk: 102, status: "synced", sourceHash: "h" });
syncState.insertMapping({ localPk: 103, status: "failed", sourceHash: "h", errorMessage: "test" });
syncState.insertMapping({ localPk: 104, status: "synced", sourceHash: "h" });

const contiguousPk = syncState.computeContiguousCursor(100);
assert(contiguousPk === 102, "Contiguous cursor stops at 102 (103 is failed)");
assert(contiguousPk < 104, "Cursor does NOT skip past failed record");

// Fix 103 — now cursor should advance to 104
syncState.updateMappingStatus(103, "local_to_online", { status: "synced", onlineLogId: 800, sourceHash: "h" });
const contiguousPk2 = syncState.computeContiguousCursor(100);
assert(contiguousPk2 === 104, "After fixing 103, cursor advances to 104");

// ========== Test 11: Failed Record Retry ==========
console.log("\n=== Test 11: Failed Record Retry ===");
syncState.insertMapping({ localPk: 500, status: "failed", sourceHash: "fail_hash", errorMessage: "timeout" });
const failedList = syncState.getFailedMappings();
assert(failedList.length >= 1, "Failed mappings returned");
assert(failedList.some(f => f.local_pk_entry === 500), "PK 500 in failed list");
syncState.updateMappingStatus(500, "local_to_online", { status: "synced", onlineLogId: 900, sourceHash: "fail_hash" });
const m6 = syncState.getMappingByLocalPk(500);
assert(m6.status === "synced", "PK 500 retried successfully");
assert(m6.retry_count === 0, "Retry count reset on success");

// ========== Test 12: Status Counts ==========
console.log("\n=== Test 12: Status Counts ===");
const counts = syncState.countByStatus();
assert(Array.isArray(counts), "Counts returned as array");
const syncedCount = counts.find(c => c.status === "synced");
assert(syncedCount && syncedCount.count > 0, "Synced count > 0");

// ========== Test 13: Logging ==========
console.log("\n=== Test 13: Logging ===");
syncState.log("info", "Test log entry", { detail: "test" });
const logs = syncState.getRecentLogs(5);
assert(logs.length > 0, "Log entries exist");
assert(logs[0].message === "Test log entry", "Latest log entry matches");

// ========== Test 14: Auth Failure ==========
console.log("\n=== Test 14: Auth Verification ===");
const { verifySyncKey } = require("../middleware/syncAuth");
assert(typeof verifySyncKey === "function", "verifySyncKey is a function");
assert(verifySyncKey.length === 3, "verifySyncKey is Express middleware (req, res, next)");

// ========== Cleanup ==========
syncState.close();

// ========== Summary ==========
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
