const express = require("express");
const router = express.Router();
const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const logSecurityEvent = require("../utils/securityLogger");
const verifyToken = require("../middleware/authMiddleware");

// ==========================
// LOGIN
// ==========================
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      message: "Missing credentials",
    });
  }

  db.query(
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
    `,
    [username],
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

      // CHECK IF USER STILL USES DEFAULT PASSWORD
      const isUsingDefaultPassword =
        await bcrypt.compare(
          "SPC0",
          user.password
        );

      const session_id = uuidv4();

      db.query(
        "UPDATE employees SET active_session = ? WHERE id = ?",
        [session_id, user.id]
      );

      const token = jwt.sign(
        {
          id: user.id,
          role: user.role,
          session_id,
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

      logSecurityEvent({
        employee_id: user.empid,
        action_type: "LOGIN",
        ip_address: req.ip,
        user_agent: req.headers["user-agent"],
        session_id,
      });

      res.json({
        success: true,

        mustChangePassword:
          isUsingDefaultPassword,

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
    `
    SELECT
      e.id AS employee_db_id,
      e.username,
      e.role,
      d.empid AS employee_id,
      d.fullname AS name,
      d.FK_dept AS department_id
    FROM employees e
    LEFT JOIN dtr_user d
      ON e.dtr_user_id = d.PK_user
    WHERE e.id = ?
    `,
    [req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });

      if (!result.length) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(result[0]);
    }
  );
});

// ==========================
// CHANGE PASSWORD
// ==========================
router.post(
  "/change-password",
  verifyToken,
  async (req, res) => {
    try {
      const userId = req.user.id;

      const { newPassword } = req.body;

      if (!newPassword) {
        return res.status(400).json({
          message: "New password is required",
        });
      }

      // HASH NEW PASSWORD
      const hashedPassword =
        await bcrypt.hash(newPassword, 10);

      // UPDATE PASSWORD
      db.query(
        `
        UPDATE employees
        SET password = ?
        WHERE id = ?
        `,
        [hashedPassword, userId],
        (err) => {
          if (err) {
            console.error(err);

            return res.status(500).json({
              message:
                "Failed to update password",
            });
          }

          // CLEAR COOKIE AFTER PASSWORD CHANGE
          res.clearCookie("token", {
            httpOnly: true,
            sameSite: "lax",
            secure: false,
          });

          return res.json({
            success: true,
            message:
              "Password changed successfully",
          });
        }
      );
    } catch (err) {
      console.error(err);

      return res.status(500).json({
        message: "Server error",
      });
    }
  }
);

module.exports = router;