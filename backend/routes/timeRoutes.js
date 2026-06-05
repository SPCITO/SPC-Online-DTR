const express = require("express");
const router = express.Router();

const db = require("../config/db");

// =====================================
// TIME IN
// =====================================
router.post("/time-in", (req, res) => {
  const { employee_db_id } = req.body;

  db.query(
    `
    INSERT INTO attendance_logs (employee_db_id, time_in)
    VALUES (?, NOW())
    `,
    [employee_db_id],
    (err) => {
      if (err) return res.status(500).json({ message: "Time In failed" });
      res.json({ message: "Time In recorded" });
    }
  );
});

// =====================================
// TIME OUT
// =====================================
router.post("/time-out", (req, res) => {
  const { employee_db_id } = req.body;

  db.query(
    `
    UPDATE attendance_logs
    SET time_out = NOW()
    WHERE employee_db_id = ?
    AND time_out IS NULL
    ORDER BY time_in DESC
    LIMIT 1
    `,
    [employee_db_id],
    (err) => {
      if (err) return res.status(500).json({ message: "Time Out failed" });
      res.json({ message: "Time Out recorded" });
    }
  );
});

// =====================================
// STATUS
// =====================================
router.get("/status/:employee_db_id", (req, res) => {
  const { employee_db_id } = req.params;

  db.query(
    `
    SELECT *

    FROM attendance_logs

    WHERE employee_db_id = ?
    AND time_out IS NULL

    ORDER BY time_in DESC
    LIMIT 1
    `,
    [employee_db_id],
    (err, result) => {
      if (err) {
        console.error(err);

        return res.status(500).json({
          message: "Status check failed",
        });
      }

      if (result.length === 0) {
        return res.json({
          status: "OUT",
          time_in: null,
        });
      }

      return res.json({
        status: "IN",
        time_in: result[0].time_in,
      });
    }
  );
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
