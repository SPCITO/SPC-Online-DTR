const express = require("express");
const router = express.Router();
const db = require("../config/db");

const logSecurityEvent = require("../utils/securityLogger");

// ==========================
// TIME IN
// ==========================
router.post("/time-in", (req, res) => {
  const { employee_id } = req.body;

  const now = new Date();

  db.query(
    `
    INSERT INTO attendance_logs
    (employee_id, time_in)
    VALUES (?, ?)
    `,
    [employee_id, now],
    (err) => {
      if (err) {
        console.error(err);

        return res.status(500).json({
          message: "Time In failed",
        });
      }

      // 🔐 SECURITY LOG
      logSecurityEvent({
        employee_id,
        action_type: "TIME_IN",
        ip_address: req.ip,
        user_agent: req.headers["user-agent"],
        session_id: req.user?.session_id,
      });

      res.json({
        message: "Time In recorded",
        time: now,
      });
    }
  );
});

// ==========================
// TIME OUT
// ==========================
router.post("/time-out", (req, res) => {
  const { employee_id } = req.body;

  const now = new Date();

  db.query(
    `
    UPDATE attendance_logs
    SET time_out = ?
    WHERE employee_id = ?
    AND DATE(time_in) = CURDATE()
    `,
    [now, employee_id],
    (err) => {
      if (err) {
        console.error(err);

        return res.status(500).json({
          message: "Time Out failed",
        });
      }

      // 🔐 SECURITY LOG
      logSecurityEvent({
        employee_id,
        action_type: "TIME_OUT",
        ip_address: req.ip,
        user_agent: req.headers["user-agent"],
        session_id: req.user?.session_id,
      });

      res.json({
        message: "Time Out recorded",
        time: now,
      });
    }
  );
});

module.exports = router;