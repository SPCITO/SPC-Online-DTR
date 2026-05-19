const express = require("express");
const router = express.Router();
const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const verifyToken = require("../middleware/authMiddleware");

// ==========================
// LOGIN
// ==========================
router.post("/login", (req, res) => {
  const { employee_id, password } = req.body;

  if (!employee_id || !password) {
    return res.status(400).json({
      message: "Missing credentials",
    });
  }

  db.query(
    "SELECT * FROM employees WHERE employee_id = ?",
    [employee_id],
    async (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({
          message: "Server error",
        });
      }

      if (result.length === 0) {
        return res.status(401).json({
          message: "User not found",
        });
      }

      const user = result[0];

      const valid = await bcrypt.compare(
        password,
        user.password
      );

      if (!valid) {
        return res.status(401).json({
          message: "Wrong password",
        });
      }

      const token = jwt.sign(
        {
          id: user.id,
          role: user.role,
        },
        "secret",
        { expiresIn: "1d" }
      );

      res.cookie("token", token, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24,
      });

      const { password: _, ...safeUser } = user;

      res.json({
        user: safeUser,
      });
    }
  );
});

// ==========================
// LOGOUT
// ==========================
router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
  });

  res.json({
    message: "Logged out",
  });
});

// ==========================
// CURRENT USER
// ==========================
router.get("/me", verifyToken, (req, res) => {
  db.query(
    "SELECT id, name, employee_id, role FROM employees WHERE id = ?",
    [req.user.id],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          message: "Server error",
        });
      }

      if (result.length === 0) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      res.json(result[0]);
    }
  );
});

module.exports = router;