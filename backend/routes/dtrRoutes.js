const express = require("express");
const router = express.Router();
const db = require("../config/db");
const rateLimit = require("express-rate-limit");

const logSecurityEvent = require("../utils/securityLogger");
const { planTimeOut, planTimeIn } = require("../utils/attendanceCredit");

// Rate limiter for DTR: 10 requests per hour per authenticated user
// Keyed by user ID, not IP — safe for shared school Wi-Fi
const dtrLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { message: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id.toString(),
});

// ==========================
// TIME IN
// ==========================
router.post("/time-in", dtrLimiter, async (req, res) => {
  const employee_db_id = req.user.id;
  const now = new Date();

  try {
    // Session-window safeguards. Stored timestamps are unaffected: the
    // INSERT below still uses `now`, and the mysql2 driver serializes
    // with timezone "+08:00" (config/db.js).
    //
    // Use explicit transaction with SELECT...FOR UPDATE to prevent race conditions.
    // The FOR UPDATE acquires an exclusive lock on matching rows (or gap),
    // serializing concurrent time-in requests for the same employee.
    const conn = await db.pool.promise().getConnection();
    try {
      await conn.beginTransaction();

      // Lock ALL open records for this employee. A session still within
      // its legitimate window (e.g. an overnight shift) must be time-out
      // first. Expired sessions (past 24h) stay BLANK ("No Time Out") —
      // payroll model: nothing is ever written to them — and the new
      // Time In proceeds.
      const [openRows] = await conn.query(
        `SELECT id, time_in FROM attendance_logs
         WHERE employee_db_id = ?
         AND time_out IS NULL
         ORDER BY time_in ASC
         FOR UPDATE`,
        [employee_db_id]
      );

      // Shift-aware accumulation rules (planTimeIn):
      //   - open record from TODAY        → 409 (time out first)
      //   - previous day, within window   → 409 confirm_abandon unless the
      //     employee explicitly acknowledged (body.abandon_open) — protects
      //     a live overnight shift from a stray Time In
      //   - previous day, past the window → proceeds (definitely forgotten)
      // A FORGOTTEN TIME OUT NEVER BLOCKS THE NEXT WORK DAY (the DTR
      // Correction Form is slow — it must not be a prerequisite for Time
      // In). Abandoned records are intentionally left untouched: they stay
      // blank "No Time Out" records handled via the DTR Correction Form
      // procedure. Nothing is ever written to them.
      const plan = planTimeIn(
        openRows,
        now,
        req.body && req.body.abandon_open === true
      );

      if (plan.action === "blocked") {
        await conn.rollback();
        conn.release();
        return res.status(409).json({
          message: "You already have an open session. Please time out first.",
        });
      }

      if (plan.action === "confirm_abandon") {
        await conn.rollback();
        conn.release();
        return res.status(409).json({
          message:
            `You have an open session from ${plan.day} with no Time Out recorded. ` +
            "If you forgot to time out, confirm to start a new session — that record " +
            'will remain blank ("No Time Out") and must be corrected via a DTR ' +
            "Correction Form with the Payroll Department. If your shift is still " +
            "ongoing, please Time Out first.",
          previous_day_pending: true,
          day: plan.day,
        });
      }

      // No in-window open record — safe to insert
      const [result] = await conn.query(
        `INSERT INTO attendance_logs (employee_db_id, time_in) VALUES (?, ?)`,
        [employee_db_id, now]
      );

      await conn.commit();
      conn.release();

      if (result.affectedRows === 0) {
        return res.status(500).json({ message: "Time In failed" });
      }

      logSecurityEvent({
        employee_id: employee_db_id,
        action_type: "TIME_IN",
        ip_address: req.ip,
        user_agent: req.headers["user-agent"],
        session_id: req.user?.session_id,
      });

      res.json({
        message: "Time In recorded",
        time: now,
        abandoned_previous_days: plan.abandonDays,
      });
    } catch (txErr) {
      // Transaction failed — rollback and release connection
      try { await conn.rollback(); } catch (_) {}
      conn.release();
      throw txErr;
    }
  } catch (err) {
    console.error("TIME IN ERROR:", err);
    return res.status(500).json({
      message: "Time In failed",
    });
  }
});

// ==========================
// TIME OUT
// ==========================
router.post("/time-out", dtrLimiter, async (req, res) => {
  const employee_db_id = req.user.id;
  const now = new Date();

  try {
    // Find the latest open attendance record for this employee (scoped to authenticated user)
    const [rows] = await db.promise().query(
      `SELECT id, time_in FROM attendance_logs
       WHERE employee_db_id = ?
       AND time_out IS NULL
       ORDER BY time_in DESC
       LIMIT 1`,
      [employee_db_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: "No active time-in record found",
      });
    }

    // Payroll rule: once the 24-hour window passes, the record is
    // HARD-BLOCKED — nothing is ever written. The record stays blank
    // ("No Time Out") and the employee must file a DTR Correction Form.
    const plan = planTimeOut(rows[0].time_in, now);

    if (plan.action === "hard_block") {
      return res.status(409).json({
        message:
          `Your session from ${plan.day} has passed the 24-hour limit and can no longer be timed out. ` +
          "Please file a DTR Correction Form with the Payroll Department to correct this record.",
        no_time_out: true,
        attendance_date: plan.day,
      });
    }

    // Update only this employee's record (AND time_out IS NULL prevents double time-out)
    const [updateResult] = await db.promise().query(
      `UPDATE attendance_logs SET time_out = ? WHERE id = ? AND time_out IS NULL`,
      [now, rows[0].id]
    );

    if (updateResult.affectedRows === 0) {
      return res.status(409).json({
        message: "Already timed out",
      });
    }

    logSecurityEvent({
      employee_id: employee_db_id,
      action_type: "TIME_OUT",
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
      session_id: req.user?.session_id,
    });

    res.json({
      message: "Time Out recorded",
      time: now,
    });
  } catch (err) {
    console.error("TIME OUT ERROR:", err);
    return res.status(500).json({
      message: "Time Out failed",
    });
  }
});

module.exports = router;
