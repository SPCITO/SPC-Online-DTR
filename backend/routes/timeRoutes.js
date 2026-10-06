const express = require("express");
const router = express.Router();

const db = require("../config/db");
const { philippineDateStr } = require("../utils/phTime");
const { maxSessionHours, isExpired } = require("../utils/attendanceCredit");

// NOTE: POST /time-in and POST /time-out were removed.
// Time-in/out is handled by dtrRoutes.js (uses req.user.id, has duplicate prevention).
// Frontend calls /api/dtr/time-in and /api/dtr/time-out.

// =====================================
// STATUS — used by frontend dashboard
// =====================================
router.get("/status/:employee_db_id", async (req, res) => {

  const empId = parseInt(req.params.employee_db_id);
  if (isNaN(empId) || empId <= 0) {
    return res.status(400).json({ message: "Invalid employee ID" });
  }

  // Ownership check: employees can only check their own status
  if (empId !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {

    // Latest record decides IN/OUT — an older forgotten record must never
    // render the employee as still "IN" after a newer session was properly
    // timed out. All open records are also listed so the employee can see
    // which days are blank "No Time Out" and need a DTR Correction Form.
    const [latestRows] = await db.query(
      `SELECT id, time_in, time_out
       FROM attendance_logs
       WHERE employee_db_id = ?
       ORDER BY time_in DESC, id DESC
       LIMIT 1`,
      [empId]
    );
    const [openRows] = await db.query(
      `SELECT id, time_in
       FROM attendance_logs
       WHERE employee_db_id = ?
       AND time_out IS NULL
       ORDER BY time_in ASC`,
      [empId]
    );

    const todayStr = philippineDateStr(new Date());
    const noTimeoutDays = [];
    for (const r of openRows) {
      const isLatest = latestRows.length > 0 && r.id === latestRows[0].id;
      // A record is a "No Time Out" day when it is abandoned (a newer
      // record exists) or forgotten (past the legitimate window). A live
      // session — the latest record, still within its window — is neither.
      if (!isLatest || isExpired(r.time_in)) {
        noTimeoutDays.push(philippineDateStr(new Date(r.time_in)));
      }
    }

    if (!latestRows.length || latestRows[0].time_out) {
      return res.json({
        status: "OUT",
        time_in: null,
        no_timeout_days: noTimeoutDays,
      });
    }

    // Shift-aware staleness: a session is stale only when it has stayed
    // open BEYOND the legitimate session window — overnight shifts (e.g.
    // 21:00 → 06:00) are normal and are not flagged.
    const openDay = philippineDateStr(new Date(latestRows[0].time_in));
    const startMs = new Date(latestRows[0].time_in).getTime();
    const expired = Date.now() > startMs + maxSessionHours() * 3600000;

    return res.json({
      status: "IN",
      time_in: latestRows[0].time_in,
      open_from: openDay,
      stale: expired,
      expired,
      previous_day: openDay !== todayStr,
      no_timeout_days: noTimeoutDays,
    });

  } catch (err) {

    console.error("STATUS ERROR:", err);

    return res.status(500).json({
      message: "Status check failed",
    });

  }

});

// =====================================
// SERVER TIME
// =====================================
router.get("/", (req, res) => {

  res.json({
    time: new Date().toISOString(),
  });

});

module.exports = router;