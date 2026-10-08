// M.75 — regression test for the employee-logs stat-card calculation.
// Run: node backend/scripts/_test_stat_cards.js
const assert = require("assert");
const { statCards } = require("../../frontend/lib/statCards.js");

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

console.log("STAT CARDS");
check("Online: counts logs, unchanged behavior", () => {
  const r = statCards("online", [{ time_in: "2026-10-02T02:40:49.000Z" }, { time_in: "2026-10-01T01:13:25.000Z" }], []);
  assert.strictEqual(r.total, 2);
  assert.notStrictEqual(r.latestDateLabel, "—");
});
check("Biometrics: counts logs, unchanged behavior", () => {
  const r = statCards("biometrics", [{ time_in: "2026-10-08 08:28:25" }, { time_in: "2026-10-07 08:34:18" }, { time_in: "2026-10-06 09:15:03" }], []);
  assert.strictEqual(r.total, 3);
  assert.notStrictEqual(r.latestDateLabel, "—");
});
check("Both: empty dataset shows 0 / — (not a crash)", () => {
  const r = statCards("both", [], []);
  assert.strictEqual(r.total, 0);
  assert.strictEqual(r.latestDateLabel, "—");
});
check("Both: counts reconciliation groups, never the empty logs array", () => {
  const groups = [
    { date: "2026-10-08", online: [], biometrics: [{}, {}] },
    { date: "2026-10-07", online: [{}], biometrics: [{}] },
    { date: "2026-10-02", online: [{}, {}], biometrics: [{}, {}] },
  ];
  const r = statCards("both", [], groups);
  assert.strictEqual(r.total, 3, "one group = one row, regardless of session count");
  assert.strictEqual(r.latestDateLabel, "2026-10-08");
});
check("Both: no double-counting of a 2-online + 2-biometric day", () => {
  const groups = [{ date: "2026-10-02", online: [{}, {}], biometrics: [{}, {}] }];
  const r = statCards("both", [], groups);
  assert.strictEqual(r.total, 1, "4 source sessions across 2 columns still count as 1 group");
});

console.log(`\n${passed} checks passed${process.exitCode ? " (WITH FAILURES)" : ""}`);
if (process.exitCode) process.exit(process.exitCode);
