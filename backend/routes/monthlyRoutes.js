const express = require("express");
const router = express.Router();
const db = require("../config/db");

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
    const startDate = new Date(yr, mo - 1, 1);
    const endDate = new Date(yr, mo, 0, 23, 59, 59);

    const [results] = await db.promise().query(
      `SELECT id, time_in, time_out FROM attendance_logs
       WHERE employee_db_id = ?
       AND time_in >= ? AND time_in <= ?
       ORDER BY time_in ASC`,
      [employee_db_id, startDate, endDate]
    );

    // GROUP BY DAY
    const grouped = {};

    (results || []).forEach((log) => {
      const date = new Date(log.time_in).toISOString().split("T")[0];

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
      const hours =
        (new Date(d.last_out) - new Date(d.first_in)) /
        (1000 * 60 * 60);

      // Late detection: 8:30 AM cutoff (PHT = UTC+8)
      // mysql2 stores PHT times as UTC offsets, so extract PHT hours from UTC
      const phtHour = (new Date(d.first_in).getUTCHours() + 8) % 24;
      const phtMinute = new Date(d.first_in).getUTCMinutes();
      const isLate = phtHour > 8 || (phtHour === 8 && phtMinute > 30);

      return {
        date: d.date,
        first_in: d.first_in,
        last_out: d.last_out,
        hours: isNaN(hours) ? 0 : Number(hours.toFixed(2)),
        late: isLate,
      };
    });

    const total_hours = days.reduce(
      (sum, d) => sum + d.hours,
      0
    );

    const late_days = days.filter((d) => d.late).length;

    res.json({
      summary: {
        total_hours: total_hours.toFixed(2),
        late_days,
        total_days: days.length,
      },
      days,
    });
  } catch (err) {
    console.error("GET monthly logs error:", err);
    return res.status(500).json({ message: "Failed to fetch monthly report" });
  }
});

module.exports = router;
