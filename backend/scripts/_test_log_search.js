// ============================================================
// P1-1 / P2-5 regression tests — identity-aware log search + name policy.
//
// ISOLATED FIXTURES ONLY: in-memory SQLite (better-sqlite3) and injected
// fake query functions. This script opens NO MySQL connection and writes
// nothing to disk.
//
// Coverage maps to the Phase 2 required cases:
//  1. app_id search returns only that account's attendance
//  2. school_dtr_id resolves to the correct application account
//  3. school id == another person's app id never returns that person
//  4. app id == another person's school id stays correct in app mode
//  5. a colliding number never returns a combined unrelated set
//  6. missing school mapping -> safe empty result
//  7. duplicate school mapping -> safe failure (no arbitrary pick)
//  8. existing nonnumeric searches unchanged
//  9. authorization unchanged (STATIC inspection — labeled as such)
// 10. legacy request without id_space keeps exact old predicate/shape
// +  P2-5 display-name policy cases (COALESCE) incl. inactive history
// ============================================================

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const {
  ID_SPACE,
  parseIdSpace,
  isNumericTerm,
  buildSearchFilter,
} = require("../utils/logSearch");

let passed = 0;
let failed = 0;
function assert(condition, testName) {
  if (condition) {
    console.log(`  PASS ${testName}`);
    passed++;
  } else {
    console.error(`  FAIL ${testName}`);
    failed++;
  }
}

// ---------- fixture: the real-world collision shape ----------
// employees.id 256 = one person; dtr_user.PK_user 256 = a DIFFERENT person.
const db = new Database(":memory:");
db.exec(`
  CREATE TABLE employees (
    id INTEGER PRIMARY KEY, name TEXT, username TEXT, employee_id TEXT,
    role TEXT DEFAULT 'employee', is_active INTEGER DEFAULT 1, dtr_user_id INTEGER
  );
  CREATE TABLE dtr_user (PK_user INTEGER PRIMARY KEY, fullname TEXT, isactive INTEGER DEFAULT 1);
  CREATE TABLE attendance_logs (
    id INTEGER PRIMARY KEY, employee_db_id INTEGER, time_in TEXT, time_out TEXT,
    closed_by TEXT DEFAULT 'user'
  );
`);
db.prepare(`INSERT INTO employees (id, name, username, role, is_active, dtr_user_id)
            VALUES (181, 'MATIBAG, MARITONI', 'matibag.maritoni', 'employee', 0, 256)`).run();
db.prepare(`INSERT INTO employees (id, name, username, role, is_active, dtr_user_id)
            VALUES (256, 'ALIMAGNO, BERNARDO JR. J.', 'alimagno.bernardo.jr.j', 'employee', 1, 332)`).run();
db.prepare(`INSERT INTO employees (id, name, username, role, is_active, dtr_user_id)
            VALUES (7, 'NULL-MAP PERSON', 'null.map.person', 'employee', 1, NULL)`).run();
db.prepare(`INSERT INTO employees (id, name, username, role, is_active, dtr_user_id)
            VALUES (8, NULL, 'null.app.name', 'employee', 1, 800)`).run();
db.prepare(`INSERT INTO employees (id, name, username, role, is_active, dtr_user_id)
            VALUES (9, NULL, 'both.null', 'employee', 1, NULL)`).run();
