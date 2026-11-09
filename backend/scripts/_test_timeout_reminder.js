// ============================================================
// M.85 — 9:00 PM timeout reminder eligibility regression suite.
//
// The defect: the reminder selected open sessions REGARDLESS OF AGE,
// so a forgotten Time Out row (which can never be closed again — the
// Time Out route hard-blocks past maxSessionHours()) produced a daily
// "please complete your time-out" email forever, contradicting the
// one-time no-time-out notice.
//
// PART 1: deterministic pure tests (NO database, NO email).
//   - reminder-eligible boundary == planTimeOut "user_close" boundary
//   - the cutoff honors ATTENDANCE_MAX_SESSION_HOURS (same authoritative
//     rule as attendanceCredit — no duplicated hard-coded age)
//   - email template wording preserved (M.38b "today" vs "on <date>")
//
// PART 2: local scratch DB integration (guarded like _test_no_timeout.js).
//   Mail transport is MOCKED — no real email is ever sent.
//   - same-day session   → reminded
//   - abandoned + notice_sent_at set → NOT re-reminded
//   - abandoned unmarked past window → NOT reminded (the regression)
//   - exact cutoff instant → still reminded (matches planTimeOut)
//   - just past cutoff     → not reminded
//   - Manila-local date drives the dedup key and the wording
//   - daily deduplication (notification_log) intact
//   - one abandoned session does not suppress a separate eligible one
//   - missing email / inactive employee handling preserved
//   - send failure keeps the row retriable and never touches notice_sent_at
// ============================================================

