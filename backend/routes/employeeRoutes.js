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

    // Build query for count
    let countQuery = db.supabase.from('employees').select('*', { count: 'exact', head: true });
    
    // Build query for data
    let dataQuery = db.supabase
      .from('employees')
      .select(`
        id,
        name,
        employee_id,
        email,
        role,
        created_at,
        is_active
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      const searchTerm = `%${search}%`;
      countQuery = countQuery.or(`name.ilike.${searchTerm},employee_id.ilike.${searchTerm},email.ilike.${searchTerm}`);
      dataQuery = dataQuery.or(`name.ilike.${searchTerm},employee_id.ilike.${searchTerm},email.ilike.${searchTerm}`);
    }

    // Get total count
    const { count: total } = await countQuery;

    // Get data
    const { data: rows, error } = await dataQuery;

    if (error) {
      console.error("Error fetching employees:", error);
      return res.status(500).json({ message: "Failed to fetch employees", error: error.message });
    }

    const formattedRows = (rows || []).map(row => ({
      ...row,
      id: String(row.id),
      // Convert boolean for frontend consistency
      is_active: row.is_active === true 
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
    const { data: existing } = await db.supabase
      .from('employees')
      .select('id')
      .or(`employee_id.eq.${employee_id},email.eq.${email}`)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ message: "Employee ID or Email already exists." });
    }

    const finalPassword = password || "changeme123";
    const hashed = await bcrypt.hash(finalPassword, 10);

    const { data: result, error } = await db.supabase
      .from('employees')
      .insert([{
        name,
        employee_id,
        email,
        password: hashed,
        role,
        is_active: true
      }])
      .select('id')
      .single();

    if (error) {
      console.error("Create employee error:", error);
      if (error.code === '23505') { // Unique violation
        return res.status(409).json({ message: "Employee ID or Email already exists" });
      }
      return res.status(500).json({ message: "Error creating employee", error: error.message });
    }

    return res.status(201).json({ message: "Employee created successfully", id: result.id });

  } catch (error) {
    console.error("POST employee error:", error);
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
    const { data: existing } = await db.supabase
      .from('employees')
      .select('id')
      .eq('id', id)
      .maybeSingle();
      
    if (!existing) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Check for duplicates (excluding current user)
    if (employee_id || email) {
      let duplicateQuery = db.supabase
        .from('employees')
        .select('id')
        .neq('id', id);
      
      if (employee_id) {
        duplicateQuery = duplicateQuery.eq('employee_id', employee_id);
      } else if (email) {
        duplicateQuery = duplicateQuery.eq('email', email);
      }
      
      const { data: duplicates } = await duplicateQuery.maybeSingle();
      
      if (duplicates) {
        return res.status(409).json({ message: "Employee ID or Email already exists" });
      }
    }

    // Build update object
    const updates = {};
    if (name) updates.name = name;
    if (employee_id) updates.employee_id = employee_id;
    if (email) updates.email = email;
    if (role) updates.role = role;
    
    // Handle Enable/Disable (accepts both boolean true/false AND number 1/0)
    if (is_active !== undefined && is_active !== null) {
      updates.is_active = is_active === true || is_active === 1 ? true : false;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    const { error } = await db.supabase
      .from('employees')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error("PUT employee error:", error);
      return res.status(500).json({ message: "Error updating employee", error: error.message });
    }

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

    const { error } = await db.supabase
      .from('employees')
      .delete()
      .eq('id', id);

    if (error) {
      console.error("DELETE employee error:", error);
      return res.status(500).json({ message: "Error deleting employee", error: error.message });
    }

    return res.json({ message: "Employee deleted successfully" });

  } catch (error) {
    console.error("DELETE employee error:", error);
    return res.status(500).json({ message: "Error deleting employee", error: error.message });
  }
});

module.exports = router;
