const express = require("express");
const router = express.Router();
const db = require("../config/db");

const verifyToken = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");

// ==========================
// 🔔 NOTIFICATION HISTORY (ADMIN ONLY)
// ==========================
// M.38c: read-only view of notification_log — the reminder dedup log
// written by services/timeoutReminder.js (one row per employee per day
// when a "Missing Time-Out" reminder is sent). Lets admins self-check
// who was reminded without needing outside help.
router.get("/", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    // Optional strict YYYY-MM-DD filter; anything else = no filter.
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "") ? req.query.date : null;
    const offset = (page - 1) * limit;

    const where = date ? " WHERE nl.notification_date = ?" : "";
    const params = date ? [date] : [];

    const [[{ total }]] = await db.promise().query(
      `SELECT COUNT(*) AS total FROM notification_log nl${where}`,
      params
    );

    // DATE_FORMAT keeps Manila wall-time strings (stored DATETIME/DATE are
    // Manila wall time) — avoids any JS timezone conversion.
    const [rows] = await db.promise().query(
      `SELECT nl.id,
              DATE_FORMAT(nl.notification_date, '%Y-%m-%d') AS notification_date,
              DATE_FORMAT(nl.sent_at, '%Y-%m-%d %H:%i:%s') AS sent_at,
              e.id AS employee_id, e.name, e.username, e.email
       FROM notification_log nl
       JOIN employees e ON nl.employee_id = e.id${where}
       ORDER BY nl.sent_at DESC, nl.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({
      rows: rows || [],
      total: total || 0,
      page,
      limit,
      hasMore: offset + (rows?.length || 0) < (total || 0),
    });
  } catch (err) {
    console.error("GET notifications error:", err);
    return res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

module.exports = router;
