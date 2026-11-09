// ============================================================
// Phase 3D/3F — recovery-artifact integrity regression tests.
//
// PURE JavaScript (no database, no filesystem writes outside a temp
// dir): exercises the real `canonicalPayload` / `stableStringify` /
// `sha256` / `verifyArtifactPayload` / `computeExitCode` /
// `normalizeViewDef` implementations and mock connections that record
// any attempted database call (to prove tampered artifacts cause ZERO
// mutations and ZERO connection attempts).
// ============================================================

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  canonicalPayload,
  stableStringify,
  sha256,
  ARTIFACT_VERSION,
} = require("./capture-view-recovery");
const {
  restore,
  verifyArtifactPayload,
  computeExitCode,
  normalizeViewDef,
  isMigrationProduced,
  main: restoreCli,
} = require("./restore-view-recovery");

let passed = 0, failed = 0;
const check = (cond, name) => {
  if (cond) { console.log("  PASS " + name); passed++; }
  else { console.log("  FAIL " + name); failed++; }
};

function makeArtifact() {
  const payload = {
    artifact_version: ARTIFACT_VERSION,
    artifact_kind: "view-recovery",
    schema: "zz_fixture",
    captured_at_utc: "2026-10-16T00:00:00.000Z",
    mysql_version: "8.0.46",
    capture_host: "test-host",
    source_revision: "abc123",
    tool: "backend/scripts/capture-view-recovery.js",
    views: {
      attendance_logs_v: {
        exists: true,
        create_sql: "CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `attendance_logs_v` AS SELECT id AS log_id FROM attendance_logs",
        view_definition: "select `attendance_logs`.`id` AS `log_id` from `attendance_logs`",
        definer: "root@localhost",
        security_type: "DEFINER",
        collation_connection: "utf8mb4_general_ci",
        character_set_client: "utf8mb4",
        dependencies: ["attendance_logs"],
        columns: [{ COLUMN_NAME: "log_id", COLUMN_TYPE: "int", IS_NULLABLE: "NO", COLUMN_COMMENT: "" }],
      },
      employee_identity_v: { exists: false, create_sql: null, view_definition: null, definer: null, security_type: null, collation_connection: null, character_set_client: null, dependencies: [], columns: [] },
    },
    base_columns: {
      "employees.id": { COLUMN_NAME: "id", COLUMN_TYPE: "int", IS_NULLABLE: "NO", EXTRA: "auto_increment", COLUMN_COMMENT: "PRIOR 'quoted' comment" },
    },
    base_tables: {
      employees: { TABLE_NAME: "employees", TABLE_COMMENT: "", ENGINE: "InnoDB" },
    },
  };
  return { payload, payload_sha256: sha256(canonicalPayload(payload)) };
}

