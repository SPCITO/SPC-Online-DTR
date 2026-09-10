const express = require("express");
const router = express.Router();
const db = require("../config/db");
const requireRole = require("../middleware/requireRole");

// ==========================
// GET ALL LOGS (ADMIN ONLY)
// ==========================
router.get("/", requireRole("admin"), async (req, res) => {
  let page = Math.max(1, parseInt(req.query.page) || 1);
  let limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const search = req.query.search || "";
  const offset = (page - 1) * limit;

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
      const searchNum = parseInt(search);
      if (!isNaN(searchNum)) {
        sql += ` WHERE d.fullname LIKE ? OR al.employee_db_id = ?`;
        params.push(`%${search}%`, searchNum);
      } else {
        sql += ` WHERE d.fullname LIKE ?`;
        params.push(`%${search}%`);
      }
    }

    sql += ` ORDER BY al.time_in DESC, al.id DESC LIMIT ? OFFSET ?`;
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

// Dead route GET /monthly/:employee_id removed — functionality served by monthlyRoutes.js

module.exports = router;
