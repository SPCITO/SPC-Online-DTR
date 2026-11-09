# Identity Migration — Production Readiness Checklist

Status document for the `sysa_dtr` identity migration
(`add-dtr-user-id-unique-migration.sql`, `identity-views-migration.sql`).
**Preparation only — production execution is NOT authorized by this
document.** Every command below that would change production is marked
**PROPOSED — NOT AUTHORIZED — DO NOT EXECUTE**.

Evidence labels:

* **[VERIFIED-LOCAL]** — demonstrated on the isolated local MySQL (8.0.46).
* **[VERIFIED-REPO]** — supported by repository artifacts (named below).
* **[VERIFIED-PROD-REPORT]** — supported by the authorized read-only
  production audit of 2026-10-16 (Phase 1); not re-verified since.
* **[NOT-VERIFIED]** — no evidence yet.
* **[BLOCKED-AUTH]** — requires explicit human authorization.

---

## A. Database environment

| Item | State | Evidence |
|---|---|---|
| Production MySQL version/patch | **8.0.46** (as of 2026-09-29) | [VERIFIED-REPO] `BACKUP_RUNBOOK.md` §2; **not re-checked live** [NOT-VERIFIED] |
| Local rehearsal MySQL | 8.0.46 (`DESKTOP-2PP16CN`) | [VERIFIED-LOCAL] Phase 3A/3B rehearsals |
| Migration syntax compatibility | 5.7+/8.x constructs only (`PREPARE/EXECUTE`, `SELECT … INTO @v`, `information_schema`, `CREATE OR REPLACE VIEW`) | [VERIFIED-LOCAL] executed on 8.0.46 |
| Target schema / tables / chain columns | `sysa_dtr`; `employees`, `attendance_logs`, `dtr_user` + chain columns/types/FK | [VERIFIED-PROD-REPORT] Phase 1 information_schema audit |
| Views on production | `attendance_logs_v`, `employee_identity_v` present (created manually 2026-10-16); legacy `logs_view`/`employees_view` absent | [VERIFIED-PROD-REPORT] Phase 1 |
| Storage engine / DDL behavior | InnoDB; MySQL DDL commits implicitly (not transactional) — stated in both migrations | [VERIFIED-REPO] migration headers |
| SQL mode / server settings affecting DDL | unknown | [NOT-VERIFIED] |

## B. Backup and restore

| Item | State | Evidence |
|---|---|---|
| Backup owner / location | `spcadmin` dump on `spcwebhost` (`/home`, off the DB server) | [VERIFIED-REPO] `BACKUP_RUNBOOK.md` §2–3 |
| Base backup artifact | `sysa_dtr_20260929_024816.sql.gz` + `.sha256` (full schema, `--single-transaction`) | [VERIFIED-REPO] §2 |
| Restore rehearsal | **restore tested on an isolated instance (2026-09-29)** | [VERIFIED-REPO] §4 |
| Fresh backup at migration time | not yet taken | [BLOCKED-AUTH] |
| Backup integrity / retention at execution time | SHA-256 sidecar exists for the 09-29 artifact; retention policy | [NOT-VERIFIED] retention |
| View/metadata recovery artifacts | tooling + procedure complete (`database/recovery/README.md`, v2 format); local rehearsal done; **no production capture exists**. Storage policy: production artifacts go to an **access-controlled external location approved by the system owner** (unresolved — none confirmed); the repo carries only a manifest entry (digest/timestamp/schema/revision) | [VERIFIED-LOCAL] / production capture [BLOCKED-AUTH] |
| Recovery-time / required privileges | rehearsal timings local only; production privilege set unverified | [NOT-VERIFIED] |
| Go/no-go | **NO-GO** until: fresh backup + restore spot-check, and an approved production recovery capture stored per the external-storage policy (access-controlled location approved by the system owner) with a repository **manifest entry only** — no production capture procedure or storage location is implied to exist yet | — |

## C. Migration preflight (read-only tooling)

