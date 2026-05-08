const express = require("express");
const router = express.Router();
const db = require("../config/db");
const bcrypt = require("bcryptjs");


// ✅ GET ALL EMPLOYEES
router.get("/", (req, res) => {
  db.query(
    "SELECT id, name, employee_id, role FROM employees",
    (err, result) => {
      if (err) {
        console.error("GET employees error:", err);
        return res.status(500).json({ message: "Server error" });
      }

      res.status(200).json(result);
    }
  );
});


// ✅ CREATE EMPLOYEE (HASHED + CLEANED)
router.post("/", async (req, res) => {
  let { name, employee_id, password } = req.body;

  // clean input
  name = name?.trim();
  employee_id = employee_id?.trim();

  if (!name || !employee_id || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const hashed = await bcrypt.hash(password, 10);

    db.query(
      "INSERT INTO employees (name, employee_id, password, role) VALUES (?, ?, ?, ?)",
      [name, employee_id, hashed, "employee"],
      (err, result) => {
        if (err) {
          console.error("INSERT employee error:", err);

          if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
              message: "Employee ID already exists",
            });
          }

          return res.status(500).json({ message: "Server error" });
        }

        res.status(201).json({
          message: "Employee created successfully",
          id: result.insertId,
        });
      }
    );
  } catch (error) {
    console.error("Hashing error:", error);
    res.status(500).json({ message: "Error creating employee" });
  }
});

module.exports = router;