// ============================================================
// SPC Online DTR — 24-hour "No Time Out" notifier (payroll model).
//
// When a session passes its legitimate window (maxSessionHours from
// Time In) without a Time Out, the record becomes BLANK — "No Time
// Out" (time_out stays NULL, hours stay blank) and Time Out is
// hard-blocked for that session. This service sends the employee ONE
// professional notice that they must file a DTR Correction Form with
// the Payroll Department.
//
// Idempotence: attendance_logs.notice_sent_at marks the session as
// processed (email sent OR no email on file). The UPDATE is guarded by
// `notice_sent_at IS NULL`, so repeated/overlapping runs are safe.
//
// Email transport reuses timeoutReminder's SMTP configuration and its
// master automated-email switch (SMTP_REMINDERS_ENABLED).
// ============================================================

const db = require("../config/db");
const logSecurityEvent = require("../utils/securityLogger");
const { philippineDateStr } = require("../utils/phTime");
const { maxSessionHours } = require("../utils/attendanceCredit");
const { createTransport } = require("./timeoutReminder");

// ---------- Email Template ----------

function buildNoTimeOutEmail(employeeName, timeIn) {
  const timeStr = new Date(timeIn).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return {
    subject: "DTR Notice: Missing Time Out — Action Required",
    text: [
      `Dear ${employeeName},`,
      "",
      `This is to inform you that your attendance record with Time In on ${timeStr}`,
      "has no recorded Time Out. The system allows up to 24 hours from Time In to",
      "record a Time Out, and this period has already elapsed.",
      "",
      'As a result, the said record now shows "No Time Out" and no work hours were',
      "recorded for that day. Time Out can no longer be recorded through the system",
      "for this session.",
      "",
      "This only affects the said record — you can continue to record Time In and",
      "Time Out normally for your succeeding work days.",
      "",
      "To have this entry corrected, please accomplish a DTR Correction Form and",
      "submit it to the Payroll Department for processing.",
      "",
      "If you believe this notice was sent in error, please coordinate with the",
      "Payroll Department.",
      "",
      "This is an automated notice from the SPC Online DTR System.",
      "",
      "— SPC Online DTR",
    ].join("\n"),
  };
}

// ---------- Main Notice Logic ----------

async function runNoTimeOutNotices(now = new Date()) {
  if (process.env.SMTP_REMINDERS_ENABLED !== "1") {
    console.warn(
      "[No Time-Out] Automated employee emails disabled " +
        "(set SMTP_REMINDERS_ENABLED=1). Skipping."
    );
    return { sent: 0, noEmail: 0, errors: 0, reason: "emails_disabled" };
  }

  const transporter = createTransport();
  if (!transporter) {
    console.warn(
      "[No Time-Out] SMTP not configured (missing SMTP_HOST, SMTP_USER, or SMTP_PASSWORD). Skipping."
    );
    return { sent: 0, noEmail: 0, errors: 0, reason: "smtp_not_configured" };
  }

  const cutoff = new Date(now.getTime() - maxSessionHours() * 3600000);

  // Sessions past the window whose notice has not been processed yet.
  const [rows] = await db.promise().query(
    `SELECT al.id, al.employee_db_id, al.time_in, e.name, e.email
     FROM attendance_logs al
     JOIN employees e ON al.employee_db_id = e.id
     WHERE al.time_out IS NULL
       AND al.time_in < ?
       AND al.notice_sent_at IS NULL
       AND e.is_active = 1
     ORDER BY al.time_in ASC`,
    [cutoff]
  );

  if (rows.length === 0) {
    console.log("[No Time-Out] No sessions past the 24-hour window.");
    transporter.close();
    return { sent: 0, noEmail: 0, errors: 0, reason: "none" };
  }

  console.log(`[No Time-Out] ${rows.length} session(s) past the 24-hour window.`);

  let sent = 0;
  let noEmail = 0;
  let errors = 0;

  for (const row of rows) {
    const hasEmail = row.email && String(row.email).trim() !== "";

    if (!hasEmail) {
      // Nothing to send — mark processed so the row is not rescanned
      // forever. The record still shows "No Time Out" for admin handling.
      noEmail++;
      await markProcessed(row.id);
      console.log(`[No Time-Out] No email on file for ${row.name} (record #${row.id}).`);
      continue;
    }

    try {
      const email = buildNoTimeOutEmail(row.name, row.time_in);
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: row.email,
        subject: email.subject,
        text: email.text,
      });
      await markProcessed(row.id);
      sent++;
      console.log(`[No Time-Out] Notice sent to: ${row.name} (${row.email})`);
      logSecurityEvent({
        employee_id: row.employee_db_id,
        action_type: "NO_TIMEOUT_NOTICE_SENT",
        ip_address: "system",
        user_agent: "noTimeOutNotifier",
        session_id: `no-timeout:${philippineDateStr(now)}`,
      });
    } catch (err) {
      errors++;
      console.error(`[No Time-Out] Failed for ${row.name} (${row.email}):`, err.message);
      // Left unmarked → retried on the next run.
    }
  }

  transporter.close();

  console.log(
    `[No Time-Out] Complete — sent: ${sent}, no-email: ${noEmail}, errors: ${errors}`
  );
  return { sent, noEmail, errors };
}

/** Idempotent: only marks a session that is still unmarked. */
async function markProcessed(attendanceLogId) {
  await db.promise().query(
    `UPDATE attendance_logs SET notice_sent_at = NOW()
     WHERE id = ? AND notice_sent_at IS NULL`,
    [attendanceLogId]
  );
}

module.exports = { runNoTimeOutNotices, buildNoTimeOutEmail };