Provided: the preflight sections embedded in both migrations are
read-only until their apply steps, and abort via the
invalid-`PREPARE`-diagnostic mechanism. Additional read-only checks
recommended at execution time (**PROPOSED — NOT AUTHORIZED — DO NOT
EXECUTE**):

1. `SELECT DATABASE(), VERSION();` — confirm schema + version.
2. Baseline object dump: `SHOW CREATE TABLE employees/attendance_logs;`,
   `SHOW CREATE VIEW attendance_logs_v/employee_identity_v;` — save output.
3. Duplicate mappings: `SELECT dtr_user_id, COUNT(*) FROM employees WHERE
   dtr_user_id IS NOT NULL GROUP BY dtr_user_id HAVING COUNT(*) > 1;`
4. NULL/orphan checks: `SELECT COUNT(*) FROM employees WHERE dtr_user_id
   IS NULL;` and the Phase 1 orphan queries.
5. Existing index definitions: `information_schema.STATISTICS` for
   `uq_dtr_user_id`.
6. **View/metadata capture:** `node backend/scripts/capture-view-recovery.js`
   — hard prerequisite; verify the artifact hash and record the repository
   **manifest entry** (digest, capture timestamp, schema identity, source
   revision). The recovery JSON itself must NOT be committed to the
   repository — a production artifact belongs in the owner-approved,
   access-controlled external location (an unresolved prerequisite; none
   exists yet). Recording the manifest entry does not authorize the
   capture and does not prove that approved storage exists.
7. Dependency check: `information_schema.VIEW_TABLE_USAGE`.
8. Expected changes: +1 unique index; 3 column comments + 2 table comments
   re-applied; 2 views created or replaced. Row counts unchanged.
9. Disk/locks: metadata-only DDL; brief metadata locks only. [NOT-VERIFIED]
   production load impact.

## D. Privileges and access

| Item | State |
|---|---|
| Migration execution identity (`spcadmin`) | [VERIFIED-REPO] established DBA credential used for backup/audit; current grants [NOT-VERIFIED] |
| App runtime identity (`dtr_app`) — least-privilege DML | [VERIFIED-REPO] `BACKUP_RUNBOOK.md` §3 (SELECT denied on several tables, error 1142) |
| Required grants re-confirmed by an authorized operator | [BLOCKED-AUTH] |
| Payroll Workbench access / operator readiness | [NOT-VERIFIED] |
| Approval + audit trail for the change | [BLOCKED-AUTH] |

## E. Execution and verification plan (runbook — all production steps PROPOSED)

1. Change approval + named responsible operator. **PROPOSED — NOT AUTHORIZED — DO NOT EXECUTE**
2. Maintenance/change window + communication plan (payroll aware; exports paused). **PROPOSED**
3. Final backup (`mysqldump --single-transaction` + SHA-256) and restore spot-check on an isolated instance. **PROPOSED**
4. Baseline preflight (section C items 1–5) with captured output. **PROPOSED**
5. Recovery capture: **UNRESOLVED PREREQUISITE — procedure not yet established.** The shipped `capture-view-recovery.js` intentionally **refuses production endpoints and has no override**; the system owner must approve a capture procedure (explicitly authorized operator, reviewed steps, appropriate privileges) producing the identical v2 artifact format, stored in the approved access-controlled location with a repo manifest entry only (digest, timestamp, schema, revision). **PROPOSED — NOT AUTHORIZED — DO NOT EXECUTE**
6. Migration order (exact commands approved later):
   a. `backend/scripts/add-dtr-user-id-unique-migration.sql`
   b. `backend/scripts/identity-views-migration.sql`
   (run via plain `mysql` client — **NEVER `--force`**; both files hard-stop on
   any error and their DDL is additionally `@gate_ok`-guarded so
   error-continuing clients execute nothing on gate failure; abort on any
   error). Each file must be executed **whole** (e.g. `mysql … < file` or
   `source file`) so its session-variable initialization block runs before
   the preflight and DDL sections — **never** execute a selected range or
   paste only the DDL section into a client, which would skip initialization
   and undermine the fail-closed gate. The exact approved production
   invocation must be confirmed during the separately authorized
   operational-planning phase; the custom SQL test harness does not prove
   equivalence to the actual MySQL CLI. **PROPOSED**
