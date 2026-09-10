const express = require("express");
const router = express.Router();
const db = require("../config/db");
const rateLimit = require("express-rate-limit");

const logSecurityEvent = require("../utils/securityLogger");

// Rate limiter for DTR: 30 requests per hour per IP
// Allows normal use (2-4 time-in/out per day) plus some retries for mobile networks
const dtrLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  message: { message: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==========================
// TIME IN
// ==========================
router.post("/time-in", dtrLimiter, async (req, res) => {
  const employee_db_id = req.user.id;
  const now = new Date();

  try {
    // Atomic duplicate prevention: INSERT only succeeds if no open record exists today
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const [result] = await db.promise().query(
      `INSERT INTO attendance_logs (employee_db_id, time_in)
       SELECT ?, ? FROM DUAL
       WHERE NOT EXISTS (
         SELECT 1 FROM attendance_logs
         WHERE employee_db_id = ?
         AND time_in >= ? AND time_in <= ?
         AND time_out IS NULL
         LIMIT 1
       )`,
      [employee_db_id, now, employee_db_id, startOfDay, endOfDay]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        message: "Already timed in today. Please time out first.",
      });
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
    });
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
      `SELECT id FROM attendance_logs
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
