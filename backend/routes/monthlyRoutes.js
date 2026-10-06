const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { philippineDateStr, manilaMonthRange } = require("../utils/phTime");
const { getCreditPolicy, isExpired } = require("../utils/attendanceCredit");

// GET MONTHLY LOGS
router.get("/:employee_db_id/:year/:month", async (req, res) => {
  const { employee_db_id, year, month } = req.params;

  // Validate numeric params
  const empId = parseInt(employee_db_id);
  const yr = parseInt(year);
  const mo = parseInt(month);
  if (isNaN(empId) || empId <= 0) {
    return res.status(400).json({ message: "Invalid employee ID" });
  }
  if (isNaN(yr) || yr < 2000 || yr > 2100) {
    return res.status(400).json({ message: "Invalid year" });
  }
  if (isNaN(mo) || mo < 1 || mo > 12) {
    return res.status(400).json({ message: "Invalid month" });
  }

  // Ownership check: employees can only view their own monthly data
  if (empId !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    // M.39 H1b: Manila calendar-month window — rolls at 00:00 Asia/Manila
    // (previously UTC-calendar bounds rolled at 08:00 PHT). Bounds stay
    // bound as Date params; stored timestamps and db.js "+08:00" are untouched.
    const { start: startDate, end: endDate } = manilaMonthRange(yr, mo);

    const [results] = await db.promise().query(
      `SELECT id, time_in, time_out, closed_by FROM attendance_logs
       WHERE employee_db_id = ?
       AND time_in >= ? AND time_in <= ?
       ORDER BY time_in ASC`,
      [employee_db_id, startDate, endDate]
    );

    // GROUP BY DAY
    const grouped = {};

    (results || []).forEach((log) => {
      // M.39 H1b: bucket by Manila calendar date (previously the UTC date
      // via toISOString() misfiled pre-08:00 PHT rows to the previous day).
      const date = philippineDateStr(new Date(log.time_in));

      if (!grouped[date]) {
        grouped[date] = {
          date,
          logs: [],
          first_in: log.time_in,
          last_out: log.time_out,
        };
      }

      grouped[date].logs.push(log);

      if (log.time_out) {
        grouped[date].last_out = log.time_out;
      }
    });

    const days = Object.values(grouped).map((d) => {
      // Auto-timeout: keep closure sources distinguishable — an AUTO day
      // carries a system-generated boundary Time Out and must never look
      // identical to a genuine employee Time Out.
      const hasAuto = d.logs.some((l) => l.closed_by === "auto");
      const hasAdmin = d.logs.some((l) => l.closed_by === "admin");
      // Blank expired session ("No Time Out") — payroll model: no hours.
      const hasNoTimeOut =
        d.logs.some((l) => !l.time_out && isExpired(l.time_in)) &&
        !d.logs.some((l) => l.time_out);
      const status = hasNoTimeOut
        ? "NO TIME-OUT"
        : hasAuto
        ? "AUTO"
        : hasAdmin
        ? "ADMIN-CORRECTED"
        : "USER";

      // Credit policy: under the default "pending" policy an auto-closed
      // day is credited NO hours until an admin corrects it — the value is
      // withheld (null), never fabricated. "bounded"/"fixed" are explicit
      // school policies (utils/attendanceCredit).
      const pending = hasAuto && getCreditPolicy() === "pending";

      // Open sessions (time_out IS NULL) contribute 0 hours — otherwise
      // new Date(null) = 1970 yields absurd negative totals. Matches the
      // export behavior (r.time_out ? … : 0).
      const hours = d.last_out
        ? (new Date(d.last_out) - new Date(d.first_in)) / (1000 * 60 * 60)
        : 0;

      return {
        date: d.date,
        first_in: d.first_in,
        last_out: d.last_out,
        hours: pending || hasNoTimeOut ? null : isNaN(hours) ? 0 : Number(Math.max(0, hours).toFixed(2)),
        status,
        pending,
        no_time_out: hasNoTimeOut,
      };
    });

    // Totals cover determined days only; pending days are counted, not guessed.
    const determined = days.filter((d) => !d.pending);
    const total_hours = determined.reduce((sum, d) => sum + (d.hours || 0), 0);

    const pending_days = days.filter((d) => d.pending).length;

    res.json({
      summary: {
        total_hours: total_hours.toFixed(2),
        total_days: days.length,
        pending_days,
      },
      days,
    });
  } catch (err) {
    console.error("GET monthly logs error:", err);
    return res.status(500).json({ message: "Failed to fetch monthly report" });
  }
});

module.exports = router;
