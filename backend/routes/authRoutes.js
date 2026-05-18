const express = require("express");
const router = express.Router();
const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

  router.post("/login", (req, res) => {
    const { employee_id, password } = req.body;

  router.post("/logout", (req, res) => {
    res.clearCookie("token", {
      httpOnly: true,
      sameSite: "lax",
    });

    res.json({ message: "Logged out" });
  });

  if (!employee_id || !password) {
    return res.status(400).json({ message: "Missing credentials" });
  }

  db.query(
    "SELECT * FROM employees WHERE employee_id = ?",
    [employee_id],
    async (err, result) => {
      if (err) {
        console.error("DB Error:", err);
        return res.status(500).json({ message: "Server error" });
      }

      if (result.length === 0) {
        console.log("User not found:", employee_id);
        return res.status(401).json({ message: "User not found" });
      }

      const user = result[0];

      try {
        const valid = await bcrypt.compare(password, user.password);

        console.log("Password match:", valid);

        if (!valid) {
          return res.status(401).json({ message: "Wrong password" });
        }

        const token = jwt.sign(
          { id: user.id, role: user.role },
          "secret",
          { expiresIn: "1d" }
        );

        // ✅ Don't send password back
        const { password: _, ...safeUser } = user;

        res.cookie("token", token, {
          httpOnly: true,
          secure: false, // true in production HTTPS
          sameSite: "lax",
          maxAge: 1000 * 60 * 60 * 24, // 1 day
        });

        res.json({
          user: safeUser,
        });

      } catch (error) {
        console.error("Bcrypt error:", error);
        res.status(500).json({ message: "Auth error" });
      }
    }
  );
});

module.exports = router;