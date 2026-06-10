const express = require("express");
const router = express.Router();
const db = require("../config/db");
const ExcelJS = require("exceljs");

const verifyToken = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole"); 
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
    LEFT JOIN employees e ON l.employee_db_id = e.id
    LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user
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
      SUM(CASE WHEN l.time_out IS NULL THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN TIME(l.time_in) > '08:30:00' THEN 1 ELSE 0 END) AS late_count
    FROM employees e
    LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user
    LEFT JOIN attendance_logs l ON e.id = l.employee_db_id AND DATE(l.time_in) = CURDATE()
    GROUP BY d.FK_dept
  `, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load summary" });
    }
    res.json(result);
  });
});

// ==========================
// 📊 ADVANCED EXPORT LOGS
// ==========================
router.get("/export", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { deptId, dateRange, type } = req.query; 

    // 1. Calculate Date Range
    const now = new Date();
    let startDate, endDate;
    
    if (dateRange === 'today') {
      startDate = new Date(now.setHours(0,0,0,0));
      endDate = new Date(now.setHours(23,59,59,999));
    } else if (dateRange === 'week') {
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); 
      startDate = new Date(now.setDate(diff));
      startDate.setHours(0,0,0,0);
      endDate = new Date(now.setDate(diff + 6));
      endDate.setHours(23,59,59,999);
    } else { // month
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    // 2. Fetch Data
    let query = `
      SELECT 
        e.name, e.employee_id, e.role, 
        al.time_in, al.time_out,
        TIMESTAMPDIFF(MINUTE, al.time_in, COALESCE(al.time_out, NOW())) as duration_minutes,
        CASE 
          WHEN TIME(al.time_in) > '08:00:00' THEN 1 ELSE 0 
        END as is_late
      FROM attendance_logs al
      JOIN employees e ON al.employee_db_id = e.id
      WHERE al.time_in BETWEEN ? AND ?
    `;
    
    let params = [startDate, endDate];

    // Note: Since your schema uses dtr_user for departments, this specific SQL 
    // might need adjustment if you want to filter strictly by deptId here.
    // For now, it fetches all within the date range as per your existing logic.

    const [rows] = await db.promise().query(query, params);

    // 3. Create Workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SPC Online DTR";
    workbook.lastModifiedBy = "Admin";
    workbook.created = new Date();

    // --- SCENARIO A: EXPORT ALL ---
    if (type === 'all') {
      const summarySheet = workbook.addWorksheet("Executive Summary");
      summarySheet.columns = [
        { header: "Department", key: "dept", width: 25 },
        { header: "Total Logs", key: "total", width: 15 },
        { header: "Total Late", key: "late", width: 15 },
        { header: "Avg Duration (mins)", key: "avg", width: 20 }
      ];
      
      const stats = { "All Staff": { total: 0, late: 0, durations: [] } };
      
      rows.forEach(r => {
        stats["All Staff"].total++;
        if (r.is_late) stats["All Staff"].late++;
        stats["All Staff"].durations.push(r.duration_minutes);
      });

      Object.keys(stats).forEach(dept => {
        const s = stats[dept];
        const avg = s.durations.length ? (s.durations.reduce((a,b)=>a+b,0)/s.durations.length).toFixed(1) : 0;
        summarySheet.addRow({ dept, total: s.total, late: s.late, avg });
      });

      summarySheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      summarySheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF10B981" } };

      const detailSheet = workbook.addWorksheet("All Attendance Logs");
      detailSheet.columns = [
        { header: "Employee ID", key: "employee_id", width: 15 },
        { header: "Name", key: "name", width: 25 },
        { header: "Role", key: "role", width: 15 },
        { header: "Date", key: "date", width: 12 },
        { header: "Time In", key: "time_in", width: 15 },
        { header: "Time Out", key: "time_out", width: 15 },
        { header: "Duration (m)", key: "duration", width: 15 },
        { header: "Status", key: "status", width: 15 }
      ];

      rows.forEach(r => {
        detailSheet.addRow({
          employee_id: r.employee_id,
          name: r.name,
          role: r.role,
          date: new Date(r.time_in).toLocaleDateString(),
          time_in: new Date(r.time_in).toLocaleTimeString(),
          time_out: r.time_out ? new Date(r.time_out).toLocaleTimeString() : "Active",
          duration: r.duration_minutes,
          status: r.is_late ? "Late" : "On Time"
        });
      });
      
      detailSheet.eachRow((row, i) => {
        if (i > 1 && row.getCell(8).value === "Late") {
          row.getCell(8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "32FFCCCB" } };
          row.getCell(8).font = { color: { argb: "FFDC2626" } };
        }
      });
    } 
    
    // --- SCENARIO B: EXPORT DEPARTMENT ---
    else if (type === 'department') {
      const overviewSheet = workbook.addWorksheet("Employee Summary");
      overviewSheet.columns = [
        { header: "Employee ID", key: "employee_id", width: 15 },
        { header: "Name", key: "name", width: 25 },
        { header: "Days Present", key: "days", width: 15 },
        { header: "Total Hours", key: "hours", width: 15 },
        { header: "Times Late", key: "late", width: 15 }
      ];

      const empStats = {};
      rows.forEach(r => {
        if (!empStats[r.employee_id]) {
          empStats[r.employee_id] = { name: r.name, days: 0, hours: 0, late: 0 };
        }
        empStats[r.employee_id].days++;
        empStats[r.employee_id].hours += (r.duration_minutes / 60);
        if (r.is_late) empStats[r.employee_id].late++;
      });

      Object.values(empStats).forEach(stat => {
        overviewSheet.addRow({
          employee_id: stat.employee_id,
          name: stat.name,
          days: stat.days,
          hours: stat.hours.toFixed(2),
          late: stat.late
        });
      });

      const breakdownSheet = workbook.addWorksheet("Daily Breakdown");
      breakdownSheet.columns = [
        { header: "Date", key: "date", width: 12 },
        { header: "Employee", key: "name", width: 25 },
        { header: "Time In", key: "time_in", width: 15 },
        { header: "Time Out", key: "time_out", width: 15 },
        { header: "Duration", key: "duration", width: 12 },
        { header: "Remark", key: "remark", width: 15 }
      ];

      rows.forEach(r => {
        breakdownSheet.addRow({
          date: new Date(r.time_in).toLocaleDateString(),
          name: r.name,
          time_in: new Date(r.time_in).toLocaleTimeString(),
          time_out: r.time_out ? new Date(r.time_out).toLocaleTimeString() : "-",
          duration: `${r.duration_minutes} mins`,
          remark: r.is_late ? "LATE" : "-"
        });
      });
    }

    // 4. Send File
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="DTR_Report_${dateRange}_${new Date().toISOString().slice(0,10)}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ message: "Failed to generate report", error: error.message });
  }
});

module.exports = router;