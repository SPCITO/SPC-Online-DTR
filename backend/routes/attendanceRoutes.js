// ============================================================
// SPC Online DTR — administrator Time Out correction (M.38).
//
// Narrowly scoped: ONE operation — correct the Time Out of ONE
// attendance record. No broad CRUD, no other fields are writable.
//
// Guarantees:
//  - Mounted behind verifyToken + requireRole("admin") (server.js) —
//    ordinary employees can never edit historical attendance.
//  - The corrected value is bounded to the record's own Manila
//    attendance day (time_in, 23:59:59] — a correction can not
//    recreate a multi-day duration.
//  - The PREVIOUS value (including an auto-generated one) is preserved
//    in attendance_corrections together with who corrected it and when.
//  - A security_logs audit event is written on every correction.
// ============================================================

const express = require("express");
const router = express.Router();
const db = require("../config/db");
const logSecurityEvent = require("../utils/securityLogger");
const { philippineDateStr } = require("../utils/phTime");
const { maxSessionHours } = require("../utils/attendanceCredit");

/**
 * Parse the accepted Time Out formats into an absolute instant:
 *  - "YYYY-MM-DD HH:MM:SS" (or "YYYY-MM-DDTHH:MM:SS") = Manila wall time
 *  - anything else must be a parseable ISO timestamp with offset.
 */
function parseTimeOut(raw) {
  const wall = String(raw)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (wall) {
    return new Date(
      `${wall[1]}-${wall[2]}-${wall[3]}T${wall[4]}:${wall[5]}:${wall[6]}+08:00`
    );
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

// GET /api/attendance/:id/corrections — ADMIN ONLY (middleware at mount)
// Read-only audit-trail view for one attendance record: every correction's
// original value, corrected value, who and when. Narrow on purpose — no
// broad CRUD.
router.get("/:id/corrections", async (req, res) => {
  const logId = parseInt(req.params.id, 10);
  if (isNaN(logId) || logId <= 0) {
    return res.status(400).json({ message: "Invalid attendance record ID" });
  }

  try {
    const [rows] = await db.promise().query(
      `SELECT c.id, c.attendance_log_id, c.old_time_out, c.new_time_out,
              c.corrected_by, c.corrected_at, e.name AS corrected_by_name
       FROM attendance_corrections c
       LEFT JOIN employees e ON e.id = c.corrected_by
       WHERE c.attendance_log_id = ?
       ORDER BY c.id ASC`,
      [logId]
    );
    return res.json(rows || []);
  } catch (err) {
    console.error("ATTENDANCE CORRECTIONS FETCH ERROR:", err);
    return res.status(500).json({ message: "Failed to fetch correction history" });
  }
});

// PUT /api/attendance/:id/time-out — ADMIN ONLY (middleware at mount)
router.put("/:id/time-out", async (req, res) => {
  const logId = parseInt(req.params.id, 10);
  if (isNaN(logId) || logId <= 0) {
    return res.status(400).json({ message: "Invalid attendance record ID" });
  }

  const raw = req.body ? req.body.time_out : undefined;
  if (!raw || typeof raw !== "string") {
    return res.status(400).json({
      message: "time_out is required (Manila wall time 'YYYY-MM-DD HH:MM:SS' or ISO timestamp)",
    });
  }

  const newTimeOut = parseTimeOut(raw);
  if (!newTimeOut) {
    return res.status(400).json({ message: "Invalid time_out timestamp" });
  }

  const conn = await db.pool.promise().getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id, employee_db_id, time_in, time_out, closed_by
       FROM attendance_logs WHERE id = ? FOR UPDATE`,
      [logId]
    );

    if (rows.length === 0) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ message: "Attendance record not found" });
    }

    const record = rows[0];
    const recordDay = philippineDateStr(new Date(record.time_in));

    // Correction bounds: strictly after Time In and within the legitimate
    // session window (maxSessionHours) — overnight duties (e.g. 21:00 →
    // 06:00 the next day) are correctable; multi-day spans are not.
    const minBound = new Date(record.time_in).getTime();
    const maxBound = minBound + maxSessionHours() * 3600000;
    const candidate = newTimeOut.getTime();

    if (candidate <= minBound) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({
        message: "time_out must be after the record's Time In",
      });
    }
    if (candidate > maxBound) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({
        message: `time_out must be within ${maxSessionHours()} hours after Time In (attendance date ${recordDay})`,
      });
    }

    // Preserve the previous value (including auto-generated ones),
    // who corrected it, and when.
    const [corr] = await conn.query(
      `INSERT INTO attendance_corrections
         (attendance_log_id, old_time_out, new_time_out, corrected_by)
       VALUES (?, ?, ?, ?)`,
      [logId, record.time_out, manilaDayEndFromInstant(newTimeOut), req.user.id]
    );

    await conn.query(
      `UPDATE attendance_logs SET time_out = ?, closed_by = 'admin'
       WHERE id = ?`,
      [manilaDayEndFromInstant(newTimeOut), logId]
    );

    await conn.commit();
    conn.release();

    logSecurityEvent({
      employee_id: req.user.id,
      action_type: "ATTENDANCE_TIME_OUT_CORRECTED",
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
      session_id: req.user?.session_id,
    });

    return res.json({
      message: "Time Out corrected",
      attendance: {
        id: logId,
        employee_db_id: record.employee_db_id,
        time_in: record.time_in,
        time_out: manilaDayEndFromInstant(newTimeOut),
        closed_by: "admin",
      },
      correction: {
        id: corr.insertId,
        old_time_out: record.time_out,
        new_time_out: manilaDayEndFromInstant(newTimeOut),
        corrected_by: req.user.id,
      },
    });
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    conn.release();
    console.error("ATTENDANCE CORRECTION ERROR:", err);
    return res.status(500).json({ message: "Time Out correction failed" });
  }
});

/**
 * Serialize an absolute instant as the DATETIME literal the app stores
 * (Manila wall time — matches mysql2 timezone "+08:00" semantics).
 */
function manilaDayEndFromInstant(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

module.exports = router;
