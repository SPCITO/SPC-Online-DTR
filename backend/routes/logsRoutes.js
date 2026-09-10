const express = require("express");
const router = express.Router();
const db = require("../config/db");

// ==========================
// GET ALL LOGS (ADMIN)
// ==========================
router.get("/", async (req, res) => {
  const { page = 1, limit = 10, search = "" } = req.query;
  const offset = (page - 1) * parseInt(limit);

  try {
    let sql = `
      SELECT al.id, al.time_in, al.time_out, al.employee_db_id,
             e.employee_id, e.role, d.fullname, d.groupno
      FROM attendance_logs al
      JOIN employees e ON al.employee_db_id = e.id
      LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user
    `;
    const params = [];

    if (search && search.trim() !== "") {
      sql += ` WHERE d.fullname LIKE ? OR al.employee_db_id = ?`;
      params.push(`%${search}%`, search);
    }

    sql += ` ORDER BY al.time_in DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const [rows] = await db.promise().query(sql, params);

    const transformed = (rows || []).map(log => ({
      id: log.id,
      time_in: log.time_in,
      time_out: log.time_out,
      employee_db_id: log.employee_db_id,
      employee_id: log.employee_id,
      role: log.role,
      name: log.fullname,
      department_id: log.groupno
    }));

    res.json(transformed);
  } catch (err) {
    console.error("GET logs error:", err);
    return res.status(500).json({ message: "Failed to fetch logs" });
  }
});

// ==========================
// GET USER LOGS
// ==========================
router.get("/me/:employee_db_id", async (req, res) => {
  const { employee_db_id } = req.params;

  // Ownership check: employees can only view their own logs
  if (parseInt(employee_db_id) !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  // Pagination with safe defaults and limits
  let page = Math.max(1, parseInt(req.query.page) || 1);
  let limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  try {
    // Get total count
    const [[{ total }]] = await db.promise().query(
      "SELECT COUNT(*) AS total FROM attendance_logs WHERE employee_db_id = ?",
      [employee_db_id]
    );

    const [rows] = await db.promise().query(
      `SELECT al.id, al.time_in, al.time_out, d.fullname, d.groupno
       FROM attendance_logs al
       JOIN employees e ON al.employee_db_id = e.id
       LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user
       WHERE al.employee_db_id = ?
       ORDER BY al.time_in DESC, al.id DESC
       LIMIT ? OFFSET ?`,
      [employee_db_id, limit, offset]
    );

    const logs = (rows || []).map(log => ({
      id: log.id,
      time_in: log.time_in,
      time_out: log.time_out,
      name: log.fullname,
      department_id: log.groupno
    }));

    res.json({
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("GET user logs error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ==========================
// MONTHLY LOGS (dead route — frontend uses /api/monthly/:id/:year/:month)
// Kept temporarily per migration decision; will be verified unused before removal.
// ==========================
router.get("/monthly/:employee_id", async (req, res) => {
  const { employee_id } = req.params;

  // Ownership check
  if (parseInt(employee_id) !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const [rows] = await db.promise().query(
      `SELECT al.id, al.time_in, al.time_out, al.employee_db_id,
              e.employee_id, e.role, d.fullname, d.groupno
       FROM attendance_logs al
       JOIN employees e ON al.employee_db_id = e.id
       LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user
       WHERE al.employee_db_id = ?
       ORDER BY al.time_in ASC`,
      [employee_id]
    );

    let totalHours = 0;
    let lateDays = 0;
    const grouped = {};

    (rows || []).forEach((r) => {
      const date = new Date(r.time_in).toISOString().split("T")[0];
      if (!grouped[date]) {
        grouped[date] = { date, first_in: r.time_in, last_out: r.time_out };
      }
      if (r.time_out) grouped[date].last_out = r.time_out;
    });

    const days = Object.values(grouped).map((d) => {
      let hours = 0;
      if (d.first_in && d.last_out) {
        hours = (new Date(d.last_out) - new Date(d.first_in)) / 1000 / 60 / 60;
        totalHours += hours;
      }
      const inTime = new Date(d.first_in);
      const cutoff = new Date(d.first_in);
      cutoff.setHours(8, 30, 0, 0);
      const isLate = inTime > cutoff;
      if (isLate) lateDays++;
      return { date: d.date, first_in: d.first_in, last_out: d.last_out, hours: hours.toFixed(2), late: isLate };
    });

    res.json({
      days,
      summary: { total_hours: totalHours.toFixed(2), total_days: days.length, late_days: lateDays },
    });
  } catch (err) {
    console.error("GET monthly logs error:", err);
    return res.status(500).json({ message: "Error" });
  }
});

module.exports = router;