const {
  planTimeOut,
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

// The SQL eligibility condition under test (services/timeoutReminder.js):
// a session is remindable while now <= time_in + maxSessionHours(),
// i.e. time_in >= now - maxSessionHours(). Exactly the user_close side
// of planTimeOut — a session the employee can STILL time out.
function remindable(timeIn, now = new Date()) {
  return new Date(timeIn).getTime() >= now.getTime() - maxSessionHours() * 3600000;
}

// ============================================================
// PART 1 — PURE DETERMINISTIC TESTS
// ============================================================
console.log("\n===== PART 1: pure deterministic tests =====");

// ---- Cutoff boundary must equal the planTimeOut user_close boundary ----
{
  const now = new Date("2026-07-15T21:00:00+08:00");

  const cases = [
    ["2026-07-15T08:00:00+08:00", true, "same-day session (13h)"],
    ["2026-07-14T21:00:01+08:00", true, "just INSIDE the cutoff (23h59m59s)"],
    ["2026-07-14T21:00:00+08:00", true, "EXACTLY the cutoff instant (24h)"],
    ["2026-07-14T20:59:59+08:00", false, "just PAST the cutoff (24h + 1s)"],
    ["2026-07-13T08:00:00+08:00", false, "abandoned 2 days ago"],
    ["2026-07-15T20:00:00+08:00", true, "overnight-window session (1h)"],
  ];

  for (const [t, expect, label] of cases) {
    const plan = planTimeOut(t, now);
    const expectedAction = expect ? "user_close" : "hard_block";
    check(`boundary ${label}: remindable === ${expect}`,
      remindable(t, now) === expect, JSON.stringify({ t, plan }));
    check(`boundary ${label}: matches planTimeOut ${expectedAction}`,
      plan.action === expectedAction, JSON.stringify(plan));
    check(`boundary ${label}: matches isExpired ${!expect}`,
      isExpired(t, now) === !expect);
  }
}

// ---- The cutoff follows the authoritative env knob, not a hard-coded 24 ----
{
  const prev = process.env.ATTENDANCE_MAX_SESSION_HOURS;
  process.env.ATTENDANCE_MAX_SESSION_HOURS = "8";
  const now = new Date("2026-07-15T21:00:00+08:00");
  check("custom 8h window: 7h-old session still remindable",
    remindable("2026-07-15T14:00:00+08:00", now) === true &&
    planTimeOut("2026-07-15T14:00:00+08:00", now).action === "user_close");
  check("custom 8h window: 9h-old session NOT remindable",
    remindable("2026-07-15T12:00:00+08:00", now) === false &&
    planTimeOut("2026-07-15T12:00:00+08:00", now).action === "hard_block");
  if (prev === undefined) delete process.env.ATTENDANCE_MAX_SESSION_HOURS;
  else process.env.ATTENDANCE_MAX_SESSION_HOURS = prev;
}

// ---- Email template wording preserved (M.38b) ----
{
  const { buildReminderEmail } = require("../services/timeoutReminder");
  const now = new Date("2026-07-15T21:00:00+08:00");

  const sameDay = buildReminderEmail("JUAN DELA CRUZ", "2026-07-15T08:00:00+08:00", now);
  check("same-day reminder wording unchanged",
    sameDay.subject === "DTR Reminder: Missing Time-Out" &&
    sameDay.text.includes("today (July 15, 2026)") &&
    sameDay.text.includes("Please complete your time-out according to school procedure.") &&
    sameDay.text.includes("— SPC Online DTR"),
    sameDay.subject);

  const overnight = buildReminderEmail("JUAN DELA CRUZ", "2026-07-14T22:00:00+08:00", now);
  check("M.38b: earlier-day session says \"on <date>\", never \"today\"",
    overnight.text.includes("on July 14, 2026") && !overnight.text.includes("today ("),
    overnight.text.split("\n")[2]);
}

console.log(`\nPART 1 RESULT: ${pass} passed, ${fail} failed`);

// ============================================================
// PART 2 — LOCAL SCRATCH DB INTEGRATION (guarded, mocked mail)
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

  console.log("\n===== PART 2: local scratch DB integration (mocked mail) =====");

  const nodemailer = require("nodemailer");
  const db = require("../config/db");

  // ---- Mocked mail transport: records sends, never sends real email ----
  const realCreateTransport = nodemailer.createTransport;
  const sends = [];
  const failing = new Set();
  nodemailer.createTransport = () => ({
    sendMail: async (opts) => {
      if (failing.has(opts.to)) throw new Error("simulated SMTP failure");
      sends.push(opts);
      return { messageId: "mock" };
    },
    close: () => {},
  });

  const savedEnv = {
    SMTP_REMINDERS_ENABLED: process.env.SMTP_REMINDERS_ENABLED,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    ATTENDANCE_MAX_SESSION_HOURS: process.env.ATTENDANCE_MAX_SESSION_HOURS,
  };
  process.env.SMTP_REMINDERS_ENABLED = "1";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "2525";
  process.env.SMTP_USER = "mock";
  process.env.SMTP_PASSWORD = "mock";
  delete process.env.ATTENDANCE_MAX_SESSION_HOURS;

  try {
    const { runTimeoutReminder } = require("../services/timeoutReminder");

    // ---- Local schema setup (idempotent, additive — like _test_no_timeout.js) ----
    const [ncol] = await db.promise().query(
      "SHOW COLUMNS FROM attendance_logs LIKE 'notice_sent_at'"
    );
    if (ncol.length === 0) {
      await db.promise().query(
        "ALTER TABLE attendance_logs ADD COLUMN notice_sent_at DATETIME NULL DEFAULT NULL AFTER closed_by"
      );
      console.log("  [setup] added attendance_logs.notice_sent_at to LOCAL schema");
    }
    await db.promise().query(
      `CREATE TABLE IF NOT EXISTS notification_log (
        id INT NOT NULL AUTO_INCREMENT,
        employee_id INT NOT NULL,
        notification_date DATE NOT NULL,
        sent_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_employee_date (employee_id, notification_date),
        CONSTRAINT notification_log_ibfk_1
          FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`
    );

    // ---- Deterministic fixed instants (whole seconds, no ms) ----
    // now = Wed 2026-07-15 21:00:00 PHT; cutoff = 2026-07-14 21:00:00 PHT.
    // The fixed past date keeps the scan away from any real rows in the
    // scratch DB (which are dated around the real current date).
    const now = new Date("2026-07-15T21:00:00+08:00");
    const now2 = new Date("2026-07-16T01:00:00+08:00"); // next Manila day, 05:00 UTC
    const today = "2026-07-15";
    const today2 = "2026-07-16";

    // ---- Seed fixtures ----
    await db.promise().query("DELETE FROM employees WHERE username LIKE 'zz.tr.%'");
    await db.promise().query("DELETE FROM notification_log WHERE notification_date IN (?, ?)", [today, today2]);

    const mkEmp = async (tag, email, active = 1) => {
      const [ins] = await db.promise().query(
        `INSERT INTO employees (name, username, email, password, role, is_active, must_change_password)
         VALUES (?, ?, ?, 'x', 'employee', ?, 0)`,
        [`ZZ TR ${tag.toUpperCase()}`, `zz.tr.${tag}`, email, active]
      );
      return ins.insertId;
    };

    const idSame = await mkEmp("same", "zz.tr.same@local.test");
    const idStale = await mkEmp("stale", "zz.tr.stale@local.test");
    const idMarked = await mkEmp("marked", "zz.tr.marked@local.test");
    const idEdge = await mkEmp("edge", "zz.tr.edge@local.test");
    const idInside = await mkEmp("inside", "zz.tr.inside@local.test");
    const idOut = await mkEmp("out", "zz.tr.out@local.test");
    const idMulti = await mkEmp("multi", "zz.tr.multi@local.test");
    const idNoEmail = await mkEmp("noemail", null);
    const idInactive = await mkEmp("inactive", "zz.tr.inactive@local.test", 0);
    const idFail = await mkEmp("fail", "zz.tr.fail@local.test");
    const idManila = await mkEmp("manila", "zz.tr.manila@local.test");

    const mkLog = (empId, timeIn) =>
      db.promise().query(
        "INSERT INTO attendance_logs (employee_db_id, time_in) VALUES (?, ?)",
        [empId, timeIn]
      );

    const [rowSame] = await mkLog(idSame, "2026-07-15 08:00:00");          // 13h — eligible
    const [rowStale] = await mkLog(idStale, "2026-07-13 08:00:00");        // 61h — abandoned, unmarked
    const [rowMarked] = await mkLog(idMarked, "2026-07-13 08:00:00");      // 61h — abandoned, notice_sent_at set
    await db.promise().query(
      "UPDATE attendance_logs SET notice_sent_at = ? WHERE id = ?",
      ["2026-07-14 01:00:00", rowMarked.insertId]
    );
    const [rowEdge] = await mkLog(idEdge, "2026-07-14 21:00:00");          // EXACTLY 24h — user_close side
    const [rowInside] = await mkLog(idInside, "2026-07-14 21:00:05");      // 23h59m55s — just inside
    const [rowOut] = await mkLog(idOut, "2026-07-14 20:59:59");            // 24h + 1s — just outside
    const [rowMultiOld] = await mkLog(idMulti, "2026-07-13 08:00:00");     // abandoned row (must NOT suppress)
    const [rowMultiNew] = await mkLog(idMulti, "2026-07-15 09:00:00");     // eligible row
    await mkLog(idNoEmail, "2026-07-15 08:00:00");
    await mkLog(idInactive, "2026-07-15 08:00:00");
    await mkLog(idFail, "2026-07-15 08:00:00");
    await mkLog(idManila, "2026-07-15 20:00:00");                          // 5h before now2

    const toCount = (email) => sends.filter((s) => s.to === email).length;
    const toMails = (email) => sends.filter((s) => s.to === email);

    // ============================================================
    // R1 — first run at `now` (2026-07-15 21:00 PHT)
    // ============================================================
    failing.add("zz.tr.fail@local.test");
    const before1 = sends.length;
    const r1 = await runTimeoutReminder(now);
    const run1Sends = sends.slice(before1);

    check("R1 same-day session receives the normal reminder",
      toCount("zz.tr.same@local.test") === 1, JSON.stringify(r1));
    check("R1 abandoned session WITH notice_sent_at is not re-reminded",
      toCount("zz.tr.marked@local.test") === 0, JSON.stringify(run1Sends.length));
    check("R1 REGRESSION: abandoned unmarked session past window gets NO daily reminder",
      toCount("zz.tr.stale@local.test") === 0, JSON.stringify(run1Sends.length));
    check("R1 session exactly at the cutoff instant is still remindable (user_close side)",
      toCount("zz.tr.edge@local.test") === 1);
    check("R1 session just INSIDE the cutoff is remindable",
      toCount("zz.tr.inside@local.test") === 1);
    check("R1 session just PAST the cutoff is NOT remindable",
      toCount("zz.tr.out@local.test") === 0);
    check("R1 inactive employee gets no reminder",
      toCount("zz.tr.inactive@local.test") === 0);
    check("R1 employee without email gets no reminder (and no error)",
      toCount(null) === 0 && toCount("zz.tr.noemail@local.test") === 0);
    check("R1 send failure is counted as error, nothing recorded as sent",
      r1.errors >= 1 && toCount("zz.tr.fail@local.test") === 0, JSON.stringify(r1));

    // Multiple sessions per employee: the abandoned one must not suppress
    // the eligible one; the reminder must reference the ELIGIBLE session.
    const multiMails = toMails("zz.tr.multi@local.test");
    check("R1 abandoned + eligible session for one employee → exactly one reminder",
      multiMails.length === 1, JSON.stringify(multiMails.length));
    check("R1 that reminder references the ELIGIBLE session, not the abandoned one",
      multiMails.length === 1 &&
      multiMails[0].text.includes("July 15, 2026") &&
      !multiMails[0].text.includes("July 13"),
      multiMails.length === 1 ? multiMails[0].text.split("\n")[2] : "");

    // One-time notifier semantics untouched: the reminder must never write
    // notice_sent_at (it is owned exclusively by noTimeOutNotifier).
    const [[staleRow]] = await db.promise().query(
      "SELECT notice_sent_at FROM attendance_logs WHERE id = ?", [rowStale.insertId]
    );
    const [[markedRow]] = await db.promise().query(
      "SELECT notice_sent_at FROM attendance_logs WHERE id = ?", [rowMarked.insertId]
    );
    check("R1 reminder never writes notice_sent_at (unmarked stays NULL)",
      staleRow.notice_sent_at === null, JSON.stringify(staleRow));
    check("R1 reminder never rewrites notice_sent_at (marked keeps its value)",
      markedRow.notice_sent_at !== null &&
      new Date(markedRow.notice_sent_at).getTime() === new Date("2026-07-14T01:00:00+08:00").getTime(),
      JSON.stringify(markedRow));

    // Failed sends must not consume the daily slot (retry next run).
    const [[failClaim]] = await db.promise().query(
      "SELECT COUNT(*) AS c FROM notification_log WHERE employee_id = ? AND notification_date = ?",
      [idFail, today]
    );
    check("R1 failed send leaves no dedup claim (retriable next run)",
      Number(failClaim.c) === 0, JSON.stringify(failClaim));
    const [[okClaim]] = await db.promise().query(
      "SELECT COUNT(*) AS c FROM notification_log WHERE employee_id = ? AND notification_date = ?",
      [idSame, today]
    );
    check("R1 successful send claims the daily slot (notification_log)",
      Number(okClaim.c) === 1, JSON.stringify(okClaim));

    // The simulated SMTP outage is over — the retry must now succeed.
    failing.delete("zz.tr.fail@local.test");

    // ============================================================
    // R2 — same `now` again: daily deduplication must suppress every
    // recipient except the one whose send failed (retry behavior).
    // ============================================================
    const before2 = sends.length;
    const r2 = await runTimeoutReminder(now);
    check("R2 same-day rerun sends no duplicate reminders (daily dedup)",
      toCount("zz.tr.same@local.test") === 1 && r2.skipped >= 1,
      JSON.stringify({ r2, newSends: sends.length - before2 }));
    check("R2 failed recipient is retried on the next run",
      toCount("zz.tr.fail@local.test") === 1, JSON.stringify(r2));
    check("R2 retried send now claims the daily slot",
      Number((await db.promise().query(
        "SELECT COUNT(*) AS c FROM notification_log WHERE employee_id = ? AND notification_date = ?",
        [idFail, today]
      ))[0][0].c) === 1);

    // ============================================================
    // R3 — next Manila day (now2): Manila-local date drives both the
    // dedup key and the wording; the old rows stay silent.
    // ============================================================
    const before3 = sends.length;
    const r3 = await runTimeoutReminder(now2);
    const run3Sends = sends.slice(before3);

    check("R3 REGRESSION: abandoned rows stay silent on the next day too",
      toCount("zz.tr.stale@local.test") === 0 && toCount("zz.tr.marked@local.test") === 0,
      JSON.stringify(run3Sends.length));
    check("R3 stale rows contribute no send across days",
      !run3Sends.some((s) => s.to === "zz.tr.stale@local.test" || s.to === "zz.tr.marked@local.test"));

    const manilaMails = run3Sends.filter((s) => s.to === "zz.tr.manila@local.test");
    check("R3 in-window previous-day session is reminded on the new day",
      manilaMails.length === 1, JSON.stringify(manilaMails.length));
    check("R3 M.38b wording: previous-day session says \"on July 15\", not \"today\"",
      manilaMails.length === 1 &&
      manilaMails[0].text.includes("on July 15, 2026") &&
      !manilaMails[0].text.includes("today ("),
      manilaMails.length === 1 ? manilaMails[0].text.split("\n")[2] : "");
    const [[manilaClaim]] = await db.promise().query(
      `SELECT DATE_FORMAT(notification_date, '%Y-%m-%d') AS d
       FROM notification_log WHERE employee_id = ? AND notification_date = ?`,
      [idManila, today2]
    );
    check("R3 dedup key uses the MANILA date (2026-07-16), not the UTC date (2026-07-15)",
      manilaClaim && manilaClaim.d === today2, JSON.stringify(manilaClaim));
    check("R3 new day re-reminds an open in-window session (daily cadence preserved)",
      run3Sends.filter((s) => s.to === "zz.tr.same@local.test").length === 1, JSON.stringify(r3));

    // ============================================================
    // Cleanup — remove fixtures and every scratch row this run created.
    // ============================================================
    await db.promise().query(
      "DELETE FROM attendance_logs WHERE id IN (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [rowSame.insertId, rowStale.insertId, rowMarked.insertId, rowEdge.insertId,
       rowInside.insertId, rowOut.insertId, rowMultiOld.insertId, rowMultiNew.insertId, 0]
    );
    await db.promise().query("DELETE FROM employees WHERE username LIKE 'zz.tr.%'");
    await db.promise().query("DELETE FROM notification_log WHERE notification_date IN (?, ?)", [today, today2]);

    const [[leftEmp]] = await db.promise().query(
      "SELECT COUNT(*) AS c FROM employees WHERE username LIKE 'zz.tr.%'"
    );
    const [[leftLogs]] = await db.promise().query(
      "SELECT COUNT(*) AS c FROM attendance_logs WHERE employee_db_id = ?",
      [idSame]
    );
    check("cleanup: no zz.tr.* fixtures remain", Number(leftEmp.c) === 0, JSON.stringify(leftEmp));
    check("cleanup: no fixture attendance rows remain", Number(leftLogs.c) === 0, JSON.stringify(leftLogs));
    check("cleanup: mocked transport created no real email", true);
  } finally {
    nodemailer.createTransport = realCreateTransport;
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    await db.pool.end();
  }

  console.log(`\nTOTAL RESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

part2().catch((e) => {
  console.error("\nPART 2 ERROR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
