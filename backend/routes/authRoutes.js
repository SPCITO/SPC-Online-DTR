const express = require("express");
const router = express.Router();
const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const rateLimit = require("express-rate-limit");
const logSecurityEvent = require("../utils/securityLogger");
const verifyToken = require("../middleware/authMiddleware");

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET = process.env.JWT_SECRET;

// Rate limiter for login: 10 attempts per 15 minutes per IP
// Appropriate for a small internal DTR system — allows a few mistakes
// but blocks sustained brute-force attempts.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { message: "Too many login attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==========================
// LOGIN
// ==========================
router.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      message: "Missing credentials",
    });
  }

  try {
    const [rows] = await db.promise().query(
      `
      SELECT
          e.*,
          d.fullname,
          d.empid,
          d.FK_dept
      FROM employees e
      LEFT JOIN dtr_user d
          ON e.dtr_user_id = d.PK_user
      WHERE e.username = ?
      AND e.is_active = 1
      LIMIT 1
      `,
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const user = rows[0];

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    // CHECK IF USER STILL USES DEFAULT PASSWORD
    const isUsingDefaultPassword = await bcrypt.compare("SPC0", user.password);

    const session_id = uuidv4();

    // Update active session
    await db.promise().query(
      `
      UPDATE employees
      SET active_session = ?
      WHERE id = ?
      `,
      [session_id, user.id]
    );

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        session_id,
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    logSecurityEvent({
      employee_id: user.empid,
      action_type: "LOGIN",
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
      session_id,
    });

    res.json({
      success: true,
      mustChangePassword: isUsingDefaultPassword,
      token: token, 
      user: {
        id: user.id,
        employee_db_id: user.id,
        username: user.username,
        employee_id: user.empid,
        name: user.fullname,
        role: user.role,
        department_id: user.FK_dept,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({
      message: "Server error",
    });
  }
});

// ==========================
// LOGOUT
// ==========================
router.post("/logout", verifyToken, async (req, res) => {
  try {
    // Invalidate session in database
    await db.promise().query(
      "UPDATE employees SET active_session = NULL WHERE id = ?",
      [req.user.id]
    );
  } catch (err) {
    console.error("Logout session cleanup error:", err);
  }

  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  res.json({
    message: "Logged out",
  });
});

// ==========================
// CURRENT USER
// ==========================
router.get("/me", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `
      SELECT
          e.id,
          e.username,
          e.role,
          d.empid,
          d.fullname,
          d.FK_dept
      FROM employees e
      LEFT JOIN dtr_user d
          ON e.dtr_user_id = d.PK_user
      WHERE e.id = ?
      LIMIT 1
      `,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const user = rows[0];

    res.json({
      employee_db_id: user.id,
      username: user.username,
      role: user.role,
      employee_id: user.empid,
      name: user.fullname,
      department_id: user.FK_dept,
    });
  } catch (err) {
    console.error("Fetch current user error:", err);
    return res.status(500).json({
      message: "Server error",
    });
  }
});

// ==========================
// CHANGE PASSWORD
// ==========================
router.post("/change-password", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    // Validate inputs
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current password and new password are required",
      });
    }

    // Server-side password length validation
    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters",
      });
    }

    // Retrieve existing password hash
    const [rows] = await db.promise().query(
      "SELECT password FROM employees WHERE id = ?",
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify current password
    const valid = await bcrypt.compare(currentPassword, rows[0].password);
    if (!valid) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // Hash and update new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.promise().query(
      "UPDATE employees SET password = ? WHERE id = ?",
      [hashedPassword, userId]
    );

    // Invalidate session — forces re-login with new password
    await db.promise().query(
      "UPDATE employees SET active_session = NULL WHERE id = ?",
      [userId]
    );

    return res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (err) {
    console.error("Change password error:", err);
    return res.status(500).json({
      message: "Server error",
    });
  }
});

module.exports = router;
