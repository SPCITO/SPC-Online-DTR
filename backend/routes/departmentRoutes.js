const express = require("express");
const router = express.Router();

const db = require("../config/db");
const verifyToken = require("../middleware/authMiddleware");

// =====================================
// GET ALL DEPARTMENTS
// =====================================
router.get("/", verifyToken, (req, res) => {
  db.query(
    `
    SELECT 
      dept.department_id,
      dept.department_name,
      COUNT(d.PK_user) AS total_employees
    FROM (
      SELECT 1 AS department_id, 'Basic Ed' AS department_name
      UNION ALL
      SELECT 2, 'Collegiate'
      UNION ALL
      SELECT 3, 'Administrative/Personnel'
      UNION ALL
      SELECT 4, 'Student Assistant'
    ) dept

    LEFT JOIN dtr_user d 
      ON d.groupno = dept.department_id

    GROUP BY dept.department_id, dept.department_name

    ORDER BY dept.department_id
    `,
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "Failed to fetch departments" });
      }

      res.json(results);
    }
  );
});

// =====================================
// GET EMPLOYEES BY DEPARTMENT
// =====================================
router.get("/:deptId/logs", (req, res) => {
  const { deptId } = req.params;

  db.query(
    `
    SELECT 
      l.id,
      l.time_in,
      l.time_out,

      e.name,
      e.role,

      d.groupno AS department_id

    FROM attendance_logs l

    LEFT JOIN employees e
      ON l.employee_db_id = e.id

    LEFT JOIN dtr_user d
      ON e.dtr_user_id = d.PK_user

    WHERE d.groupno = ?

    ORDER BY l.time_in DESC
    `,
    [deptId],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "Failed to fetch department logs" });
      }

      res.json(result);
    }
  );
});

// =====================================
// GET DEPARTMENT SUMMARY
// =====================================
router.get("/departments/summary", (req, res) => {
  db.query(`
    SELECT 
      d.FK_dept AS department_id,

      COUNT(DISTINCT e.id) AS total_employees,

      SUM(
        CASE 
          WHEN l.time_out IS NULL THEN 1 
          ELSE 0 
        END
      ) AS active_count,

      SUM(
        CASE 
          WHEN TIME(l.time_in) > '08:30:00' THEN 1
          ELSE 0
        END
      ) AS late_count

    FROM employees e

    LEFT JOIN dtr_user d 
      ON e.dtr_user_id = d.PK_user

    LEFT JOIN attendance_logs l 
      ON e.id = l.employee_db_id 
      AND DATE(l.time_in) = CURDATE()

    GROUP BY d.FK_dept
  `, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load summary" });
    }

    res.json(result);
  });
});

module.exports = router;