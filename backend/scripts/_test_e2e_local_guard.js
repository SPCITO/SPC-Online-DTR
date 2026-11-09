// M.74 — regression test for the local-only E2E fixture safety guards.
// Pure logic only (no database). Run:
//   node backend/scripts/_test_e2e_local_guard.js
//
// Verifies the isolation boundary the fixture tool enforces:
// fail-closed target validation (missing/ambiguous/wrong host or schema),
// zz.e2e.% write scoping, and deterministic FK-scoped synthetic rows.
const assert = require("assert");
const {
  assertLocalTarget,
  isFixtureIdentity,
  fixtureUsernames,
  isOwnedEmployee,
  ownershipRecord,
  buildAttendanceRows,
} = require("./_e2e_local_fixture.js");

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

const local = { DB_HOST: "127.0.0.1", DB_NAME: "spc_online_dtr" };

console.log("E2E LOCAL FIXTURE GUARDS");

check("approved local target is accepted", () => {
  assert.strictEqual(assertLocalTarget(local).host, "127.0.0.1");
  assert.doesNotThrow(() => assertLocalTarget({ DB_HOST: "localhost", DB_NAME: "spc_online_dtr" }));
});

check("missing DB_HOST fails closed", () => {
  assert.throws(() => assertLocalTarget({ DB_NAME: "spc_online_dtr" }), /DB_HOST is missing/);
});

check("missing DB_NAME fails closed", () => {
  assert.throws(() => assertLocalTarget({ DB_HOST: "127.0.0.1" }), /DB_NAME is missing/);
});

check("production host is refused", () => {
  assert.throws(
    () => assertLocalTarget({ DB_HOST: "192.168.3.150", DB_NAME: "spc_online_dtr" }),
    /not the approved local test host/
  );
});

check("production schema is refused even on a local host", () => {
  assert.throws(
    () => assertLocalTarget({ DB_HOST: "127.0.0.1", DB_NAME: "sysa_dtr" }),
    /not the local scratch schema/
  );
});

check("the e2e runner's production target is refused", () => {
  assert.throws(
    () => assertLocalTarget({ DB_HOST: "dtrserver", DB_NAME: "sysa_dtr" }),
    /refusing to run/
  );
});

check("ambiguous/blank targets are refused (no fallback)", () => {
  assert.throws(() => assertLocalTarget({ DB_HOST: "  ", DB_NAME: "spc_online_dtr" }), /missing/);
  assert.throws(() => assertLocalTarget({}), /DB_HOST is missing/);
});

check("writes are scoped to zz.e2e.% identities only", () => {
  fixtureUsernames().forEach((u) => assert.strictEqual(isFixtureIdentity(u), true, u));
  ["e2e.admin", "zz.nt.test", "zz.lw.admin", "EMP45", "admin", "zz.e2e", ""].forEach((u) =>
    assert.strictEqual(isFixtureIdentity(u), false, `${u} must be refused`)
  );
});

check("synthetic rows are FK-scoped to the given employee and deterministic", () => {
  const rows = buildAttendanceRows(509, 3, 2, 1);
  assert.strictEqual(rows.length, 6);
  rows.forEach((r) => {
    assert.strictEqual(r[0], 509, "every row must belong to the provisioned employee");
    assert.match(r[1], /^2026-06-\d{2} \d{2}:00:00$/, "time_in must be a June wall-clock string");
    assert.match(r[2], /^2026-06-\d{2} \d{2}:00:00$/, "time_out must be a June wall-clock string");
    assert.strictEqual(r[3], "user");
    assert.ok(r[2] > r[1], "time_out must follow time_in");
  });
  const again = buildAttendanceRows(509, 3, 2, 1);
  assert.deepStrictEqual(rows, again, "fixture must be deterministic for reproducible cleanup");
});

check("row building refuses unscoped employees", () => {
  assert.throws(() => buildAttendanceRows(null, 3, 2, 1), /employeeDbId is required/);
  assert.throws(() => buildAttendanceRows(undefined, 3, 2, 1), /employeeDbId is required/);
});

check("admin dataset crosses the 200-row detail-page boundary", () => {
  assert.ok(buildAttendanceRows(1, 30, 7, 1).length === 210);
});

// M.76 — cleanup ownership: exact identity + marker verification.
check("exact fixture identity with this tool's markers is owned", () => {
  assert.strictEqual(
    isOwnedEmployee({ username: "zz.e2e.admin", name: "ZZ E2E ADMIN", email: "zz.e2e.admin@local.test" }),
    true
  );
  assert.strictEqual(
    isOwnedEmployee({ username: "zz.e2e.employee", name: "ZZ E2E EMPLOYEE", email: "zz.e2e.employee@local.test" }),
    true
  );
});

check("zz.e2e.other is never owned (prefix share alone grants nothing)", () => {
  assert.strictEqual(ownershipRecord("zz.e2e.other"), null);
  assert.strictEqual(
    isOwnedEmployee({ username: "zz.e2e.other", name: "ZZ E2E ADMIN", email: "zz.e2e.admin@local.test" }),
    false
  );
});

check("marker-less rows on exact fixture usernames are collisions, not owned", () => {
  assert.strictEqual(
    isOwnedEmployee({ username: "zz.e2e.admin", name: "NOT OURS", email: "foreign@local.test" }),
    false
  );
  assert.strictEqual(isOwnedEmployee({ username: "zz.e2e.admin" }), false);
});

check("null/undefined rows are never owned", () => {
  assert.strictEqual(isOwnedEmployee(null), false);
  assert.strictEqual(isOwnedEmployee(undefined), false);
});

check("fixtureUsernames() remains the single deletion-scope source", () => {
  const names = fixtureUsernames();
  assert.deepStrictEqual(names, ["zz.e2e.admin", "zz.e2e.employee"]);
  names.forEach((u) => assert.strictEqual(isFixtureIdentity(u), true, u));
});

console.log(`\n${passed} checks passed${process.exitCode ? " (WITH FAILURES)" : ""}`);
if (process.exitCode) process.exit(process.exitCode);