7. Expected changes: see C item 8. **PROPOSED**
8. Post-migration checks: each migration's POST-VERIFY section; application smoke tests (login, admin logs search incl. `id_space` modes, payroll export open). **PROPOSED**
9. Identity verification: `employee_identity_v` crosswalk spot-checks; search collision cases from `_test_log_search.js` run against real data (read-only). **PROPOSED**
10. Monitoring / stop conditions: any preflight diagnostic, any error in `mysql` output, row-count mismatch in POST-VERIFY → stop, escalate to recovery plan. **PROPOSED**
11. Sign-off: operator + reviewer confirm POST-VERIFY outputs archived. **PROPOSED**

## F. Rollback and recovery

| Operation | Nature | Notes |
|---|---|---|
| Reversing application code | redeploy previous container image | no DB effect |
| Restoring original view definitions/metadata | `node backend/scripts/restore-view-recovery.js --artifact=…` | **demonstrated locally** (Phase 3B/3D): v2 artifact hash covers all nested content; two-phase recovery refuses diverged views **and diverged comments before any mutation**; views restored via `CREATE OR REPLACE` (no drop window — a failed statement leaves the working view intact); exact prior `CREATE VIEW` incl. DEFINER/SECURITY; idempotent re-runs |
| Dropping the unique index | `ALTER TABLE employees DROP INDEX uq_dtr_user_id;` | single atomic DDL; no data change |
| Restoring data from backup | `gunzip < dump.sql \| mysql` into an isolated schema first | base backup is restore-verified (2026-09-29); a *fresh* restore test at execution time is still required |
| Partially completed migration | each statement is individually idempotent; re-run after fixing the cause, or use the recovery tool for the views | MySQL DDL has implicit commits — **no one-command rollback exists** |

Stop conditions: any unexplained preflight discrepancy; capture artifact
missing/stale; POST-VERIFY mismatch. Recovery ownership: the named
operator, escalating to the backup owner (spcwebhost runbook).

## G. Go / no-go

**Current decision: NO-GO.** Blocked on:

1. Production version re-confirmation (repo evidence is from 2026-09-29). [NOT-VERIFIED]
2. Fresh backup + restore spot-check in the change window. [BLOCKED-AUTH]
3. Production recovery capture (tooling ready; run must be authorized). [BLOCKED-AUTH]
4. Privilege confirmations (migration account, `dtr_app`, Workbench). [NOT-VERIFIED]
5. Approved runbook + named operator + change window + explicit authorization. [BLOCKED-AUTH]
6. Isolated rehearsal on a **representative** schema: done locally with
   representative fixtures; a staging-copy rehearsal would strengthen it. [VERIFIED-LOCAL]

---

## Appendix — Employee Summary export defect (Workstream E, OUT OF SCOPE)

The Phase 3A finding (grouping key `employees.employee_id`, mostly NULL,
can merge unrelated employees) is **not addressed here**; no export or
payroll code was modified. Open questions for a separately authorized
phase — **no answers are chosen here**:

1. What exactly constitutes one employee in this export?
2. Which identity is the authoritative grouping key?
3. How should employee IDs and school DTR IDs be handled when their numeric
   values collide?
4. Does "Days Present" mean distinct calendar days with qualifying
   attendance, or the number of recorded attendance sessions?
5. How should multiple sessions per day, duplicate candidates, missing
   time-outs, and biometric-only records affect the count?
6. Should source selection (online / biometrics / both) alter grouping or
   counting semantics?

Recommended future tests (not implemented): golden-file XLSX comparisons
for a fixed fixture set covering NULL business IDs, multi-session days,
inactive accounts with history, and name variants; acceptance criteria
signed off by payroll before any export-content change.