db.prepare(`INSERT INTO dtr_user (PK_user, fullname) VALUES (256, 'MATIBAG, MARITONI')`).run();
db.prepare(`INSERT INTO dtr_user (PK_user, fullname) VALUES (332, 'ALIMAGNO, BERNARDO JR. J.')`).run();
db.prepare(`INSERT INTO dtr_user (PK_user, fullname) VALUES (800, 'SCHOOL NAME ONLY')`).run();
const insLog = db.prepare(`INSERT INTO attendance_logs (id, employee_db_id, time_in, time_out) VALUES (?, ?, ?, ?)`);
insLog.run(1, 256, "2026-10-01 07:00:00", "2026-10-01 15:00:00"); // app 256 (Alimagno)
insLog.run(2, 256, "2026-10-02 07:00:00", "2026-10-02 15:00:00"); // app 256 (Alimagno)
insLog.run(3, 181, "2025-01-25 16:03:26", null);                  // app 181 (Matibag, inactive)
insLog.run(4, 8,  "2026-10-03 07:00:00", "2026-10-03 15:00:00"); // NULL app name
insLog.run(5, 9,  "2026-10-04 07:00:00", "2026-10-04 15:00:00"); // both names NULL
insLog.run(6, 7,  "2026-10-05 07:00:00", "2026-10-05 15:00:00"); // NULL school mapping

// sqlite-backed query shim (same `?` placeholders the route SQL uses)
const sqliteQuery = async (sql, params = []) => db.prepare(sql).all(...params);

async function runSearch({ term, idSpace, query = sqliteQuery }) {
  const filter = await buildSearchFilter({ term, idSpace, query });
  if (filter.error) return filter;
  const where = filter.conditions.length ? ` WHERE ${filter.conditions.join(" AND ")}` : "";
  const rows = await sqliteQuery(
    `SELECT al.id, al.employee_db_id, COALESCE(d.fullname, e.name) AS fullname
       FROM attendance_logs al
       JOIN employees e ON al.employee_db_id = e.id
       LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user${where}
       ORDER BY al.id`,
    filter.params
  );
  return { rows };
}

