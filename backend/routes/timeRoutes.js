const express = require("express");
const router = express.Router();

const db = require("../config/db");

// =====================================
// TIME IN
// =====================================
router.post("/time-in", async (req, res) => {
  const { employee_db_id } = req.body;

  try {
    const now = new Date();

    await db.query(
      `
      INSERT INTO attendance_logs
      (employee_db_id, time_in)
      VALUES (?, ?)
      `,
      [employee_db_id, now]
    );

    return res.json({
      success: true,
      message: "Time In recorded",
    });
  } catch (err) {
    console.error("TIME IN ERROR:", err);

    return res.status(500).json({
      message: "Time In failed",
    });
  }
});

// =====================================
// TIME OUT
// =====================================
router.post("/time-out", async (req, res) => {
  const { employee_db_id } = req.body;

  try {

    const [rows] = await db.query(
      `
      SELECT id
      FROM attendance_logs
      WHERE employee_db_id = ?
      AND time_out IS NULL
      ORDER BY time_in DESC
      LIMIT 1
      `,
      [employee_db_id]
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "No active time-in record found",
      });
    }

    await db.query(
      `
      UPDATE attendance_logs
      SET time_out = ?
      WHERE id = ?
      `,
      [new Date(), rows[0].id]
    );

    return res.json({
      success: true,
      message: "Time Out recorded",
    });

  } catch (err) {

    console.error("TIME OUT ERROR:", err);

    return res.status(500).json({
      message: "Time Out failed",
    });

  }
});

// =====================================
// STATUS
// =====================================
router.get("/status/:employee_db_id", async (req, res) => {

  const { employee_db_id } = req.params;

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
      [employee_db_id]
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