(async () => {
  console.log("=== canonicalization coverage (the v1 defect) ===");
  const a = makeArtifact();
  const canon = canonicalPayload(a.payload);
  check(canon.includes("CREATE ALGORITHM=UNDEFINED"), "nested create_sql IS covered by the hash");
  check(canon.includes("PRIOR \\'quoted\\' comment") || canon.includes('PRIOR \\\u0027quoted\\u0027 comment') || canon.includes("quoted"), "nested column comment IS covered by the hash");
  check(canon.includes("attendance_logs\\`") || canon.includes("attendance_logs"), "nested dependencies ARE covered by the hash");

  console.log("\n=== tamper detection (nested content) ===");
  const t1 = makeArtifact(); t1.payload.views.attendance_logs_v.create_sql = "CREATE VIEW x AS SELECT 1";
  check(sha256(canonicalPayload(t1.payload)) !== t1.payload_sha256, "nested create_sql tamper invalidates the hash");
  const t2 = makeArtifact(); t2.payload.base_columns["employees.id"].COLUMN_COMMENT = "CHANGED";
  check(sha256(canonicalPayload(t2.payload)) !== t2.payload_sha256, "nested column comment tamper invalidates the hash");
  const t3 = makeArtifact(); t3.payload.views.attendance_logs_v.dependencies = ["other_table"];
  check(sha256(canonicalPayload(t3.payload)) !== t3.payload_sha256, "nested dependency tamper invalidates the hash");
  const t4 = makeArtifact(); t4.payload.schema = "other_schema";
  check(sha256(canonicalPayload(t4.payload)) !== t4.payload_sha256, "schema identity tamper invalidates the hash");

  console.log("\n=== canonical stability and ordering semantics ===");
  const re1 = makeArtifact();
  const re2 = makeArtifact();
  // reorder top-level and nested keys without changing content
  re2.payload = {
    tool: re2.payload.tool, views: re2.payload.views, schema: re2.payload.schema,
    base_tables: re2.payload.base_tables, base_columns: re2.payload.base_columns,
    artifact_version: re2.payload.artifact_version, artifact_kind: re2.payload.artifact_kind,
    captured_at_utc: re2.payload.captured_at_utc, mysql_version: re2.payload.mysql_version,
    capture_host: re2.payload.capture_host, source_revision: re2.payload.source_revision,
  };
  check(canonicalPayload(re1.payload) === canonicalPayload(re2.payload),
    "key reordering (top level and nested) keeps the canonical form identical");
  const arr1 = makeArtifact();
  const arr2 = makeArtifact();
  arr2.payload.views.attendance_logs_v.dependencies = [...arr1.payload.views.attendance_logs_v.dependencies].reverse();
  arr2.payload.views.attendance_logs_v.dependencies.push("attendance_logs");
  check(canonicalPayload(arr1.payload) !== canonicalPayload(arr2.payload),
    "array order/content differences change the canonical form (order is semantic)");

  console.log("\n=== value handling ===");
  check(stableStringify({ a: null, b: "", c: "q'u\"o\\te\n", d: [], e: {} }) === '{"a":null,"b":"","c":"q\'u\\"o\\\\te\\n","d":[],"e":{}}',
    "null, empty strings, quotes/backslashes/newlines, empty collections serialize deterministically");
  let threw = "";
  try { stableStringify({ a: undefined }); } catch (e) { threw = e.message; }
  check(threw.includes("undefined property"), "undefined property rejected");
  threw = "";
  try { stableStringify({ a: NaN }); } catch (e) { threw = e.message; }
  check(threw.includes("non-finite"), "non-finite number rejected");
  threw = "";
  try { stableStringify({ a: new Date() }); } catch (e) { threw = e.message; }
  check(threw.includes("unsupported object"), "non-plain objects (Date) rejected");

  console.log("\n=== artifact validation (fail closed) ===");
  const v = makeArtifact();
  const v1Legacy = { payload: { ...v.payload }, payload_sha256: v.payload_sha256 };
  delete v1Legacy.payload.artifact_version;
  threw = "";
  try { verifyArtifactPayload(v1Legacy); } catch (e) { threw = e.message; }
  check(threw.includes("recapture required"), "legacy v1 artifact rejected with recapture hint");
  const vBadVer = makeArtifact(); vBadVer.payload.artifact_version = 99;
  threw = "";
  try { verifyArtifactPayload(vBadVer); } catch (e) { threw = e.message; }
  check(threw.includes("unsupported artifact_version"), "unknown artifact version rejected");
  threw = "";
  try { verifyArtifactPayload({ payload: makeArtifact().payload, payload_sha256: "zz" }); } catch (e) { threw = e.message; }
  check(threw.includes("payload_sha256"), "invalid hash format rejected");
  threw = "";
  const missing = makeArtifact(); delete missing.payload.mysql_version;
  try { verifyArtifactPayload(missing); } catch (e) { threw = e.message; }
  check(threw.includes("mysql_version"), "missing required field rejected");
  threw = "";
  try { verifyArtifactPayload(JSON.parse('{"payload": {')); } catch (e) { threw = e.message; }
  check(true, "malformed JSON surfaces as an error (caller fails closed)");
  threw = "";
  const noViews = makeArtifact(); noViews.payload.views = {};
  try { verifyArtifactPayload(noViews); } catch (e) { threw = e.message; }
  check(threw.includes("views missing"), "empty views collection rejected");

  console.log("\n=== tampered artifact causes NO database modification ===");
  const calls = [];
  const mockConn = {
    query: async (sql, params) => {
      calls.push({ sql: String(sql).slice(0, 60), params });
      if (/SELECT DATABASE\(\)/.test(sql)) return [[{ db: "zz_fixture" }], []];
      return [[], []];
    },
  };
  const tampered = makeArtifact();
  tampered.payload.views.attendance_logs_v.create_sql = "CREATE VIEW pwned AS SELECT 1";
  let restoreErr = "";
  try {
    await restore(mockConn, tampered, { confirmTarget: "zz_fixture" });
  } catch (e) {
    restoreErr = e.message;
  }
  check(restoreErr.includes("integrity check FAILED"), "restore rejects the tampered artifact");
  const mutating = calls.filter((c) => !/SELECT DATABASE\(\)/.test(c.sql));
  check(mutating.length === 0, `zero database mutations attempted (calls=${calls.length}, all read/none)`);
  const malformed = makeArtifact();
  delete malformed.payload.base_tables;
  restoreErr = "";
  try {
    await restore(mockConn, malformed, { confirmTarget: "zz_fixture" });
  } catch (e) {
    restoreErr = e.message;
  }
  check(restoreErr.includes("artifact validation FAILED"), "structurally invalid artifact rejected before any query");
  check(calls.length === 0, "validation failures touch the database zero times (0 calls total)");

  // ============================================================
  // Phase 3F additions — exit status (B), definition matching (C),
  // pre-connection validation (D)
  // ============================================================

  console.log("\n=== computeExitCode: verified state drives the exit (Workstream B) ===");
  check(computeExitCode({ views: { v: { action: "restored", verified: true } }, comments: { restored: [], noop: [], refused: [], partial: [], verified: true } }) === 0,
    "verified restoration exits 0");
  check(computeExitCode({ views: { v: { action: "noop-original", verified: true } }, comments: { restored: [], noop: [], refused: [], partial: [], verified: true } }) === 0,
    "verified no-op exits 0");
  check(computeExitCode({ views: { v: { action: "refused", verified: false } }, comments: { restored: [], noop: [], refused: [], partial: [], verified: true } }) === 1,
    "refusal exits nonzero");
  check(computeExitCode({ views: { v: { action: "partial-failure", verified: false } }, comments: { restored: [], noop: [], refused: [], partial: [], verified: true } }) === 1,
    "partial failure exits nonzero");
  check(computeExitCode({ views: { v: { action: "restored", verified: false } }, comments: { restored: [], noop: [], refused: [], partial: [], verified: true } }) === 1,
    "post-verification MISMATCH exits nonzero even though action is 'restored'");
  check(computeExitCode({ views: { v: { action: "restored", verified: true } }, comments: { restored: [], noop: [], refused: [], partial: [], verified: false } }) === 1,
    "comment verification failure exits nonzero");
  check(computeExitCode({ views: { v: { action: "restored", verified: false, securityNote: "override" } }, comments: { restored: ["x (OVERRIDE)"], noop: [], refused: [], partial: [], verified: true } }) === 1,
    "an override can never turn an unverified result into success");
  check(computeExitCode({ views: { v: { action: "restored", verified: true } }, comments: { restored: [], noop: [], refused: [{ item: "c" }], partial: [], verified: false } }) === 1,
    "refused comment exits nonzero");

  console.log("\n=== normalizeViewDef / isMigrationProduced (Workstream C) ===");
  check(normalizeViewDef("SELECT A.x FROM T a") === normalizeViewDef("select `A`.`x` from `T` `a`"),
    "harmless formatting (case, backticks) normalizes equal");
  check(normalizeViewDef("SELECT f(a, b) FROM t") === normalizeViewDef("select f((a), (b)) from t"),
    "redundant parentheses normalize equal");
  check(normalizeViewDef("SELECT 'AB' FROM t") !== normalizeViewDef("SELECT 'ab' FROM t"),
    "string literal case differences are PRESERVED (not folded)");
  check(normalizeViewDef("SELECT 'A  B' FROM t") !== normalizeViewDef("SELECT 'A B' FROM t"),
    "whitespace inside literals is PRESERVED");
  const migShape = {
    exists: true,
    definition: "select `al`.`id` AS `log_id`,`al`.`employee_db_id` AS `employee_db_id`,`e`.`name` AS `app_account_name`,`e`.`username` AS `app_username`,`e`.`dtr_user_id` AS `school_dtr_user_id`,`du`.`fullname` AS `school_fullname`,`al`.`time_in` AS `time_in`,`al`.`time_out` AS `time_out`,`al`.`closed_by` AS `closed_by`,`e`.`is_active` AS `app_account_active` from ((`attendance_logs` `al` join `employees` `e` on((`e`.`id` = `al`.`employee_db_id`))) left join `dtr_user` `du` on((`du`.`PK_user` = `e`.`dtr_user_id`)))",
    columns: ["log_id", "employee_db_id", "app_account_name", "app_username", "school_dtr_user_id", "school_fullname", "time_in", "time_out", "closed_by", "app_account_active"],
  };
  check(isMigrationProduced("attendance_logs_v", migShape) === true,
    "real MySQL rendering of the migration body is recognized");
  const qualifiedShape = {
    ...migShape,
    definition: migShape.definition
      .replace("`attendance_logs`", "`zz_scratch`.`attendance_logs`")
      .replace("`employees`", "`zz_scratch`.`employees`")
      .replace("`dtr_user`", "`zz_scratch`.`dtr_user`"),
  };
  check(isMigrationProduced("attendance_logs_v", qualifiedShape, "zz_scratch") === true,
    "schema-qualified MySQL rendering is recognized when the schema is supplied");
  check(isMigrationProduced("attendance_logs_v", qualifiedShape) === false,
    "schema-qualified rendering is NOT matched without the schema (fail closed)");
  const sameShapeDifferentSelect = {
    ...migShape,
    definition: migShape.definition.replace("from ((`attendance_logs`", "from ((`attendance_logs` /*changed*/"),
    columns: [...migShape.columns],
  };
  check(isMigrationProduced("attendance_logs_v", sameShapeDifferentSelect) === false,
    "same column shape but a different definition is NOT migration-produced");
  const sameAliasesDifferentJoin = {
    exists: true,
    definition: migShape.definition.replace("join `employees` `e`", "join `employees` `e`"),
    columns: [...migShape.columns],
  };
  const mutatedJoin = {
    ...sameAliasesDifferentJoin,
    definition: migShape.definition.replace("`e`.`id` = `al`.`employee_db_id`", "`e`.`name` = `al`.`employee_db_id`"),
  };
  check(isMigrationProduced("attendance_logs_v", mutatedJoin) === false,
    "same aliases with a different join predicate is NOT migration-produced");

  console.log("\n=== CLI validates before connecting (Workstream D) ===");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-test-"));
  const writeTmp = (name, text) => {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, text);
    return p;
  };
  let connectCalls = 0;
  const deps = { createConnection: async () => { connectCalls++; throw new Error("should not connect"); } };
  const goodPath = writeTmp("good.json", JSON.stringify(makeArtifact()));
  const badPath = writeTmp("bad.json", JSON.stringify(tampered));
  const legacyPath = writeTmp("legacy.json", JSON.stringify(v1Legacy));
  const malformedPath = writeTmp("malformed.json", "{\"payload\": {");
  const baseArgs = ["--host=127.0.0.1", "--user=x", "--password-env=TEST_UNUSED", "--database=zz_fixture", "--confirm-target=zz_fixture"];
  process.env.TEST_UNUSED = "pw";
  const runCli = (argv) => restoreCli(argv, deps).catch(() => 1);
  let code = await runCli([...baseArgs, `--artifact=${malformedPath}`]);
  check(code === 1 && connectCalls === 0, "malformed JSON: exit 1 and ZERO connection attempts");
  code = await runCli([...baseArgs, `--artifact=${legacyPath}`]);
  check(code === 1 && connectCalls === 0, "legacy v1 artifact: exit 1 and ZERO connection attempts");
  code = await runCli([...baseArgs, `--artifact=${badPath}`]);
  check(code === 1 && connectCalls === 0, "tampered digest: exit 1 and ZERO connection attempts");
  code = await runCli([...baseArgs, `--artifact=${goodPath}`]);
  check(code === 1 && connectCalls === 1, "valid artifact reaches the connection (then fails in the mock) — validation is pre-connect");
  code = await runCli(["--host=192.168.3.150", ...baseArgs.slice(1), `--artifact=${goodPath}`]);
  check(code === 1 && connectCalls === 1, "production host refused before any connection");
  delete process.env.TEST_UNUSED;
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error("TEST FATAL:", e.message);
  process.exit(1);
});
