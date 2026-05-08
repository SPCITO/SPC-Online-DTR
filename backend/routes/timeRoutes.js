const express = require("express");
const router = express.Router();
const db = require("../config/db");

// ⏱ TIME IN
router.post("/in", (req, res) => {
  const { employee_id } = req.body;

  db.query(
    "INSERT INTO attendance_logs (employee_id, time_in) VALUES (?, NOW())",
    [employee_id],
    (err) => {
      if (err) return res.status(500).json({ message: "Time-in failed" });
      res.json({ message: "Time-in recorded" });
    }
  );
});

// ⏱ TIME OUT
router.post("/out", (req, res) => {
  const { employee_id } = req.body;

  db.query(
    `UPDATE attendance_logs 
     SET time_out = NOW() 
     WHERE employee_id = ? 
     AND time_out IS NULL 
     ORDER BY time_in DESC 
     LIMIT 1`,
    [employee_id],
    (err) => {
      if (err) return res.status(500).json({ message: "Time-out failed" });
      res.json({ message: "Time-out recorded" });
    }
  );
});

// ⏰ SERVER TIME
router.get("/", (req, res) => {
  res.json({ time: new Date().toISOString() });
});

// ✅ GET CURRENT STATUS
router.get("/status/:employee_id", (req, res) => {
  const { employee_id } = req.params;

  db.query(
    `SELECT * FROM attendance_logs 
     WHERE employee_id = ? 
     AND time_out IS NULL 
     ORDER BY time_in DESC 
     LIMIT 1`,
    [employee_id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Error" });

      if (result.length === 0) {
        return res.json({ status: "OUT", time_in: null });
      }

      return res.json({
        status: "IN",
        time_in: result[0].time_in,
      });
    }
  );
});

module.exports = router;