(async () => {
  console.log("\n=== parseIdSpace / term validation ===");
  assert(parseIdSpace(undefined).ok && parseIdSpace(undefined).value === ID_SPACE.LEGACY, "missing id_space -> legacy");
  assert(parseIdSpace("app_id").ok && parseIdSpace("app_id").value === ID_SPACE.APP, "id_space=app_id accepted");
  assert(parseIdSpace("school_dtr_id").ok && parseIdSpace("school_dtr_id").value === ID_SPACE.SCHOOL, "id_space=school_dtr_id accepted");
  assert(!parseIdSpace("PK_user").ok, "unsupported id_space rejected");
  assert(isNumericTerm("256") && !isNumericTerm("256 MATIBAG") && !isNumericTerm("MATIBAG"), "strict numeric term check");

  console.log("\n=== cases 1-4: explicit namespaces around the 256 collision ===");
  const appMode = await runSearch({ term: "256", idSpace: ID_SPACE.APP });
  assert(
    appMode.rows.length === 2 && appMode.rows.every((r) => r.employee_db_id === 256),
    "1. app_id=256 returns only application account 256's attendance"
  );
  assert(
    !appMode.rows.some((r) => r.employee_db_id === 181),
    "4. app_id=256 never returns the person whose school id is 256"
  );
  const schoolMode = await runSearch({ term: "256", idSpace: ID_SPACE.SCHOOL });
  assert(
    schoolMode.rows.length === 1 && schoolMode.rows[0].employee_db_id === 181,
    "2. school_dtr_id=256 resolves to application account 181"
  );
  assert(
    !schoolMode.rows.some((r) => r.employee_db_id === 256),
    "3. school_dtr_id=256 never returns the collision partner (app id 256)"
  );

  console.log("\n=== case 5: colliding number never yields a combined set ===");
  const legacy256 = await runSearch({ term: "256", idSpace: ID_SPACE.LEGACY });
  const ids256 = legacy256.rows.map((r) => r.employee_db_id).sort();
  assert(
    JSON.stringify(ids256) === JSON.stringify([256, 256]),
    "5. legacy numeric search stays in app space only (no school-space rows mixed in)"
  );

  console.log("\n=== cases 6-7: missing and duplicate school mappings ===");
  const missing = await runSearch({ term: "999", idSpace: ID_SPACE.SCHOOL });
  assert(missing.rows.length === 0, "6. missing school mapping -> documented empty result");
  const dup = await buildSearchFilter({
    term: "123",
    idSpace: ID_SPACE.SCHOOL,
    query: async () => [{ id: 10 }, { id: 11 }],
  });
  assert(
    dup.error && dup.error.status === 409 && dup.error.code === "AMBIGUOUS_DTR_IDENTITY",
    "7. duplicate school mapping fails safely (409, no arbitrary account chosen)"
  );

  console.log("\n=== case 8 + 10: legacy behavior preserved ===");
  const nameSearch = await runSearch({ term: "MATIBAG", idSpace: ID_SPACE.LEGACY });
  assert(
    nameSearch.rows.length === 1 && nameSearch.rows[0].employee_db_id === 181,
    "8. nonnumeric name search unchanged (matches display name)"
  );
  const legacyFilter = await buildSearchFilter({ term: "256", idSpace: ID_SPACE.LEGACY, query: sqliteQuery });
  assert(
    legacyFilter.conditions[0] === `(COALESCE(d.fullname, e.name) LIKE ? OR al.employee_db_id = ?)` &&
      legacyFilter.params[0] === "%256%" &&
      legacyFilter.params[1] === 256,
    "10. legacy predicate string and params byte-identical to pre-change behavior"
  );
  const explicitTerm = await buildSearchFilter({ term: "MATIBAG", idSpace: ID_SPACE.SCHOOL, query: sqliteQuery });
  assert(
    explicitTerm.error && explicitTerm.error.status === 400 && explicitTerm.error.code === "INVALID_SEARCH_TERM",
    "explicit namespace + nonnumeric term -> 400 (never silently reinterpreted)"
  );

  console.log("\n=== case 9: authorization unchanged (STATIC inspection) ===");
  const logsSrc = fs.readFileSync(path.join(__dirname, "..", "routes", "logsRoutes.js"), "utf8");
  const serverSrc = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert(
    /router\.get\("\/", requireRole\("admin"\)/.test(logsSrc),
    "9a. admin logs route still guarded by requireRole('admin') [static]"
  );
  assert(
    logsSrc.includes(`parseInt(employee_db_id) !== req.user.id && req.user.role !== "admin"`),
    "9b. /me ownership check intact [static]"
  );
  assert(
    /app\.use\("\/api\/logs", verifyToken/.test(serverSrc),
    "9c. logs router still mounted behind verifyToken [static]"
  );
  assert(
    !logsSrc.includes(`al.employee_db_id = d.PK_user`) && !logsSrc.includes(`al.employee_db_id = du.PK_user`),
    "9d. no query joins employee_db_id directly to dtr_user.PK_user [static]"
  );

  console.log("\n=== P2-5: display-name policy (COALESCE) + inactive history ===");
  const nameQuery = `SELECT al.id, COALESCE(d.fullname, e.name) AS name, e.is_active
                     FROM attendance_logs al
                     JOIN employees e ON al.employee_db_id = e.id
                     LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user
                     ORDER BY al.id`;
  const named = await sqliteQuery(nameQuery);
  const byId = Object.fromEntries(named.map((r) => [r.id, r]));
  assert(byId[1].name === "ALIMAGNO, BERNARDO JR. J.", "N1. both names populated -> school name shown");
  assert(byId[6].name === "NULL-MAP PERSON", "N2. school name NULL -> application name shown");
  assert(byId[4].name === "SCHOOL NAME ONLY", "N3. application name NULL -> school name shown");
  assert(byId[5].name === null, "N4. both names NULL -> NULL (not a wrong person's name)");
  assert(byId[3].is_active === 0 && byId[3].id === 3, "N5. inactive account's historical attendance stays reportable");
  assert(named.length === 6, "N6. COALESCE policy adds no rows and drops no rows (6 = 6)");

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  db.close();
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error("TEST FATAL:", e.message);
  process.exit(1);
});
