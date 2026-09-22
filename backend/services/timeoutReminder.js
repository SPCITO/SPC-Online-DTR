// ============================================================
// SPC Online DTR — 9:00 PM Timeout Reminder Service
//
// Sends an email to employees who timed in today but have
// not yet timed out. Runs daily at 9:00 PM Philippine time.
//
// Duplicate prevention: uses notification_log table with a
// UNIQUE constraint on (employee_id, notification_date).
// ============================================================

const nodemailer = require("nodemailer");
const db = require("../config/db");

// ---------- Philippine Time Helper ----------

function getPhilippineDate() {
  // Return today's date string in Asia/Manila timezone (YYYY-MM-DD)
  const now = new Date();
  const phDate = now.toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  });
  return phDate; // e.g. "2026-09-22"
}

// ---------- SMTP Transport ----------

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

// ---------- Email Template ----------

function buildReminderEmail(employeeName, timeIn) {
  const timeInStr = new Date(timeIn).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    subject: "DTR Reminder: Missing Time-Out",
    text: [
      `Dear ${employeeName},`,
      "",
      `Our records show that you timed in today at ${timeInStr} but have not yet recorded a time-out.`,
      "",
      "Please complete your time-out according to school procedure.",
      "",
      "This is an automated reminder from the SPC Online DTR System.",
      "",
      "— SPC Online DTR",
    ].join("\n"),
  };
}

// ---------- Main Reminder Logic ----------

async function runTimeoutReminder() {
  const today = getPhilippineDate();
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;

  console.log(`[Timeout Reminder] Running for date: ${today}`);

  // 1. Check SMTP configuration
  const transporter = createTransport();
  if (!transporter) {
    console.warn(
      "[Timeout Reminder] SMTP not configured (missing SMTP_HOST, SMTP_USER, or SMTP_PASSWORD). Skipping."
    );
    return { sent: 0, skipped: 0, errors: 0, reason: "smtp_not_configured" };
  }

  // 2. Find eligible employees:
  //    - timed in today (Philippine date)
  //    - time_out IS NULL
  //    - active employee
  //    - has usable email
  const [rows] = await db.promise().query(
    `SELECT al.id AS attendance_id,
            al.time_in,
            e.id AS employee_id,
            e.name,
            e.email
     FROM attendance_logs al
     JOIN employees e ON al.employee_db_id = e.id
     WHERE DATE(al.time_in) = ?
       AND al.time_in IS NOT NULL
       AND al.time_out IS NULL
       AND e.is_active = 1
       AND e.email IS NOT NULL
       AND TRIM(e.email) != ''
     GROUP BY e.id`,
    [today]
  );

  if (rows.length === 0) {
    console.log("[Timeout Reminder] No eligible employees found.");
    return { sent: 0, skipped: 0, errors: 0, reason: "no_eligible" };
  }

  console.log(
    `[Timeout Reminder] Found ${rows.length} eligible employee(s).`
  );

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  // 3. Process each eligible employee
  for (const row of rows) {
    try {
      // 3a. Attempt to claim the notification slot (duplicate prevention).
      //     INSERT IGNORE respects the UNIQUE(employee_id, notification_date)
      //     constraint — if already sent today, this is a no-op.
      const [claim] = await db.promise().query(
        `INSERT IGNORE INTO notification_log (employee_id, notification_date)
         VALUES (?, ?)`,
        [row.employee_id, today]
      );

      if (claim.affectedRows === 0) {
        // Already notified today — skip
        skipped++;
        continue;
      }

      // 3b. Send the reminder email
      const email = buildReminderEmail(row.name, row.time_in);
      await transporter.sendMail({
        from: fromAddress,
        to: row.email,
        subject: email.subject,
        text: email.text,
      });

      sent++;
      console.log(`[Timeout Reminder] Sent to: ${row.name} (${row.email})`);
    } catch (err) {
      errors++;
      console.error(
        `[Timeout Reminder] Failed for ${row.name} (${row.email}):`,
        err.message
      );

      // If the email send failed, remove the notification_log entry
      // so the scheduler can retry on next run (or manual trigger).
      try {
        await db.promise().query(
          `DELETE FROM notification_log
           WHERE employee_id = ? AND notification_date = ?`,
          [row.employee_id, today]
        );
      } catch (_) {
        // Ignore cleanup failure
      }
    }
  }

  // 4. Close the transport
  transporter.close();

  console.log(
    `[Timeout Reminder] Complete — sent: ${sent}, skipped: ${skipped}, errors: ${errors}`
  );
  return { sent, skipped, errors };
}

module.exports = { runTimeoutReminder };
