const express = require("express");
const router = express.Router();
const db = require("../config/db");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const verifyToken = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const logSecurityEvent = require("../utils/securityLogger");
const { getDepartmentById } = require("../utils/deptMapping");

// ==========================
// 🔐 GET ALL EMPLOYEES
// ==========================
router.get("/", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    let page = Math.max(1, parseInt(req.query.page) || 1);
    let limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    let countSql = "SELECT COUNT(*) as total FROM employees e";
    // M.45d: expose the effective department — dtr_user.groupno (biometrics
    // system) wins, falling back to employees.department_id for unlinked rows.
    let dataSql = `SELECT e.id, e.name, e.username, e.employee_id, e.email, e.role, e.created_at, e.is_active,
                          e.department_id AS own_department_id, d.groupno AS dtr_groupno
                   FROM employees e
                   LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user`;
    const params = [];

    if (search) {
      const where = " WHERE e.name LIKE ? OR e.username LIKE ? OR e.employee_id LIKE ? OR e.email LIKE ?";
      countSql += where;
      dataSql += where;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [[{ total }]] = await db.promise().query(countSql, params);
    dataSql += " ORDER BY e.created_at DESC LIMIT ? OFFSET ?";
    const [rows] = await db.promise().query(dataSql, [...params, limit, offset]);

    const formattedRows = (rows || []).map(row => {
      const effectiveDept = row.dtr_groupno ?? row.own_department_id ?? null;
      return {
        id: String(row.id),
        name: row.name,
        username: row.username,
        employee_id: row.employee_id,
        email: row.email,
        role: row.role,
        created_at: row.created_at,
        is_active: row.is_active === 1,
        department_id: effectiveDept,
        department_name: effectiveDept !== null ? getDepartmentById(effectiveDept)?.name ?? null : null,
      };
    });

    return res.json({
      formattedRows,
      total: total || 0,
      page,
      limit,
      hasMore: offset + (rows?.length || 0) < (total || 0)
    });

  } catch (err) {
    console.error("GET employees error:", err);
    return res.status(500).json({ message: "Failed to fetch employees" });
  }
});

