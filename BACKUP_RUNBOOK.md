# sysa_dtr — Backup Runbook (M.38)

Last updated: 2026-09-29 (first verified base backup created 2026-09-29 10:48 PHT / 02:48 UTC)

## 1. What this document covers

This runbook documents the **first verified base backup** of the live DTR database
`sysa_dtr` on `dtrserver` (192.168.3.150:3306, MySQL 8.0.46). It distinguishes
clearly between:

- **Base backup** — a full logical snapshot of all 9 tables at one moment in time.
  ✅ **Available and restore-verified** (see §4).
- **Binlog / incremental** — the server has `binlog_format=ROW` enabled, but no
  binlog files are archived or shipped off-server by us. ❌ Not part of our backups.
- **Point-in-time recovery (PITR)** — would require base backup + archived binlogs.
  ❌ Not currently possible beyond the last base backup.
- **Tested vs untested restore** — restore was **tested on an isolated test
  instance** (see §4). Restoring into **production has not been tested**
  (intentionally; destructive operations on production were out of scope).

## 2. Backup artifact

| Item | Value |
|---|---|
| File | `/home/spcwebhost/backups/sysa_dtr_20260929_024816.sql.gz` (≈ 995 KB) |
| Checksum | `sysa_dtr_20260929_024816.sql.gz.sha256` (SHA-256) |
| Format | `mysqldump` (MySQL 8.4.11 client) piped through `gzip` |
| Consistency | `--single-transaction` (consistent InnoDB snapshot, no app downtime) |
| Scope | Full schema `sysa_dtr` — 9 tables (employees, dtr_user, dtr_entry, attendance_logs, security_logs, notification_log, sync_source_map, and the remaining legacy tables) |
| Location | spcwebhost (`/home`, 39 GB free) — **off the database server** (192.168.3.150) |

## 3. Backup principal (who runs the dump)

- The dump runs with the **established DBA credential** (`spcadmin`, the project's
  `LIVE_DB_*` credential already used for all audit work). It is **already
  available** — **no new grants were created** for backup purposes.
- The runtime user `dtr_app` is intentionally **not** used and **cannot** dump:
  it has least-privilege DML-only grants (no SELECT on `dtr_entry`, `security_logs`,
  `notification_log`, etc.), which was confirmed at runtime (error 1142).
- **No credentials are stored in this document or in the repository.**

## 4. Verification status (this backup)

| Check | Result |
|---|---|
| `gzip -t` integrity | ✅ OK |
| Dump header | ✅ Host 192.168.3.150 / Database sysa_dtr / Server 8.0.46 |
| `CREATE TABLE` statements | ✅ 9 / 9 |
| Data tables present | ✅ dtr_entry, dtr_user, employees, security_logs |
| Empty tables (no INSERT rows) | ✅ attendance_logs, notification_log, sync_source_map (0 rows at backup time) |
| **Isolated restore test** | ✅ Restored into scratch schema `restore_verify_m38` on the **ss-mysql test instance** — `RESTORE_EXIT=0`, 9 tables, row counts matched the dump exactly (employees=483, dtr_user=486, dtr_entry=24854, security_logs=148, attendance_logs=0) |
| Restore into production | ❌ Not tested (intentionally — out of scope) |

## 5. Restore procedure (high level; no credentials listed)

1. Verify the artifact: `sha256sum -c sysa_dtr_<ts>.sql.gz.sha256` and `gzip -t sysa_dtr_<ts>.sql.gz`.
2. Pick a target. **Prefer restoring into a scratch database first** (as done in
   the verification), never directly over live tables.
3. Create the target database (utf8mb4), then import:
   `zcat sysa_dtr_<ts>.sql.gz | mysql --user=<dba> <target_db>`
4. Compare row counts against expectations (§4) before switching anything over.
5. A production restore would additionally require a maintenance window and an
   application stop — plan it explicitly; it has not been rehearsed.

## 6. Backup tooling

- `mysqldump` / `mysql` 8.4.11 live **inside the `ss-mysql` Podman container**
  on spcwebhost. The host itself has no `mysql` client.
- Pattern used: `podman exec -e MYSQL_PWD=... ss-mysql mysqldump --host=192.168.3.150 --user=<dba> --single-transaction --quick --no-tablespaces --hex-blob --default-character-set=utf8mb4 sysa_dtr | gzip > <file>`.
- The password is passed via environment (`MYSQL_PWD`), never on the command
  line and never logged.

## 7. Recommended schedule (NOT yet automated — action required)

- **Daily** base backup via `cron` on spcwebhost (e.g. 21:30 PHT, after the
  reminder job), writing to `/home/spcwebhost/backups/` with date-stamped names.
- **Copy backups off spcwebhost** as well (separate machine/cloud) — a backup on
  the same host as the app is not disaster recovery.
- **Retention**: e.g. keep 7 daily, 4 weekly, 3 monthly (policy decision for IT).
- For true PITR, additionally archive MySQL binlogs off-server. Until then, RPO
  is "time of last base backup" (up to 24 h of data loss in a disaster).

## 8. Restore drill

- ✅ Performed once (2026-09-29) into `restore_verify_m38` on the ss-mysql test
  instance (1.88 MB). The scratch database was **kept for inspection**; no DROP
  was executed. IT may drop `restore_verify_m38` on the test instance whenever
  convenient — it has no production linkage.
- Repeat this drill after any major schema change or at least quarterly.

## 9. Notes and known limitations

- Logical dump (SQL), not a physical/hot backup. Restore time is proportional to
  data size (currently fast — under a minute at today's volumes).
- The sync agent's `DTR_DB_PASSWORD` (intended for `spcadmin` on dtrserver)
  appears **stale** — it no longer authenticates. This is unrelated to backups
  (the dump uses the `LIVE_DB_*` credential) but should be fixed before the
  dormant sync pipeline is ever activated (see findings register L1/O5).
- Two failed first-attempt artifacts (empty/partial files created 2026-09-29
  02:36/02:43/02:46 UTC) were **deleted**; only `sysa_dtr_20260929_024816.sql.gz`
  is the valid backup.

## 10. Contact/ownership

- Runs under spcwebhost host access (rootless Podman). Credential custody: the
  existing `LIVE_DB_*` values in the project's private `backend/.env` (local
  development copy) and the server env files under `/srv/apps/smart-school/env/`
  (mode 600). Rotate via the established process if exposure is suspected.
