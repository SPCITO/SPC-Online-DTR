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

    let countQuery = 'SELECT COUNT(*) as total FROM employees WHERE 1=1';
    
    // Use COALESCE to treat NULL is_active as 1 (Active)
    let dataQuery = `
      SELECT id, name, employee_id, email, role, created_at, 
             COALESCE(is_active, 1) as is_active, 
             NULL as department_name 
      FROM employees 
      WHERE 1=1
    `;

    const values = [];

    if (search) {
      const searchTerm = `%${search}%`;
      const searchCondition = ' AND (name LIKE ? OR employee_id LIKE ? OR email LIKE ?)';
      countQuery += searchCondition;
      dataQuery += searchCondition;
      values.push(searchTerm, searchTerm, searchTerm);
    }

    const [countResult] = await db.promise().query(countQuery, values);
    const total = countResult[0].total;

    const finalValues = [...values, limit, offset];
    dataQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    
    const [rows] = await db.promise().query(dataQuery, finalValues);

    const formattedRows = rows.map(row => ({
      ...row,
      id: String(row.id),
      // Ensure boolean true/false for frontend consistency
      is_active: row.is_active === 1 
    }));

    return res.json({
      formattedRows,
      total,
      page,
      limit,
      hasMore: offset + rows.length < total
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

    const [existing] = await db.promise().query(
      "SELECT id FROM employees WHERE employee_id = ? OR email = ?",
      [employee_id, email]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: "Employee ID or Email already exists." });
    }

    const finalPassword = password || "changeme123";
    const hashed = await bcrypt.hash(finalPassword, 10);

    const query = `
      INSERT INTO employees (name, employee_id, email, password, role, active_session, is_active)
      VALUES (?, ?, ?, ?, ?, NULL, 1)
    `;

    const [result] = await db.promise().query(query, [name, employee_id, email, hashed, role]);

    return res.status(201).json({ message: "Employee created successfully", id: result.insertId });

  } catch (error) {
    console.error("POST employee error:", error);
    if (error.code === "ER_DUP_ENTRY") {
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
    const [existing] = await db.promise().query("SELECT id FROM employees WHERE id = ?", [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Check for duplicates (excluding current user)
    if (employee_id || email) {
      const [duplicates] = await db.promise().query(
        "SELECT id FROM employees WHERE (employee_id = ? OR email = ?) AND id != ?",
        [employee_id, email, id]
      );
      if (duplicates.length > 0) {
        return res.status(409).json({ message: "Employee ID or Email already exists" });
      }
    }

    // Build dynamic update query
    const updates = [];
    const values = [];

    if (name) { updates.push("name = ?"); values.push(name); }
    if (employee_id) { updates.push("employee_id = ?"); values.push(employee_id); }
    if (email) { updates.push("email = ?"); values.push(email); }
    if (role) { updates.push("role = ?"); values.push(role); }
    
    // ✅ FIXED: Handle Enable/Disable (accepts both boolean true/false AND number 1/0)
    if (is_active !== undefined && is_active !== null) {
      updates.push("is_active = ?");
      // Convert to 1 or 0 for MySQL
      values.push(is_active === true || is_active === 1 ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    values.push(id); // For WHERE clause

    const query = `UPDATE employees SET ${updates.join(", ")} WHERE id = ?`;
    await db.promise().query(query, values);

    return res.json({ message: "Employee updated successfully" });

  } catch (error) {
    console.error("PUT employee error:", error);
    return res.status(500).json({ message: "Error updating employee", error: error.message });
  }
});

// ==========================
// 🗑️ DELETE EMPLOYEE
// ==========================
router.delete("/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.promise().query("DELETE FROM employees WHERE id = ?", [id]);

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