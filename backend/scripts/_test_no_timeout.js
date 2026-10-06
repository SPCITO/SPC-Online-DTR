// ============================================================
// No-time-out workflow (payroll model) — test suite.
//
// PART 1: deterministic pure tests (NO database).
//   - 24h window: overnight shifts (21:00 → 06:00) record REAL Time Out
//   - past the window: HARD BLOCK — nothing is ever written
//   - NO TIME-OUT status / blank credit semantics
//
// PART 2: local scratch DB integration (guarded, like the other _test scripts).
//   - hard-block leaves the record BLANK (no fabrication)
//   - Time In proceeds with an expired blank record left untouched
//   - 24h notice: no-email rows marked, failed sends retried, idempotent
//   - admin correction of a blank record (DTR Correction Form workflow)
// ============================================================

const { philippineDateStr } = require("../utils/phTime");
const {
  getCreditPolicy,
  closedByLabel,
  rowCredit,
  planTimeOut,
  planTimeIn,
  isExpired,
  maxSessionHours,
} = require("../utils/attendanceCredit");

let pass = 0;
let fail = 0;

function check(label, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function shiftDay(dayStr, offsetDays) {
  const [y, m, d] = dayStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

// ============================================================
// PART 1 — PURE DETERMINISTIC TESTS
// ============================================================
console.log("\n===== PART 1: pure deterministic tests =====");

check("default window = 24h", maxSessionHours() === 24);

// ---- Within the window: REAL Time Out (overnight shifts safe) ----
{
  const nurse = planTimeOut(new Date("2026-10-04T21:00:00+08:00"), new Date("2026-10-05T06:00:00+08:00"));
  check("NURSE: 21:00 → 06:00 overnight → user_close (REAL Time Out)",
    nurse.action === "user_close", JSON.stringify(nurse));

  const edge = planTimeOut(new Date("2026-10-04T21:00:00+08:00"), new Date("2026-10-05T20:59:00+08:00"));
  check("window edge: 23h59m still user_close", edge.action === "user_close", JSON.stringify(edge));

  const sameDay = planTimeOut(new Date("2026-10-03T08:00:00+08:00"), new Date("2026-10-03T17:00:00+08:00"));
  check("same-day session → user_close", sameDay.action === "user_close", JSON.stringify(sameDay));
}

// ---- Past the window: HARD BLOCK, nothing written ----
{
  const beyond = planTimeOut(new Date("2026-10-04T21:00:00+08:00"), new Date("2026-10-05T21:01:00+08:00"));
  check("beyond 24h → hard_block (no closeAt / no fabrication)",
    beyond.action === "hard_block" && !("closeAt" in beyond), JSON.stringify(beyond));

  const stale = planTimeOut(new Date("2026-09-29T17:09:50+08:00"), new Date("2026-10-03T17:00:00+08:00"));
  check("4-day-old session → hard_block", stale.action === "hard_block", JSON.stringify(stale));

  const month = planTimeOut(new Date("2026-09-30T17:09:50+08:00"), new Date("2026-10-02T09:00:00+08:00"));
  check("month-boundary stale → hard_block", month.action === "hard_block" && month.day === "2026-09-30", JSON.stringify(month));

  const year = planTimeOut(new Date("2025-12-31T22:00:00+08:00"), new Date("2026-01-02T23:00:00+08:00"));
  check("year-boundary stale → hard_block", year.action === "hard_block" && year.day === "2025-12-31", JSON.stringify(year));
}

// ---- isExpired ----
{
  check("isExpired false within window", isExpired("2026-10-04 21:00:00", new Date("2026-10-05T06:00:00+08:00")) === false);
  check("isExpired true past window", isExpired("2026-10-04 21:00:00", new Date("2026-10-05T21:01:00+08:00")) === true);
}

// ---- planTimeIn: a forgotten Time Out never blocks the next Time In ----
{
  const mk = (t) => [{ id: 1, time_in: t }];
  const now = new Date("2026-10-06T08:00:00+08:00");

  const none = planTimeIn([], now);
  check("planTimeIn: no open records → proceed",
    none.action === "proceed" && none.abandonDays.length === 0, JSON.stringify(none));

  const sameDay = planTimeIn(mk("2026-10-06T07:00:00+08:00"), now);
  check("planTimeIn: same-day open record → blocked (time out first)",
    sameDay.action === "blocked", JSON.stringify(sameDay));

  const sameDayFlag = planTimeIn(mk("2026-10-06T07:00:00+08:00"), now, true);
  check("planTimeIn: same-day record blocks even with abandon flag",
    sameDayFlag.action === "blocked", JSON.stringify(sameDayFlag));

  const forgot = planTimeIn(mk("2026-10-05T15:00:00+08:00"), now);
  check("planTimeIn: previous-day within window → confirm_abandon (never silently locked out)",
    forgot.action === "confirm_abandon", JSON.stringify(forgot));

  const forgotOk = planTimeIn(mk("2026-10-05T15:00:00+08:00"), now, true);
  check("planTimeIn: confirmed abandon → proceed, day listed",
    forgotOk.action === "proceed" && forgotOk.abandonDays.includes("2026-10-05"), JSON.stringify(forgotOk));

  const stale = planTimeIn(mk("2026-10-04T08:00:00+08:00"), now);
  check("planTimeIn: past-window record → proceed with NO confirmation",
    stale.action === "proceed" && stale.abandonDays.includes("2026-10-04"), JSON.stringify(stale));

  const both = [
    { id: 1, time_in: "2026-10-04T08:00:00+08:00" },
    { id: 2, time_in: "2026-10-05T15:00:00+08:00" },
  ];
  const mixed = planTimeIn(both, now);
  const mixedOk = planTimeIn(both, now, true);
  check("planTimeIn: mixed stale + in-window → confirm once, then all days abandoned",
    mixed.action === "confirm_abandon" && mixedOk.action === "proceed" && mixedOk.abandonDays.length === 2,
    JSON.stringify({ mixed, mixedOk }));

  const asDate = planTimeIn(mk(new Date("2026-10-05T15:00:00+08:00")), now);
  check("planTimeIn: Date-typed time_in (mysql2) handled",
    asDate.action === "confirm_abandon", JSON.stringify(asDate));
}

// ---- Status / credit semantics ----
{
  const openFresh = { time_in: "2026-10-05 08:00:00", time_out: null, closed_by: "user" };
  const openExpired = { time_in: "2026-10-03 08:00:00", time_out: null, closed_by: "user" };
  const user = { time_in: "2026-10-02 08:00:00", time_out: "2026-10-02 17:00:00", closed_by: "user" };
  const auto = { time_in: "2026-10-02 08:00:00", time_out: "2026-10-02 23:59:59", closed_by: "auto" };
  const admin = { time_in: "2026-10-02 21:00:00", time_out: "2026-10-03 06:00:00", closed_by: "admin" };

  const now = new Date("2026-10-05T12:00:00+08:00");
  const cFresh = rowCredit(openFresh, now);
  check("in-window open row → status OPEN", cFresh.status === "OPEN" && !cFresh.expired, JSON.stringify(cFresh));

  const cExpired = rowCredit(openExpired, now);
  check("expired open row → NO TIME-OUT, blank credit", cExpired.status === "NO TIME-OUT" && cExpired.expired && cExpired.minutes === 0, JSON.stringify(cExpired));

  const cUser = rowCredit(user, now);
  check("user row credited real span (540 min)", cUser.minutes === 540 && cUser.status === "USER", JSON.stringify(cUser));

  const prevPolicy = process.env.ATTENDANCE_CREDIT_POLICY;
  delete process.env.ATTENDANCE_CREDIT_POLICY;
  const cAuto = rowCredit(auto, now);
  check("legacy auto row still PENDING under default policy", cAuto.minutes === null && cAuto.pending === true, JSON.stringify(cAuto));
  if (prevPolicy === undefined) delete process.env.ATTENDANCE_CREDIT_POLICY; else process.env.ATTENDANCE_CREDIT_POLICY = prevPolicy;

  const cAdmin = rowCredit(admin, now);
  check("admin-corrected overnight row credited 9h", cAdmin.minutes === 540 && cAdmin.status === "ADMIN-CORRECTED", JSON.stringify(cAdmin));
}

check("labels: USER / AUTO / ADMIN-CORRECTED", closedByLabel("user") === "USER" && closedByLabel("auto") === "AUTO" && closedByLabel("admin") === "ADMIN-CORRECTED");

// ---- Custom window env ----
{
  const prev = process.env.ATTENDANCE_MAX_SESSION_HOURS;
  process.env.ATTENDANCE_MAX_SESSION_HOURS = "8";
  check("custom 8h window honored", planTimeOut(new Date("2026-10-04T21:00:00+08:00"), new Date("2026-10-05T06:00:00+08:00")).action === "hard_block");
  process.env.ATTENDANCE_MAX_SESSION_HOURS = "0";
  check("invalid window falls back to 24h", maxSessionHours() === 24);
  if (prev === undefined) delete process.env.ATTENDANCE_MAX_SESSION_HOURS; else process.env.ATTENDANCE_MAX_SESSION_HOURS = prev;
}

// ---- Email template ----
{
  const { buildNoTimeOutEmail } = require("../services/noTimeOutNotifier");
  const mail = buildNoTimeOutEmail("JUAN DELA CRUZ", "2026-10-04T21:00:00+08:00");
  check("notice email is professional + points to the DTR Correction Form",
    mail.subject.includes("Missing Time Out") &&
    mail.text.includes("DTR Correction Form") &&
    mail.text.includes("Payroll Department") &&
    mail.text.includes("October 4, 2026"),
    mail.subject);
}

console.log(`\nPART 1 RESULT: ${pass} passed, ${fail} failed`);

// ============================================================
// PART 2 — LOCAL SCRATCH DB INTEGRATION (guarded)
// ============================================================
async function part2() {
  require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

  const DB_HOST = process.env.DB_HOST || "";
  const DB_NAME = process.env.DB_NAME || "";
  if (DB_HOST !== "127.0.0.1" && DB_HOST !== "localhost") {
    console.log(`\nPART 2 SKIPPED: DB_HOST=${DB_HOST} is not the local test database.`);
    return;
  }
  if (DB_NAME !== "spc_online_dtr") {
    console.log(`\nPART 2 SKIPPED: DB_NAME=${DB_NAME} is not the local scratch schema.`);
    return;
  }

  console.log("\n===== PART 2: local scratch DB integration =====");

  const db = require("../config/db");
  const express = require("express");
  const { runNoTimeOutNotices } = require("../services/noTimeOutNotifier");

  const now = new Date();
  const today = philippineDateStr(now);
  const d2 = shiftDay(today, -2);
  const d3 = shiftDay(today, -3);

  // ---- Local schema setup (idempotent, additive) ----
  const [col] = await db.promise().query("SHOW COLUMNS FROM attendance_logs LIKE 'closed_by'");
  if (col.length === 0) {
    await db.promise().query(
      "ALTER TABLE attendance_logs ADD COLUMN closed_by ENUM('user','auto','admin') NOT NULL DEFAULT 'user' AFTER time_out"
    );
    console.log("  [setup] added attendance_logs.closed_by to LOCAL schema");
  }
  const [ncol] = await db.promise().query("SHOW COLUMNS FROM attendance_logs LIKE 'notice_sent_at'");
  if (ncol.length === 0) {
    await db.promise().query(
      "ALTER TABLE attendance_logs ADD COLUMN notice_sent_at DATETIME NULL DEFAULT NULL AFTER closed_by"
    );
    console.log("  [setup] added attendance_logs.notice_sent_at to LOCAL schema");
  }
  await db.promise().query(
    `CREATE TABLE IF NOT EXISTS attendance_corrections (
      id INT NOT NULL AUTO_INCREMENT,
      attendance_log_id INT NOT NULL,
      old_time_out DATETIME DEFAULT NULL,
      new_time_out DATETIME NOT NULL,
      corrected_by INT DEFAULT NULL,
      corrected_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_correction_log (attendance_log_id),
      CONSTRAINT fk_correction_log FOREIGN KEY (attendance_log_id) REFERENCES attendance_logs (id) ON DELETE CASCADE,
      CONSTRAINT fk_correction_admin FOREIGN KEY (corrected_by) REFERENCES employees (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`
  );

  // ---- Seed ----
  await db.promise().query(
    "DELETE FROM employees WHERE username IN ('zz.nt.test', 'zz.nt.admin', 'zz.nt.noemail')"
  );
  const [empIns] = await db.promise().query(
    `INSERT INTO employees (name, username, email, password, role, is_active, must_change_password)
     VALUES ('ZZ NT TEST', 'zz.nt.test', 'zz.nt.test@local.test', 'x', 'employee', 1, 0)`
  );
  const empId = empIns.insertId;
  const [admIns] = await db.promise().query(
    `INSERT INTO employees (name, username, email, password, role, is_active, must_change_password)
     VALUES ('ZZ NT ADMIN', 'zz.nt.admin', 'zz.nt.admin@local.test', 'x', 'admin', 1, 0)`
  );
  const adminId = admIns.insertId;

  const fetchRow = async (id) => {
    const [[r]] = await db.promise().query(
      "SELECT id, time_in, time_out, closed_by, notice_sent_at FROM attendance_logs WHERE id = ?", [id]
    );
    return r;
  };

  const mount = (role, uid) => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: uid, role, session_id: "test" }; next(); });
    app.use("/dtr", require("../routes/dtrRoutes"));
    app.use("/time", require("../routes/timeRoutes"));
    app.use("/api/attendance", require("../middleware/requireRole")(role === "admin" ? "admin" : "employee"), require("../routes/attendanceRoutes"));
    return app.listen(0);
  };

  // ---- S1: NURSE — Time Out within window records REAL time ----
  const nightStart = new Date(now.getTime() - 18 * 3600000);
  const fmtWall = (d) => {
    const p = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(d instanceof Date ? d : new Date(d));
    const g = (t) => p.find((x) => x.type === t).value;
    return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}:${g("second")}`;
  };
  const [rowN] = await db.promise().query(
    "INSERT INTO attendance_logs (employee_db_id, time_in) VALUES (?, ?)",
    [empId, fmtWall(nightStart)]
  );
  const srvEmp = mount("employee", empId);
  const pEmp = srvEmp.address().port;
  const resNurse = await fetch(`http://127.0.0.1:${pEmp}/dtr/time-out`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  const nRow = await fetchRow(rowN.insertId);
  check("S1 NURSE overnight Time Out records REAL time (user)",
    resNurse.status === 200 && nRow.time_out !== null && nRow.closed_by === "user" &&
    Math.abs(new Date(nRow.time_out).getTime() - Date.now()) < 10000,
    JSON.stringify(nRow));

  // ---- S2: past 24h → HARD BLOCK, record stays BLANK ----
  const [rowE] = await db.promise().query(
    "INSERT INTO attendance_logs (employee_db_id, time_in) VALUES (?, ?)",
    [empId, fmtWall(new Date(now.getTime() - 40 * 3600000))]
  );
  const resBlock = await fetch(`http://127.0.0.1:${pEmp}/dtr/time-out`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  const bodyBlock = await resBlock.json();
  const eRow = await fetchRow(rowE.insertId);
  check("S2 expired Time Out → 409 hard-block with correction-form message",
    resBlock.status === 409 && bodyBlock.no_time_out === true && bodyBlock.message.includes("DTR Correction Form"),
    JSON.stringify(bodyBlock));
  check("S2 record stays BLANK (time_out NULL, closed_by untouched)",
    eRow.time_out === null && eRow.closed_by === "user", JSON.stringify(eRow));

  // ---- S3/S4: Time In with expired record → proceeds, record untouched ----
  const resIn = await fetch(`http://127.0.0.1:${pEmp}/dtr/time-in`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  const eRow2 = await fetchRow(rowE.insertId);
  check("S3 Time In proceeds while an expired blank record exists", resIn.status === 200, `status=${resIn.status}`);
  check("S3 expired record still BLANK (never written)", eRow2.time_out === null, JSON.stringify(eRow2));

  const resIn2 = await fetch(`http://127.0.0.1:${pEmp}/dtr/time-in`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  check("S4 in-window open session → 409 (time out first)", resIn2.status === 409, `status=${resIn2.status}`);

  // ---- S4b: PORTUGAL case — a YESTERDAY record (even within the 24h
  // window) must never lock the employee out of the next day's Time In.
  // Close the S3 session so only older open records remain. ----
  const [[openX]] = await db.promise().query(
    "SELECT id FROM attendance_logs WHERE employee_db_id = ? AND time_out IS NULL ORDER BY time_in DESC LIMIT 1", [empId]);
  await db.promise().query(
    "UPDATE attendance_logs SET time_out = ?, closed_by = 'user' WHERE id = ?",
    [fmtWall(new Date()), openX.id]
  );

  // 2C — DETERMINISTIC previous-day fixture. The confirm path needs a
  // record that is BOTH on the previous Manila day AND within the session
  // window; under the default 24h window those two conditions have an
  // empty intersection in the final instants of a Manila day. This block
  // verifies the ROUTE WIRING, so the documented ATTENDANCE_MAX_SESSION_HOURS
  // knob widens the window to 48h for this block ONLY: the explicit
  // previous-day timestamp below is then within the window at any run time.
  // The 24h rule semantics themselves are pinned by the deterministic pure
  // planTimeIn tests above (fixed instants, default window).
  const prevWin = process.env.ATTENDANCE_MAX_SESSION_HOURS;
  process.env.ATTENDANCE_MAX_SESSION_HOURS = "48";
  const yDay = shiftDay(today, -1); // explicit previous Manila calendar date
  const ySeed = `${yDay} 08:00:00`;
  const [rowY] = await db.promise().query(
    "INSERT INTO attendance_logs (employee_db_id, time_in) VALUES (?, ?)",
    [empId, ySeed]
  );

  // 2A — a CANCELLED attempt (no abandon_open) must be rejected AND write
  // nothing: no new row id anywhere, identical row count for the employee.
  const countEmpRows = async () =>
    Number((await db.promise().query(
      "SELECT COUNT(*) AS c FROM attendance_logs WHERE employee_db_id = ?", [empId]
    ))[0][0].c);
  const rowsBeforeY = await countEmpRows();
  const [[maxIdBefore]] = await db.promise().query(
    "SELECT COALESCE(MAX(id), 0) AS m FROM attendance_logs"
  );

  const resY = await fetch(`http://127.0.0.1:${pEmp}/dtr/time-in`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  const bodyY = await resY.json();
  const rowsAfterY = await countEmpRows();
  const [[maxIdAfter]] = await db.promise().query(
    "SELECT COALESCE(MAX(id), 0) AS m FROM attendance_logs"
  );
  check("S4b yesterday's in-window record → 409 confirm_abandon (not a hard lockout)",
    resY.status === 409 && bodyY.previous_day_pending === true, JSON.stringify(bodyY));
  check("S4b cancelled attempt writes NOTHING (no new row, count unchanged)",
    rowsAfterY === rowsBeforeY && Number(maxIdAfter.m) === Number(maxIdBefore.m),
    JSON.stringify({ rowsBeforeY, rowsAfterY, maxIdBefore, maxIdAfter }));

  const resY2 = await fetch(`http://127.0.0.1:${pEmp}/dtr/time-in`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ abandon_open: true }),
  });
  const bodyY2 = await resY2.json();
  const yRow = await fetchRow(rowY.insertId);
  check("S4b confirmed abandon → Time In proceeds (employee unblocked the next day)",
    resY2.status === 200 && Array.isArray(bodyY2.abandoned_previous_days) &&
    bodyY2.abandoned_previous_days.length >= 1 &&
    bodyY2.abandoned_previous_days.includes(yDay), JSON.stringify(bodyY2));
  check("S4b yesterday's record stays BLANK (never fabricated)",
    yRow.time_out === null, JSON.stringify(yRow));
  if (prevWin === undefined) delete process.env.ATTENDANCE_MAX_SESSION_HOURS;
  else process.env.ATTENDANCE_MAX_SESSION_HOURS = prevWin;
  srvEmp.close();

  // ---- S5: 24-hour notice — no-email marked, failures retried, idempotent ----
  const savedEnv = {
    SMTP_REMINDERS_ENABLED: process.env.SMTP_REMINDERS_ENABLED,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  };
  process.env.SMTP_REMINDERS_ENABLED = "0";
  const gated = await runNoTimeOutNotices(now);
  check("S5 emails disabled → notices skipped", gated.reason === "emails_disabled", JSON.stringify(gated));

  process.env.SMTP_REMINDERS_ENABLED = "1";
  delete process.env.SMTP_HOST;
  const noSmtp = await runNoTimeOutNotices(now);
  check("S5 SMTP missing → notices skipped safely", noSmtp.reason === "smtp_not_configured", JSON.stringify(noSmtp));

  // Expired rows across two employees: one WITH email (send will fail →
  // retried later), one WITHOUT email (marked processed immediately).
  const [emp2Ins] = await db.promise().query(
    `INSERT INTO employees (name, username, email, password, role, is_active, must_change_password)
     VALUES ('ZZ NT NOEMAIL', 'zz.nt.noemail', NULL, 'x', 'employee', 1, 0)`
  );
  const emp2Id = emp2Ins.insertId;
  const [rowNoEmail] = await db.promise().query(
    "INSERT INTO attendance_logs (employee_db_id, time_in) VALUES (?, ?)",
    [emp2Id, fmtWall(new Date(now.getTime() - 40 * 3600000))]
  );
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "1";
  process.env.SMTP_USER = "x";
  process.env.SMTP_PASSWORD = "y";
  const run1 = await runNoTimeOutNotices(now);
  const neRow = await fetchRow(rowNoEmail.insertId);
  check("S5 no-email record marked processed (not rescanned forever)",
    run1.noEmail >= 1 && neRow.notice_sent_at !== null, JSON.stringify({ run1, neRow }));
  check("S5 failed sends stay unmarked (retried next run)", run1.errors >= 1 && (await fetchRow(rowE.insertId)).notice_sent_at === null, JSON.stringify(run1));

  const run2 = await runNoTimeOutNotices(now);
  check("S5 second run is idempotent (marked rows skipped)", run2.noEmail === 0, JSON.stringify(run2));

  // ---- S6: admin corrects a BLANK record (DTR Correction Form workflow) ----
  await db.promise().query("UPDATE employees SET email = 'zz.nt.test@local.test' WHERE id = ?", [empId]);
  const srvAdm = mount("admin", adminId);
  const pAdm = srvAdm.address().port;
  // Approved Time Out from the correction form: 8h after Time In — always
  // inside the 24h window and deterministic regardless of the run hour.
  const fixTarget = fmtWall(new Date(new Date(eRow2.time_in).getTime() + 8 * 3600000));
  const resFix = await fetch(`http://127.0.0.1:${pAdm}/api/attendance/${rowE.insertId}/time-out`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ time_out: fixTarget }),
  });
  const fixed = await fetchRow(rowE.insertId);
  check("S6 admin correction of blank record (approved overnight out) works",
    resFix.status === 200 && fixed.closed_by === "admin" && fixed.time_out !== null,
    JSON.stringify(fixed));
  const [[corr]] = await db.promise().query(
    "SELECT old_time_out, corrected_by FROM attendance_corrections WHERE attendance_log_id = ? ORDER BY id DESC LIMIT 1",
    [rowE.insertId]
  );
  check("S6 audit trail preserves the BLANK original + corrector",
    corr && corr.old_time_out === null && corr.corrected_by === adminId, JSON.stringify(corr));

  const resTooLong = await fetch(`http://127.0.0.1:${pAdm}/api/attendance/${rowNoEmail.insertId}/time-out`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ time_out: `${today} 23:59:00` }), // far beyond 24h of its Time In
  });
  check("S6 correction beyond 24h window rejected (400)", resTooLong.status === 400, `status=${resTooLong.status}`);
  srvAdm.close();

  // ---- S6b: /status endpoint — latest-record semantics + forgotten-day
  // listing (previously zero coverage). READ-ONLY for attendance data:
  // GETs only, seeds use explicit past timestamps, never a current-day row.
  // ----
  await db.promise().query("DELETE FROM employees WHERE username = 'zz.nt.status'");
  const [stIns] = await db.promise().query(
    `INSERT INTO employees (name, username, email, password, role, is_active, must_change_password)
     VALUES ('ZZ NT STATUS', 'zz.nt.status', NULL, 'x', 'employee', 1, 0)`
  );
  const stId = stIns.insertId;
  const sD3 = shiftDay(today, -3);
  const sD2 = shiftDay(today, -2);
  const sD1 = shiftDay(today, -1);
  const stCount = async () => Number((await db.promise().query(
    "SELECT COUNT(*) AS c FROM attendance_logs WHERE employee_db_id = ?", [stId]))[0][0].c);
  const stTodayCount = async () => Number((await db.promise().query(
    "SELECT COUNT(*) AS c FROM attendance_logs WHERE employee_db_id = ? AND DATE(time_in) = ?",
    [stId, today]))[0][0].c);

  // Older FORGOTTEN (blank) day + a later COMPLETED day.
  await db.promise().query(
    "INSERT INTO attendance_logs (employee_db_id, time_in) VALUES (?, ?)",
    [stId, `${sD3} 08:00:00`]
  );
  await db.promise().query(
    "INSERT INTO attendance_logs (employee_db_id, time_in, time_out, closed_by) VALUES (?, ?, ?, 'user')",
    [stId, `${sD2} 08:00:00`, `${sD2} 17:00:00`]
  );

  const srvSt = mount("employee", stId);
  const pSt = srvSt.address().port;
  const getStatus = async () =>
    (await fetch(`http://127.0.0.1:${pSt}/time/status/${stId}`)).json();

  const g1 = await getStatus();
  check("S6b /status OUT when the LATEST record is completed (older open row does not leave employee IN)",
    g1.status === "OUT" && g1.time_in === null, JSON.stringify(g1));
  check("S6b /status no_timeout_days lists the forgotten day only",
    Array.isArray(g1.no_timeout_days) && g1.no_timeout_days.includes(sD3) &&
    !g1.no_timeout_days.includes(sD2), JSON.stringify(g1.no_timeout_days));

  // Latest record now OPEN and on the previous day.
  const [rowC] = await db.promise().query(
    "INSERT INTO attendance_logs (employee_db_id, time_in) VALUES (?, ?)",
    [stId, `${sD1} 08:00:00`]
  );
  const g2 = await getStatus();
  check("S6b /status IN + previous_day for an open previous-day record",
    g2.status === "IN" && g2.previous_day === true && g2.open_from === sD1, JSON.stringify(g2));
  check("S6b /status returns the latest record's time_in",
    philippineDateStr(new Date(g2.time_in)) === sD1, JSON.stringify(g2.time_in));

  await db.promise().query(
    "UPDATE attendance_logs SET time_out = ?, closed_by = 'user' WHERE id = ?",
    [`${sD1} 17:00:00`, rowC.insertId]
  );
  const g3 = await getStatus();
  check("S6b /status flips to OUT after the latest record closes (latest-record ordering)",
    g3.status === "OUT" && g3.time_in === null, JSON.stringify(g3));
  check("S6b /status keeps listing the forgotten day once the latest record closes",
    g3.no_timeout_days.includes(sD3) && !g3.no_timeout_days.includes(sD1),
    JSON.stringify(g3.no_timeout_days));

  check("S6b /status GETs created NO rows and NO current-day record",
    (await stCount()) === 3 && (await stTodayCount()) === 0,
    JSON.stringify({ count: await stCount(), today: await stTodayCount() }));
  srvSt.close();
  await db.promise().query("DELETE FROM employees WHERE id = ?", [stId]);
  const [[stLeft]] = await db.promise().query(
    "SELECT COUNT(*) AS c FROM attendance_logs WHERE employee_db_id = ?", [stId]);
  check("S6b fixture cleanup: no rows remain", Number(stLeft.c) === 0, JSON.stringify(stLeft));

  // ---- Cleanup ----
  await db.promise().query("DELETE FROM employees WHERE id IN (?, ?, ?)", [empId, emp2Id, adminId]);
  const [[left]] = await db.promise().query(
    "SELECT COUNT(*) AS c FROM attendance_logs WHERE employee_db_id IN (?, ?, ?)", [empId, emp2Id, adminId]);
  check("S7 cleanup: no test rows remain", Number(left.c) === 0, JSON.stringify(left));

  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }

  console.log(`\nTOTAL RESULT: ${pass} passed, ${fail} failed`);
  await db.pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

part2().catch((e) => {
  console.error("\nPART 2 ERROR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
