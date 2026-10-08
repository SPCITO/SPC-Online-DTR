// ============================================================
// M.69 — focused tests for the source-aware attendance layer.
// Pure logic only: no database connection is opened (the DB modules
// are lazily required inside fetchers and never reached here).
//
// Run: node backend/scripts/_test_attendance_sources.js
// Covers: source validation, multi-session safety (no JOIN
// multiplication), NULL timeout preservation, Manila day boundaries,
// reconciliation states, grouping.
// ============================================================

const assert = require("assert");
const {
  parseSourceParam,
  wallToEpoch,
  manilaDayKey,
  normalizeBiometricRow,
  groupEmployeeDays,
  computeReconciliation,
  buildDaysFromSessions,
  MATCH_TOLERANCE_MINUTES,
} = require("../services/attendanceSources");

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
    process.exitCode = 1;
  }
}

// --- fixtures -------------------------------------------------
const online = (id, emp, date, tin, tout) => ({
  source: "ONLINE_DTR",
  source_id: id,
  id,
  employee_db_id: emp,
  name: `EMP ${emp}`,
  date,
  time_in: `${date} ${tin}`,
  time_out: tout ? `${date} ${tout}` : null,
  closed_by: "user",
});
const bio = (id, emp, date, tin, tout) => ({
  source: "BIOMETRICS",
  source_id: id,
  id,
  employee_db_id: emp,
  name: `EMP ${emp}`,
  date,
  time_in: tin ? `${date} ${tin}` : null,
  time_out: tout ? `${date} ${tout}` : null,
});

console.log("SOURCE VALIDATION");
check("missing source → online", () => {
  assert.strictEqual(parseSourceParam(undefined).source, "online");
  assert.strictEqual(parseSourceParam("").source, "online");
});
check("online / biometrics / both are valid", () => {
  assert.strictEqual(parseSourceParam("online").ok, true);
  assert.strictEqual(parseSourceParam("biometrics").ok, true);
  assert.strictEqual(parseSourceParam("both").ok, true);
  assert.strictEqual(parseSourceParam("BOTH").source, "both");
});
check("invalid source → rejected (400 path)", () => {
  assert.strictEqual(parseSourceParam("everything").ok, false);
  assert.strictEqual(parseSourceParam("ONLINE_DTR").ok, false);
});

console.log("MULTI-SESSION SAFETY (no JOIN multiplication)");
function counts(groups) {
  return groups.map((g) => [g.online.length, g.biometrics.length]);
}
check("1 online + 1 biometric stays 1+1", () => {
  const g = groupEmployeeDays([online(1, 7, "2026-10-08", "08:00:00", "17:00:00"), bio(101, 7, "2026-10-08", "08:01:00", "17:01:00")]);
  assert.deepStrictEqual(counts(g), [[1, 1]]);
});
check("1 online + 3 biometric stays 1+3 (never 3 rows)", () => {
  const g = groupEmployeeDays([
    online(1, 7, "2026-10-08", "08:00:00", "17:00:00"),
    bio(101, 7, "2026-10-08", "07:59:00", "12:00:00"),
    bio(102, 7, "2026-10-08", "12:59:00", "17:01:00"),
    bio(103, 7, "2026-10-08", "17:20:00", "17:25:00"),
  ]);
  assert.deepStrictEqual(counts(g), [[1, 3]]);
});
check("3 online + 1 biometric stays 3+1", () => {
  const g = groupEmployeeDays([
    online(1, 7, "2026-10-08", "08:00:00", "12:00:00"),
    online(2, 7, "2026-10-08", "13:00:00", "17:00:00"),
    online(3, 7, "2026-10-08", "18:00:00", "20:00:00"),
    bio(101, 7, "2026-10-08", "08:00:00", "17:00:00"),
  ]);
  assert.deepStrictEqual(counts(g), [[3, 1]]);
});
check("2 online + 2 biometric stays 2+2 (never 4 joined rows)", () => {
  const g = groupEmployeeDays([
    online(1, 7, "2026-10-08", "08:00:00", "12:00:00"),
    online(2, 7, "2026-10-08", "13:00:00", "17:00:00"),
    bio(101, 7, "2026-10-08", "08:01:00", "12:01:00"),
    bio(102, 7, "2026-10-08", "13:01:00", "17:01:00"),
  ]);
  assert.deepStrictEqual(counts(g), [[2, 2]]);
  assert.strictEqual(g[0].online.length + g[0].biometrics.length, 4, "no row dropped or fabricated");
});

