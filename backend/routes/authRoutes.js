const express = require("express");
const router = express.Router();
const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const logSecurityEvent = require("../utils/securityLogger");
const verifyToken = require("../middleware/authMiddleware");

const JWT_SECRET = process.env.JWT_SECRET || "secret";

// ==========================
// LOGIN
// ==========================
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      message: "Missing credentials",
    });
  }

  try {
    // Fetch user with joined dtr_user data
    const { data: userData, error: userError } = await db.supabase
      .from('employees')
      .select(`
        *,
        dtr_user (
          fullname,
          empid,
          FK_dept
        )
      `)
      .eq('username', username)
      .single();

    if (userError || !userData) {
      return res.status(401).json({
        message: "User not found",
      });
    }

    const user = {
      ...userData,
      fullname: userData.dtr_user?.fullname,
      empid: userData.dtr_user?.empid,
      FK_dept: userData.dtr_user?.FK_dept
    };

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({
        message: "Wrong password",
      });
    }

    // CHECK IF USER STILL USES DEFAULT PASSWORD
    const isUsingDefaultPassword = await bcrypt.compare("SPC0", user.password);

    const session_id = uuidv4();

    // Update active session
    const { error: updateError } = await db.supabase
      .from('employees')
      .update({ active_session: session_id })
      .eq('id', user.id);

    if (updateError) {
      console.error("Failed to update session:", updateError);
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        session_id,
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24,
    });

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
router.post("/logout", (req, res) => {
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
    const { data: userData, error } = await db.supabase
      .from('employees')
      .select(`
        id,
        username,
        role,
        dtr_user (
          empid,
          fullname,
          FK_dept
        )
      `)
      .eq('id', req.user.id)
      .single();

    if (error || !userData) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      employee_db_id: userData.id,
      username: userData.username,
      role: userData.role,
      employee_id: userData.dtr_user?.empid,
      name: userData.dtr_user?.fullname,
      department_id: userData.dtr_user?.FK_dept,
    });
  } catch (err) {
    console.error("Get user error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ==========================
// CHANGE PASSWORD
// ==========================
router.post("/change-password", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({
        message: "New password is required",
      });
    }

    // HASH NEW PASSWORD
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // UPDATE PASSWORD
    const { error } = await db.supabase
      .from('employees')
      .update({ password: hashedPassword })
      .eq('id', userId);

    if (error) {
      console.error("Password update error:", error);
      return res.status(500).json({
        message: "Failed to update password",
      });
    }

    // CLEAR COOKIE AFTER PASSWORD CHANGE
    res.clearCookie("token", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

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
