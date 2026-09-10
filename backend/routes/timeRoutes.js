const express = require("express");
const router = express.Router();

const db = require("../config/db");

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

    const [rows] = await db.query(
      `
      SELECT
          id,
          time_in,
          time_out
      FROM attendance_logs
      WHERE employee_db_id = ?
      AND time_out IS NULL
      ORDER BY time_in DESC
      LIMIT 1
      `,
      [empId]
    );

    if (!rows.length) {

      return res.json({
        status: "OUT",
        time_in: null,
      });

    }

    return res.json({
      status: "IN",
      time_in: rows[0].time_in,
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