console.log("NULL TIMEOUT PRESERVATION");
check("biometric row with NULL timeout keeps session, time_out null", () => {
  const s = normalizeBiometricRow({
    source_id: 45601,
    tdate: "2026-10-08",
    timein: "08:00:12",
    timeout: null,
    employee_db_id: 3,
    fullname: "X",
    groupno: 2,
  });
  assert.strictEqual(s.source_id, 45601);
  assert.strictEqual(s.time_in, "2026-10-08 08:00:12");
  assert.strictEqual(s.time_out, null);
  assert.strictEqual(s.date, "2026-10-08");
  assert.strictEqual(s.no_time_out, true);
});
check("biometric row with NULL timein is preserved (not dropped)", () => {
  const s = normalizeBiometricRow({
    source_id: 45634,
    tdate: "2026-10-08",
    timein: null,
    timeout: "20:03:19",
    employee_db_id: 3,
  });
  assert.strictEqual(s.time_in, null);
  assert.strictEqual(s.time_out, "2026-10-08 20:03:19");
});

console.log("MANILA DAY BOUNDARIES");
check("wall strings near midnight map to their own Manila days", () => {
  assert.strictEqual(manilaDayKey("2026-10-08 00:01:00"), "2026-10-08");
  assert.strictEqual(manilaDayKey("2026-10-07 23:59:59"), "2026-10-07");
});
check("instants are keyed in Asia/Manila (no toISOString day shift)", () => {
  // 2026-10-07 23:30 PHT = 2026-10-07 15:30 UTC — day must stay 10-07
  const beforeMidnight = new Date("2026-10-07T23:30:00+08:00");
  assert.strictEqual(manilaDayKey(beforeMidnight), "2026-10-07");
  // 2026-10-08 00:10 PHT = 2026-10-07 16:10 UTC — day must be 10-08,
  // while toISOString() would say 2026-10-07 (the known dormant-sync bug).
  const afterMidnight = new Date("2026-10-08T00:10:00+08:00");
  assert.strictEqual(afterMidnight.toISOString().split("T")[0], "2026-10-07");
  assert.strictEqual(manilaDayKey(afterMidnight), "2026-10-08");
});
check("wallToEpoch compares Manila wall times correctly", () => {
  const a = wallToEpoch("2026-10-08 08:00:00");
  const b = wallToEpoch("2026-10-08 08:03:00");
  assert.strictEqual(Math.round((b - a) / 60000), 3);
});

console.log("RECONCILIATION STATES");
check("1:1 within tolerance → MATCHED", () => {
  const g = groupEmployeeDays([
    online(1, 7, "2026-10-08", "08:00:00", "17:00:00"),
    bio(101, 7, "2026-10-08", "08:01:00", "17:01:00"),
  ])[0];
  assert.strictEqual(g.reconciliation.state, "MATCHED");
});
check("1:1 beyond tolerance → TIME_MISMATCH", () => {
  const g = groupEmployeeDays([
    online(1, 7, "2026-10-08", "08:00:00", "17:00:00"),
    bio(101, 7, "2026-10-08", "08:45:00", "17:00:00"),
  ])[0];
  assert.strictEqual(g.reconciliation.state, "TIME_MISMATCH");
});
check("online only → ONLINE_ONLY; bio only → BIOMETRIC_ONLY", () => {
  assert.strictEqual(groupEmployeeDays([online(1, 7, "2026-10-08", "08:00:00", "17:00:00")])[0].reconciliation.state, "ONLINE_ONLY");
  assert.strictEqual(groupEmployeeDays([bio(101, 7, "2026-10-08", "08:00:00", "17:00:00")])[0].reconciliation.state, "BIOMETRIC_ONLY");
});
check("1:1 with missing timeout → MISSING_TIMEOUT + flag", () => {
  const g = groupEmployeeDays([
    online(1, 7, "2026-10-08", "08:00:00", "17:00:00"),
    bio(101, 7, "2026-10-08", "08:00:30", null),
  ])[0];
  assert.strictEqual(g.reconciliation.state, "MISSING_TIMEOUT");
  assert.ok(g.reconciliation.flags.includes("MISSING_TIMEOUT"));
});
check("ambiguous multi-session day → DUPLICATE_CANDIDATE (no auto-pairing)", () => {
  const g = groupEmployeeDays([
    online(1, 7, "2026-10-08", "08:00:00", "12:00:00"),
    online(2, 7, "2026-10-08", "13:00:00", "17:00:00"),
    bio(101, 7, "2026-10-08", "08:00:00", "12:00:00"),
    bio(102, 7, "2026-10-08", "13:00:00", "17:00:00"),
  ])[0];
  assert.strictEqual(g.reconciliation.state, "DUPLICATE_CANDIDATE");
});
check("tolerance constant is isolated and labeled", () => {
  assert.strictEqual(typeof MATCH_TOLERANCE_MINUTES, "number");
  const r = computeReconciliation({
    online: [online(1, 7, "2026-10-08", "08:00:00", "17:00:00")],
    biometrics: [bio(101, 7, "2026-10-08", "08:00:00", "17:00:00")],
  });
  assert.strictEqual(r.state, "MATCHED");
});