// ==========================
// 🔐 CREATE EMPLOYEE
// ==========================
router.post("/", verifyToken, requireRole("admin"), async (req, res) => {
  let conn;
  try {
    let { name, username, employee_id, email, password, role, department_id, dtr_user_id, dtr_user_action } = req.body;
    name = name?.trim();
    username = username?.trim();
    // Employee ID is optional for now (school IDs will be imported later);
    // empty values are stored as NULL so the UNIQUE key never collides.
    employee_id = employee_id?.trim() || null;
    // Email is optional (many staff have none yet); empty values are stored
    // as NULL so the UNIQUE key never collides.
    email = email?.trim() || null;
    role = role || 'employee';

    // Department is optional (legacy rows may have none) but must be one of
    // the real departments (1-4, see utils/deptMapping.js) when provided.
    if (department_id !== undefined && department_id !== null && department_id !== "") {
      department_id = Number(department_id);
      if (!getDepartmentById(department_id)) {
        return res.status(400).json({ message: "Invalid department." });
      }
    } else {
      department_id = null;
    }

    // Validate role against supported values
    const validRoles = ['admin', 'employee'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role. Supported roles: admin, employee" });
    }

    if (!name || !username) {
      return res.status(400).json({ message: "Name and Username are required." });
    }

    // dtr_user.fullname is VARCHAR(50) — refuse names that would be truncated.
    if (name.length > 50) {
      return res.status(400).json({ message: "Full name must be 50 characters or fewer (DTR identity limit)." });
    }

    // Explicit admin override: link to an existing dtr_user identity (PK_user),
    // chosen from the candidate list returned by a DTR_IDENTITY_MATCHES 409.
    const linkOverride = dtr_user_id !== undefined && dtr_user_id !== null && dtr_user_id !== ""
      ? Number(dtr_user_id)
      : null;
    // Explicit admin decision: create a separate DTR identity despite name matches.
    const forceCreate = dtr_user_action === "create_new";

    const finalPassword = password || "changeme123";
    const hashed = await bcrypt.hash(finalPassword, 10);

    conn = await db.pool.promise().getConnection();

    // Check if username is taken
    const [existingUsername] = await conn.query(
      "SELECT id FROM employees WHERE username = ? LIMIT 1",
      [username]
    );

    if (existingUsername.length > 0) {
      conn.release(); conn = null;
      return res.status(409).json({ message: "Username already exists." });
    }

    // Check if employee_id or email exists
    const [existing] = await conn.query(
      "SELECT id FROM employees WHERE employee_id = ? OR email = ? LIMIT 1",
      [employee_id, email]
    );

    if (existing.length > 0) {
      conn.release(); conn = null;
      return res.status(409).json({ message: "Employee ID or Email already exists." });
    }

    // ---------------------------------------------------------------
    // M.45: DTR identity provisioning (transactional)
    // Create or reuse the dtr_user identity and link it immediately via
    // employees.dtr_user_id = dtr_user.PK_user. Biometric fields
    // (fp_zk4500, fp_zk4500_2, fingerprint, picture) stay NULL — the
    // identity exists, physical enrollment happens later at the station.
    // ---------------------------------------------------------------
    await conn.beginTransaction();

    let dtrUserId = null;
    let dtrAction = null; // "created" | "linked"

    if (linkOverride) {
      // --- Admin explicitly picked an existing DTR identity ---
      if (!Number.isInteger(linkOverride) || linkOverride <= 0) {
        await conn.rollback(); conn.release(); conn = null;
        return res.status(400).json({ message: "Invalid DTR identity reference." });
      }
      const [targets] = await conn.query(
        "SELECT PK_user, fullname, groupno, isactive FROM dtr_user WHERE PK_user = ?",
        [linkOverride]
      );
      if (targets.length === 0) {
        await conn.rollback(); conn.release(); conn = null;
        return res.status(404).json({ message: "DTR identity not found." });
      }
      const [alreadyLinked] = await conn.query(
        "SELECT id FROM employees WHERE dtr_user_id = ? LIMIT 1",
        [linkOverride]
      );
      if (alreadyLinked.length > 0) {
        await conn.rollback(); conn.release(); conn = null;
        return res.status(409).json({ message: `DTR identity #${linkOverride} is already linked to another account.` });
      }
      dtrUserId = targets[0].PK_user;
      dtrAction = "linked";
    } else {
      // --- Find existing DTR identity by exact name (case/whitespace-insensitive) ---
      const [matches] = await conn.query(
        `SELECT PK_user, fullname, groupno, isactive
           FROM dtr_user
          WHERE LOWER(TRIM(fullname)) = LOWER(TRIM(?))
          LIMIT 5`,
        [name]
      );

      if (matches.length > 0 && !forceCreate) {
        // Never guess which identity belongs to this person — surface the
        // candidates and let the admin decide (link existing / create new).
        await conn.rollback(); conn.release(); conn = null;
        return res.status(409).json({
          code: "DTR_IDENTITY_MATCHES",
          message: "This name already exists in the biometrics/DTR system. Link to the existing identity, or create a separate one if this is a different person.",
          candidates: matches.map((m) => ({
            dtr_user_id: m.PK_user,
            fullname: m.fullname,
            groupno: m.groupno,
            isactive: m.isactive,
          })),
        });
      }

      // Department is required to create a new DTR identity (groupno) —
      // never silently default it to 1 ("Basic Education").
      if (department_id === null) {
        await conn.rollback(); conn.release(); conn = null;
        return res.status(400).json({ message: "Department is required to create the DTR identity." });
      }

      // Identity-only row: no biometric/device values are ever invented.
      // isadmin stays 0 (never grant legacy-system admin rights).
      try {
        const [ins] = await conn.query(
          "INSERT INTO dtr_user (fullname, groupno, isadmin, isactive, isupdonline) VALUES (?, ?, 0, 1, 0)",
          [name, department_id]
        );
        dtrUserId = ins.insertId;
        dtrAction = "created";
      } catch (provErr) {
        // The app identity (dtr_app) may not yet hold INSERT on dtr_user
        // (pending school-DBA GRANT). In that case create the account
        // UNLINKED (pre-existing behavior) and say so loudly — never leave
        // a half-created identity, never silently pretend it was provisioned.
        if (provErr.code === "ER_TABLEACCESS_DENIED_ERROR" || provErr.code === "ER_SPECIFIC_ACCESS_DENIED_ERROR") {
          console.error("DTR provisioning skipped: dtr_app lacks INSERT on dtr_user (GRANT pending):", provErr.code);
          dtrUserId = null;
          dtrAction = "skipped";
        } else {
          throw provErr;
        }
      }
    }

    const [result] = await conn.query(
      "INSERT INTO employees (name, username, employee_id, email, password, role, department_id, is_active, must_change_password, dtr_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, 1, TRUE, ?)",
      [name, username, employee_id, email, hashed, role, department_id, dtrUserId]
    );

    await conn.commit();
    conn.release(); conn = null;

    if (dtrAction === "skipped") {
      // Audit trail: account exists but has NO DTR identity yet.
      logSecurityEvent({
        employee_id: req.user.id,
        action_type: "EMPLOYEE_CREATED_NO_DTR_IDENTITY",
        ip_address: req.ip,
        user_agent: req.headers["user-agent"],
        session_id: req.user?.session_id,
      });
    }

    return res.status(201).json({
      message: dtrAction === "created"
        ? "Employee created successfully. DTR identity created — physical biometric enrollment pending."
        : dtrAction === "linked"
          ? "Employee created successfully. Linked to existing DTR identity."
          : "Employee created, BUT the DTR identity could NOT be created (database permission pending). This account is NOT yet visible in the biometrics system.",
      id: result.insertId,
      dtr_user_id: dtrUserId,
      dtr_user_action: dtrAction,
    });

  } catch (error) {
    if (conn) {
      try { await conn.rollback(); } catch (_) { /* already rolled back */ }
      try { conn.release(); } catch (_) { /* already released */ }
    }
    console.error("POST employee error:", error);
    // MySQL duplicate entry error code: 1062
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: "Employee ID or Email already exists" });
    }
    return res.status(500).json({ message: "Error creating employee" });
  }
});

