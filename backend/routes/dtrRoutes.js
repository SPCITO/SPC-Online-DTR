const express = require("express");
const router = express.Router();
const db = require("../config/db");

// TIME IN
router.post("/time-in", (req, res) => {
  const { employee_id } = req.body;
  const now = new Date();

  db.query(
    "INSERT INTO attendance_logs (employee_id, time_in) VALUES (?, ?)",
    [employee_id, now],
    (err) => {
      if (err) return res.status(500).json(err);
      res.json({ message: "Time In recorded", time: now });
    }
  );
});

// TIME OUT
router.post("/time-out", (req, res) => {
  const { employee_id } = req.body;
  const now = new Date();

  db.query(
    `UPDATE attendance_logs 
     SET time_out = ? 
     WHERE employee_id = ? 
     AND DATE(time_in) = CURDATE()`,
    [now, employee_id],
    (err) => {
      if (err) return res.status(500).json(err);
      res.json({ message: "Time Out recorded", time: now });
    }
  );
});

module.exports = router;