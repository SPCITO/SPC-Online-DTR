const express = require("express");
const router = express.Router();
const db = require("../config/db");
const bcrypt = require("bcryptjs");

const verifyToken = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");

// ==========================
// 🔐 GET ALL EMPLOYEES
// ==========================
router.get("/", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    let countSql = "SELECT COUNT(*) as total FROM employees";
    let dataSql = "SELECT id, name, employee_id, email, role, created_at, is_active FROM employees";
    const params = [];

    if (search) {
      const where = " WHERE name LIKE ? OR employee_id LIKE ? OR email LIKE ?";
      countSql += where;
      dataSql += where;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [[{ total }]] = await db.promise().query(countSql, params);
    dataSql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    const [rows] = await db.promise().query(dataSql, [...params, limit, offset]);

    const formattedRows = (rows || []).map(row => ({
      id: String(row.id),
      name: row.name,
      employee_id: row.employee_id,
      email: row.email,
      role: row.role,
      created_at: row.created_at,
      is_active: row.is_active === 1
    }));

    return res.json({
      formattedRows,
      total: total || 0,
      page,
      limit,
      hasMore: offset + (rows?.length || 0) < (total || 0)
    });

  } catch (err) {
    console.error("GET employees error:", err);
    return res.status(500).json({ message: "Failed to fetch employees", error: err.message });
  }
});

// ==========================
// 🔐 CREATE EMPLOYEE
// ==========================
router.post("/", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    let { name, employee_id, email, password, role } = req.body;
    name = name?.trim();
    employee_id = employee_id?.trim();
    email = email?.trim();
    role = role || 'employee';

    if (!name || !employee_id || !email) {
      return res.status(400).json({ message: "Name, Employee ID, and Email are required." });
    }

    // Check if employee exists
    const [existing] = await db.promise().query(
      "SELECT id FROM employees WHERE employee_id = ? OR email = ? LIMIT 1",
      [employee_id, email]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: "Employee ID or Email already exists." });
    }

    const finalPassword = password || "changeme123";
    const hashed = await bcrypt.hash(finalPassword, 10);

    const [result] = await db.promise().query(
      "INSERT INTO employees (name, employee_id, email, password, role, is_active) VALUES (?, ?, ?, ?, ?, 1)",
      [name, employee_id, email, hashed, role]
    );

    return res.status(201).json({ message: "Employee created successfully", id: result.insertId });

  } catch (error) {
    console.error("POST employee error:", error);
    // MySQL duplicate entry error code: 1062
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: "Employee ID or Email already exists" });
    }
    return res.status(500).json({ message: "Error creating employee", error: error.message });
  }
});

// ==========================
// ✏️ UPDATE EMPLOYEE (Edit & Enable/Disable)
// ==========================
router.put("/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, employee_id, email, role, is_active } = req.body;

    // Check if employee exists
    const [existing] = await db.promise().query(
      "SELECT id FROM employees WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Check for duplicates (excluding current user)
    if (employee_id) {
      const [dup] = await db.promise().query(
        "SELECT id FROM employees WHERE employee_id = ? AND id != ?",
        [employee_id, id]
      );
      if (dup.length > 0) {
        return res.status(409).json({ message: "Employee ID already exists" });
      }
    }
    if (email) {
      const [dup] = await db.promise().query(
        "SELECT id FROM employees WHERE email = ? AND id != ?",
        [email, id]
      );
      if (dup.length > 0) {
        return res.status(409).json({ message: "Email already exists" });
      }
    }

    // Build update dynamically
    const fields = [];
    const values = [];
    if (name) { fields.push("name = ?"); values.push(name); }
    if (employee_id) { fields.push("employee_id = ?"); values.push(employee_id); }
    if (email) { fields.push("email = ?"); values.push(email); }
    if (role) { fields.push("role = ?"); values.push(role); }
    if (is_active !== undefined && is_active !== null) {
      fields.push("is_active = ?");
      values.push(is_active === true || is_active === 1 ? 1 : 0);
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    values.push(id);
    await db.promise().query(
      `UPDATE employees SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    return res.json({ message: "Employee updated successfully" });

  } catch (error) {
    console.error("PUT employee error:", error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: "Employee ID or Email already exists" });
    }
    return res.status(500).json({ message: "Error updating employee", error: error.message });
  }
});

// ==========================
// 🗑️ DELETE EMPLOYEE
// ==========================
router.delete("/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.promise().query(
      "DELETE FROM employees WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Employee not found" });
    }

    return res.json({ message: "Employee deleted successfully" });

  } catch (error) {
    console.error("DELETE employee error:", error);
    return res.status(500).json({ message: "Error deleting employee", error: error.message });
  }
});

module.exports = router;
