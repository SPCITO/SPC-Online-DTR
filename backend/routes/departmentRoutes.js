const express = require("express");
const router = express.Router();

const db = require("../config/db");
const verifyToken = require("../middleware/authMiddleware");
const { getAllDepartments } = require("../utils/deptMapping");

// =====================================
// GET ALL DEPARTMENTS
// =====================================
router.get("/", verifyToken, (req, res) => {
  const departments = getAllDepartments().map((dept) => ({
    department_id: dept.id,
    department_name: dept.name,
    display_name: dept.displayName,
    code: dept.code,
  }));

  res.json(departments);
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
router.get("/summary", (req, res) => {
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

// =====================================
// EXPORT DEPARTMENT LOGS (PRODUCTION-READY)
// =====================================
router.get("/export", verifyToken, (req, res) => {
  const { deptId, dateRange } = req.query;
  
  const { getDepartmentCode, generateExportFilename } = require("../utils/deptMapping");
  
  let dateCondition = "";
  const dateParams = [];
  const now = new Date();
  
  // Build date filter based on dateRange parameter
  if (dateRange === "today") {
    dateCondition = "AND DATE(l.time_in) = ?";
    dateParams.push(now.toISOString().split("T")[0]);
  } else if (dateRange === "week") {
    dateCondition = "AND l.time_in >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
  } else if (dateRange === "month") {
    dateCondition = "AND MONTH(l.time_in) = ? AND YEAR(l.time_in) = ?";
    dateParams.push(now.getMonth() + 1, now.getFullYear());
  }
  
  // Build department filter
  let deptCondition = "";
  if (deptId) {
    deptCondition = "AND d.groupno = ?";
    dateParams.push(deptId);
  }
  
  db.query(
    `
    SELECT 
      l.id,
      l.time_in,
      l.time_out,
      
      e.employee_id,
      e.name AS employee_name,
      e.role,
      
      d.fullname AS user_fullname,
      d.groupno AS department_id
      
    FROM attendance_logs l
    
    LEFT JOIN employees e
      ON l.employee_db_id = e.id
      
    LEFT JOIN dtr_user d
      ON e.dtr_user_id = d.PK_user
      
    WHERE 1=1
      ${deptCondition}
      ${dateCondition}
      
    ORDER BY d.groupno ASC, l.time_in DESC
    `,
    dateParams,
    (err, result) => {
      if (err) {
        console.error("Export error:", err);
        return res.status(500).json({ message: "Failed to export logs" });
      }
      
      // Format data for clean export
      const formattedData = result.map((row) => ({
        Department_ID: row.department_id,
        Department_Name: getDepartmentCode(row.department_id) || `Dept-${row.department_id}`,
        Employee_ID: row.employee_id || row.employee_db_id,
        Employee_Name: row.employee_name || row.user_fullname || "Unknown",
        Role: row.role || "N/A",
        Time_In: row.time_in ? new Date(row.time_in).toISOString() : "",
        Time_Out: row.time_out ? new Date(row.time_out).toISOString() : "",
        Status: !row.time_out ? "ACTIVE" : "COMPLETED",
      }));
      
      res.json({
        success: true,
        filename: generateExportFilename({
          type: "department-logs",
          departmentId: deptId ? parseInt(deptId.toString()) : undefined,
          dateRange: dateRange || "all",
          extension: "xlsx",
        }),
        data: formattedData,
        count: formattedData.length,
        exportedAt: new Date().toISOString(),
      });
    }
  );
});

module.exports = router;