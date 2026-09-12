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

// Cookie configuration — centralized for consistency
const isProd = process.env.NODE_ENV === "production";

const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  maxAge: 86400000, // 24 hours — matches JWT expiry
  path: "/",
};

const CSRF_COOKIE_OPTIONS = {
  httpOnly: false, // JS must read this for header submission
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  maxAge: 86400000,
  path: "/",
};

// Rate limiter for login: 20 attempts per 15 minutes per IP
// IP-based because user is not yet authenticated at login time.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Too many login attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for password change: 5 attempts per 15 minutes per authenticated user
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many password change attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id.toString(),
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
      // Log failed login attempt (user not found)
      logSecurityEvent({
        employee_id: username,
        action_type: "LOGIN_FAILED",
        ip_address: req.ip,
        user_agent: req.headers["user-agent"],
        session_id: null,
      });
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const user = rows[0];

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      // Log failed login attempt (wrong password)
      logSecurityEvent({
        employee_id: user.empid || username,
        action_type: "LOGIN_FAILED",
        ip_address: req.ip,
        user_agent: req.headers["user-agent"],
        session_id: null,
      });
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

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

    // Generate CSRF token for this session
    const csrfToken = uuidv4();

    // Set HttpOnly JWT cookie
    res.cookie("token", token, AUTH_COOKIE_OPTIONS);

    // Set CSRF cookie (non-HttpOnly — frontend reads this)
    res.cookie("csrf_token", csrfToken, CSRF_COOKIE_OPTIONS);

    res.json({
      success: true,
      mustChangePassword: !!user.must_change_password,
      csrfToken,
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
    // Log the logout event
    logSecurityEvent({
      employee_id: req.user.id,
      action_type: "LOGOUT",
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
      session_id: req.user?.session_id,
    });

    // Invalidate session in database
    await db.promise().query(
      "UPDATE employees SET active_session = NULL WHERE id = ?",
      [req.user.id]
    );
  } catch (err) {
    console.error("Logout session cleanup error:", err);
  }

  // Clear auth cookies
  res.clearCookie("token", AUTH_COOKIE_OPTIONS);
  res.clearCookie("csrf_token", CSRF_COOKIE_OPTIONS);

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
          e.must_change_password,
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
      mustChangePassword: !!user.must_change_password,
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
router.post("/change-password", verifyToken, changePasswordLimiter, async (req, res) => {
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

    // Hash and update new password, clear must_change_password flag
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.promise().query(
      "UPDATE employees SET password = ?, must_change_password = FALSE WHERE id = ?",
      [hashedPassword, userId]
    );

    // Invalidate session — forces re-login with new password
    await db.promise().query(
      "UPDATE employees SET active_session = NULL WHERE id = ?",
      [userId]
    );

    // Log the password change event
    logSecurityEvent({
      employee_id: req.user.id,
      action_type: "PASSWORD_CHANGE",
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
      session_id: req.user?.session_id,
    });

    // Clear auth cookies — force re-login with new password
    res.clearCookie("token", AUTH_COOKIE_OPTIONS);
    res.clearCookie("csrf_token", CSRF_COOKIE_OPTIONS);

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

// ==========================
// CSRF TOKEN
// Returns existing CSRF token if cookie exists, generates new one if not.
// Does NOT rotate existing tokens (safe for multi-tab usage).
// ==========================
router.get("/auth/csrf", verifyToken, (req, res) => {
  const existing = req.cookies?.csrf_token;
  if (existing) {
    return res.json({ csrfToken: existing });
  }
  const csrfToken = uuidv4();
  res.cookie("csrf_token", csrfToken, CSRF_COOKIE_OPTIONS);
  res.json({ csrfToken });
});

module.exports = router;