console.log("GROUPING");
check("groups are keyed employee + Manila day and sorted date DESC, employee ASC", () => {
  const g = groupEmployeeDays([
    online(1, 7, "2026-10-07", "08:00:00", "17:00:00"),
    online(2, 7, "2026-10-08", "08:00:00", "17:00:00"),
    bio(101, 9, "2026-10-08", "08:00:00", "17:00:00"),
  ]);
  assert.strictEqual(g.length, 3);
  assert.deepStrictEqual(
    g.map((x) => [x.date, x.employee_db_id]),
    [["2026-10-08", 7], ["2026-10-08", 9], ["2026-10-07", 7]]
  );
});

console.log("MONTHLY DAY MODEL (M.70 regression)");
check("multi-session day uses true min/max bounds (no first/last inversion)", () => {
  // Fetch order is time_in DESC — the old builder inverted these.
  const days = buildDaysFromSessions(
    [
      online(2, 7, "2026-10-08", "13:00:00", "17:00:00"),
      online(1, 7, "2026-10-08", "08:00:00", "12:00:00"),
    ],
    { includeSources: true }
  );
  assert.strictEqual(days.length, 1);
  assert.strictEqual(days[0].first_in, "2026-10-08 08:00:00");
  assert.strictEqual(days[0].last_out, "2026-10-08 17:00:00");
  // First-in → last-out span (existing monthly formula), not session sum
  assert.strictEqual(days[0].hours, 9);
});
check("Both mode never mixes sources into hours", () => {
  const days = buildDaysFromSessions(
    [
      online(1, 7, "2026-10-08", "08:00:00", "17:00:00"),
      bio(101, 7, "2026-10-08", "06:50:00", "20:00:00"),
    ],
    { includeSources: true }
  );
  assert.strictEqual(days[0].hours, 9, "day metric = Online DTR span, not cross-source span");
  assert.strictEqual(days[0].hours_source, "ONLINE_DTR");
  assert.strictEqual(days[0].biometrics_hours, 13.17);
  assert.strictEqual(days[0].online.length, 1);
  assert.strictEqual(days[0].biometrics.length, 1);
});
check("Biometrics-only day metrics come from biometric sessions", () => {
  const days = buildDaysFromSessions(
    [
      bio(101, 7, "2026-10-08", "08:00:00", "12:00:00"),
      bio(102, 7, "2026-10-08", "13:00:00", "17:00:00"),
    ],
    { includeSources: true }
  );
  assert.strictEqual(days[0].hours, 9);
  assert.strictEqual(days[0].hours_source, "BIOMETRICS");
  assert.strictEqual(days[0].status, "BIOMETRIC");
});
check("NULL-timeout biometric day reports NO TIME-OUT without fabricating hours", () => {
  const days = buildDaysFromSessions(
    [bio(101, 7, "2026-10-08", "08:00:00", null)],
    { includeSources: true }
  );
  assert.strictEqual(days[0].no_time_out, true);
  assert.strictEqual(days[0].hours, null);
});

console.log("SOURCE VALIDATION — EDGE INPUTS");
check("numeric/malformed/duplicate-parameter values are all rejected", () => {
  assert.strictEqual(parseSourceParam("5").ok, false);
  assert.strictEqual(parseSourceParam("online;drop table").ok, false);
  // Express parses ?source=a&source=b as an array — String() makes it
  // "a,b", which is not an allowlisted value → rejected, never a
  // silent fallback to another source.
  assert.strictEqual(parseSourceParam(["online", "biometrics"]).ok, false);
});

console.log(`\n${passed} checks passed${process.exitCode ? " (WITH FAILURES)" : ""}`);
if (process.exitCode) process.exit(process.exitCode);