// ==========================
// ✏️ UPDATE EMPLOYEE (Edit & Enable/Disable)
// ==========================
router.put("/:id", verifyToken, requireRole("admin"), async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const { name, username, employee_id, email, role, is_active, department_id } = req.body;

    // Validate role if provided
    if (role !== undefined) {
      const validRoles = ['admin', 'employee'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role. Supported roles: admin, employee" });
      }
    }

    // M.45d: department transfer. department_id === undefined → leave
    // unchanged; null/"" → clear; 1-4 (see utils/deptMapping.js) → transfer.
    const hasDeptChange = department_id !== undefined;
    let deptValue = null;
    if (hasDeptChange) {
      if (department_id === null || department_id === "") {
        deptValue = null;
      } else {
        deptValue = Number(department_id);
        if (!getDepartmentById(deptValue)) {
          return res.status(400).json({ message: "Invalid department." });
        }
      }
    }

    conn = await db.pool.promise().getConnection();

    // Check if employee exists
    const [existing] = await conn.query(
      "SELECT id, dtr_user_id FROM employees WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      conn.release(); conn = null;
      return res.status(404).json({ message: "Employee not found" });
    }

    // Check for duplicates (excluding current user)
    if (username) {
      const trimmedUsername = username.trim();
      if (!trimmedUsername) {
        conn.release(); conn = null;
        return res.status(400).json({ message: "Username cannot be empty." });
      }
      const [dup] = await conn.query(
        "SELECT id FROM employees WHERE username = ? AND id != ?",
        [trimmedUsername, id]
      );
      if (dup.length > 0) {
        conn.release(); conn = null;
        return res.status(409).json({ message: "Username already exists" });
      }
    }
    if (employee_id) {
      const [dup] = await conn.query(
        "SELECT id FROM employees WHERE employee_id = ? AND id != ?",
        [employee_id, id]
      );
      if (dup.length > 0) {
        conn.release(); conn = null;
        return res.status(409).json({ message: "Employee ID already exists" });
      }
    }
    if (email) {
      const [dup] = await conn.query(
        "SELECT id FROM employees WHERE email = ? AND id != ?",
        [email, id]
      );
      if (dup.length > 0) {
        conn.release(); conn = null;
        return res.status(409).json({ message: "Email already exists" });
      }
    }

    // Build update dynamically
    const fields = [];
    const values = [];
    if (name) { fields.push("name = ?"); values.push(name); }
    if (username) { fields.push("username = ?"); values.push(username.trim()); }
    if (employee_id) { fields.push("employee_id = ?"); values.push(employee_id); }
    if (email) { fields.push("email = ?"); values.push(email); }
    if (role) { fields.push("role = ?"); values.push(role); }
    if (is_active !== undefined && is_active !== null) {
      fields.push("is_active = ?");
      values.push(is_active === true || is_active === 1 ? 1 : 0);
    }
    if (hasDeptChange) {
      fields.push("department_id = ?");
      values.push(deptValue);
    }

    if (fields.length === 0) {
      conn.release(); conn = null;
      return res.status(400).json({ message: "No fields to update" });
    }

    await conn.beginTransaction();

    values.push(id);
    await conn.query(
      `UPDATE employees SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    // Department transfers must mirror into the biometrics/DTR system
    // (dtr_user.groupno) so both systems stay identical. Atomic: if the
    // biometrics-side update cannot run, the WHOLE edit rolls back — the two
    // systems must never diverge on department.
    let dtrDeptSynced = null;
    if (hasDeptChange) {
      const dtrUserId = existing[0].dtr_user_id;
      if (dtrUserId !== null && dtrUserId !== undefined) {
        try {
          await conn.query(
            "UPDATE dtr_user SET groupno = ? WHERE PK_user = ?",
            [deptValue, dtrUserId]
          );
          dtrDeptSynced = true;
        } catch (provErr) {
          if (
            provErr.code === "ER_TABLEACCESS_DENIED_ERROR" ||
            provErr.code === "ER_SPECIFIC_ACCESS_DENIED_ERROR" ||
            provErr.code === "ER_COLUMNACCESS_DENIED_ERROR"
          ) {
            await conn.rollback(); conn.release(); conn = null;
            return res.status(409).json({
              code: "DTR_DEPT_UPDATE_BLOCKED",
              message: "Department transfer could NOT be applied to the biometrics/DTR system (database permission pending). No changes were saved so both systems stay identical.",
            });
          }
          throw provErr;
        }
      } else {
        // No DTR identity linked (e.g. old test accounts) — Online DTR only.
        dtrDeptSynced = false;
      }
    }

    await conn.commit();
    conn.release(); conn = null;

    return res.json({
      message: "Employee updated successfully",
      dtr_dept_synced: dtrDeptSynced,
    });

  } catch (error) {
    if (conn) {
      try { await conn.rollback(); } catch (_) { /* already rolled back */ }
      try { conn.release(); } catch (_) { /* already released */ }
    }
    console.error("PUT employee error:", error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: "Username, Employee ID, or Email already exists" });
    }
    return res.status(500).json({ message: "Error updating employee" });
  }
});

// ==========================
// 🗑️ DELETE EMPLOYEE
// ==========================
router.delete("/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await db.promise().query(
      "SELECT id FROM employees WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // attendance_logs cascades on employee deletion, so deleting an
    // account with history would destroy its payroll attendance records.
    // The NOT EXISTS guard keeps the check race-safe: if a log appears
    // between the SELECT above and this DELETE, no rows are deleted.
    const [result] = await db.promise().query(
      `DELETE e FROM employees e
       WHERE e.id = ?
         AND NOT EXISTS (
           SELECT 1 FROM attendance_logs al WHERE al.employee_db_id = e.id
         )`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        message:
          "Employee has attendance records and cannot be deleted. Deactivate the account instead to preserve attendance history.",
      });
    }

    return res.json({ message: "Employee deleted successfully" });

  } catch (error) {
    console.error("DELETE employee error:", error);
    return res.status(500).json({ message: "Error deleting employee" });
  }
});

// ==========================
// 🔑 RESET EMPLOYEE PASSWORD (ADMIN ONLY)
// ==========================
router.put("/:id/reset-password", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    // Verify target employee exists
    const [existing] = await db.promise().query(
      "SELECT id, name FROM employees WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: "Employee not found" });
    }

    let passwordToUse = newPassword;
    let generated = false;

    // Generate cryptographically random password if not provided
    if (!passwordToUse) {
      passwordToUse = crypto.randomBytes(9).toString("base64url");
      generated = true;
    }

    // Validate password length
    if (passwordToUse.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    // Hash password, set must_change_password, invalidate session
    const hashedPassword = await bcrypt.hash(passwordToUse, 10);
    await db.promise().query(
      "UPDATE employees SET password = ?, must_change_password = TRUE, active_session = NULL, session_expires_at = NULL WHERE id = ?",
      [hashedPassword, id]
    );

    // Log the admin password reset
    logSecurityEvent({
      employee_id: req.user.id,
      action_type: "PASSWORD_RESET_BY_ADMIN",
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
      session_id: req.user?.session_id,
    });

    const response = { message: "Password reset successfully" };
    if (generated) {
      response.tempPassword = passwordToUse;
    }

    return res.json(response);
  } catch (error) {
    console.error("RESET PASSWORD error:", error);
    return res.status(500).json({ message: "Error resetting password" });
  }
});

module.exports = router;
