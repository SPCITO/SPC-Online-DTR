const express = require("express");
const router = express.Router();
const db = require("../config/db");

router.get("/", (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  const offset = (page - 1) * limit;

  db.query(
    "SELECT * FROM attendance_logs ORDER BY time_in DESC LIMIT ? OFFSET ?",
    [parseInt(limit), parseInt(offset)],
    (err, result) => {
      if (err) return res.status(500).json(err);
      res.json(result);
    }
  );
});

  // ✅ GET LOGS FOR CURRENT USER
  router.get("/me/:employee_id", (req, res) => {
    const { employee_id } = req.params;

    db.query(
      `SELECT * FROM attendance_logs 
      WHERE employee_id = ? 
      ORDER BY time_in DESC`,
      [employee_id],
      (err, result) => {
        if (err) {
          console.error("User logs error:", err);
          return res.status(500).json({ message: "Server error" });
        }

        res.json(result);
      }
    );
  });

  //MONTHLY LOGS
  router.get("/monthly/:employee_id", (req, res) => {
    const { employee_id } = req.params;

    db.query(
      `SELECT 
        DATE(time_in) as date,
        MIN(time_in) as first_in,
        MAX(time_out) as last_out
      FROM attendance_logs
      WHERE employee_id = ?
      AND MONTH(time_in) = MONTH(CURDATE())
      AND YEAR(time_in) = YEAR(CURDATE())
      GROUP BY DATE(time_in)
      ORDER BY date ASC`,
      [employee_id],
      (err, result) => {
        if (err) return res.status(500).json({ message: "Error" });

        let totalHours = 0;
        let lateDays = 0;

        const processed = result.map((r) => {
          let hours = 0;

          if (r.first_in && r.last_out) {
            hours =
              (new Date(r.last_out) - new Date(r.first_in)) /
              1000 /
              60 /
              60;

            totalHours += hours;
          }

          // late rule (8:30 AM)
          const inTime = new Date(r.first_in);
          const cutoff = new Date(r.first_in);
          cutoff.setHours(8, 30, 0);

          const isLate = inTime > cutoff;
          if (isLate) lateDays++;

          return {
            date: r.date,
            first_in: r.first_in,
            last_out: r.last_out,
            hours: hours.toFixed(2),
            late: isLate,
          };
        });

        res.json({
          days: processed,
          summary: {
            total_hours: totalHours.toFixed(2),
            total_days: processed.length,
            late_days: lateDays,
          },
        });
      }
    );
  });
  
module.exports = router;