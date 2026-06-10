const express = require("express");
const router = express.Router();
const db = require("../config/db");

// ==========================
// GET ALL LOGS (ADMIN)
// ==========================
router.get("/", (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  db.query(
    `
    SELECT 
      l.id,
      l.time_in,
      l.time_out,

      e.id AS employee_db_id,
      e.employee_id,
      e.role,

      d.fullname AS name,
      d.groupno AS department_id

    FROM attendance_logs l

    LEFT JOIN employees e 
      ON l.employee_db_id = e.id

    LEFT JOIN dtr_user d 
      ON e.dtr_user_id = d.PK_user

    ORDER BY l.time_in DESC
    LIMIT ? OFFSET ?
    `,
    [parseInt(limit), parseInt(offset)],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "Failed to fetch logs" });
      }

      res.json(result);
    }
  );
});

// ==========================
// GET USER LOGS
// ==========================
router.get("/me/:employee_db_id", (req, res) => {
  const { employee_db_id } = req.params;

  db.query(
    `
    SELECT 
      l.id,
      l.time_in,
      l.time_out,

      d.fullname AS name,
      d.groupno AS department_id

    FROM attendance_logs l

    LEFT JOIN employees e
      ON l.employee_db_id = e.id

    LEFT JOIN dtr_user d
      ON e.dtr_user_id = d.PK_user

    WHERE l.employee_db_id = ?

    ORDER BY l.time_in DESC
    `,
    [employee_db_id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(result);
    }
  );
});

// ==========================
// MONTHLY LOGS (JOIN FIXED)
// ==========================
router.get("/monthly/:employee_id", (req, res) => {
  const { employee_id } = req.params;

  db.query(
    `
    SELECT
      l.id,
      l.time_in,
      l.time_out,

      e.id AS employee_db_id,
      e.employee_id,
      e.role,

      d.fullname AS name,
      d.groupno AS department_id

    FROM attendance_logs l

    LEFT JOIN employees e
      ON l.employee_db_id = e.id

    LEFT JOIN dtr_user d
      ON e.dtr_user_id = d.PK_user

    WHERE l.employee_db_id = ?

    ORDER BY l.time_in ASC
    `,
    [employee_id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Error" });

      let totalHours = 0;
      let lateDays = 0;

      const grouped = {};

      result.forEach((r) => {
        const date = new Date(r.time_in).toISOString().split("T")[0];

        if (!grouped[date]) {
          grouped[date] = {
            date,
            first_in: r.time_in,
            last_out: r.time_out,
          };
        }

        if (r.time_out) grouped[date].last_out = r.time_out;
      });

      const days = Object.values(grouped).map((d) => {
        let hours = 0;

        if (d.first_in && d.last_out) {
          hours =
            (new Date(d.last_out) - new Date(d.first_in)) /
            1000 /
            60 /
            60;

          totalHours += hours;
        }

        const inTime = new Date(d.first_in);
        const cutoff = new Date(d.first_in);
        cutoff.setHours(8, 30, 0);

        const isLate = inTime > cutoff;

        if (isLate) lateDays++;

        return {
          date: d.date,
          first_in: d.first_in,
          last_out: d.last_out,
          hours: hours.toFixed(2),
          late: isLate,
        };
      });

      res.json({
        days,
        summary: {
          total_hours: totalHours.toFixed(2),
          total_days: days.length,
          late_days: lateDays,
        },
      });
    }
  );
});

module.exports = router;