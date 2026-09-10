const express = require("express");
const router = express.Router();
const db = require("../config/db");
const ExcelJS = require("exceljs");
const rateLimit = require("express-rate-limit");

const verifyToken = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole"); 
const { getAllDepartments } = require("../utils/deptMapping");

// Rate limiter for exports: 10 per hour per IP
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { message: "Too many export requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

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
// GET DEPARTMENT SUMMARY
// NOTE: This route MUST be before /:deptId/logs
// to prevent Express matching "summary" as a deptId.
// =====================================
router.get("/summary", verifyToken, async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const [rows] = await db.promise().query(
      `SELECT d.FK_dept AS department_id,
              COUNT(DISTINCT e.id) AS total_employees,
              SUM(CASE WHEN al.time_out IS NULL AND al.id IS NOT NULL THEN 1 ELSE 0 END) AS active_count,
              SUM(CASE WHEN al.id IS NOT NULL AND TIME(al.time_in) > '08:30:00' THEN 1 ELSE 0 END) AS late_count
       FROM employees e
       LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user
       LEFT JOIN attendance_logs al ON al.employee_db_id = e.id
         AND al.time_in >= ? AND al.time_in <= ?
       GROUP BY d.FK_dept`,
      [startOfDay, endOfDay]
    );

    res.json(rows || []);
  } catch (err) {
    console.error("GET dept summary error:", err);
    return res.status(500).json({ message: "Failed to load summary" });
  }
});

// =====================================
// GET EMPLOYEES BY DEPARTMENT
// =====================================
router.get("/:deptId/logs", verifyToken, async (req, res) => {
  try {
    const deptId = Number(req.params.deptId);

    // Pagination with safe defaults and limits
    let page = Math.max(1, parseInt(req.query.page) || 1);
    let limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    // Get total count
    const [[{ total }]] = await db.promise().query(
      `SELECT COUNT(*) AS total
       FROM attendance_logs al
       JOIN employees e ON al.employee_db_id = e.id
       LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user
       WHERE d.groupno = ?`,
      [deptId]
    );

    const [rows] = await db.promise().query(
      `SELECT al.id, al.employee_db_id, al.time_in, al.time_out,
              e.name, e.employee_id, e.role, d.groupno
       FROM attendance_logs al
       JOIN employees e ON al.employee_db_id = e.id
       LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user
       WHERE d.groupno = ?
       ORDER BY al.time_in DESC, al.id DESC
       LIMIT ? OFFSET ?`,
      [deptId, limit, offset]
    );

    const logs = (rows || []).map(row => ({
      id: row.id,
      employee_db_id: row.employee_db_id,
      name: row.name,
      employee_id: row.employee_id,
      role: row.role,
      department_id: row.groupno,
      time_in: row.time_in,
      time_out: row.time_out,
    }));

    res.json({
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });

  } catch (err) {
    console.error("GET dept logs error:", err);
    res.status(500).json({ message: "Failed to fetch department logs" });
  }
});

// ==========================
// 📊 ADVANCED EXPORT LOGS
// ==========================
router.get("/export", verifyToken, requireRole("admin"), exportLimiter, async (req, res) => {
  try {
    const { deptId, dateRange, type } = req.query;

    // 1. Calculate Date Range (without mutating `now`)
    const now = new Date();
    let startDate, endDate;
    
    if (dateRange === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    } else if (dateRange === 'week') {
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); 
      startDate = new Date(now.getFullYear(), now.getMonth(), diff);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), diff + 6);
      endDate.setHours(23, 59, 59, 999);
    } else { // month
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    // 2. Fetch Data via MySQL JOIN (with optional deptId filter)
    let sql = `
      SELECT al.time_in, al.time_out, e.name, e.employee_id, e.role, d.groupno
      FROM attendance_logs al
      JOIN employees e ON al.employee_db_id = e.id
      LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user
      WHERE al.time_in >= ? AND al.time_in <= ?
    `;
    const queryParams = [startDate, endDate];

    if (deptId) {
      sql += ` AND d.groupno = ?`;
      queryParams.push(parseInt(deptId));
    }

    // Safety limit: cap at 10,000 rows to prevent memory exhaustion
    sql += ` ORDER BY al.time_in DESC LIMIT 10001`;
    const [rows] = await db.promise().query(sql, queryParams);

    if (rows.length > 10000) {
      return res.status(400).json({
        message: "Export is too large. Please narrow the date range or select a specific department.",
      });
    }

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
      
      (rows || []).forEach(r => {
        stats["All Staff"].total++;
        const duration = r.time_out ? 
          (new Date(r.time_out) - new Date(r.time_in)) / 1000 / 60 : 0;
        stats["All Staff"].durations.push(duration);
        
        const timeIn = new Date(r.time_in);
        const cutoff = new Date(timeIn);
        cutoff.setHours(8, 30, 0, 0);
        if (timeIn > cutoff) {
          stats["All Staff"].late++;
        }
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

      (rows || []).forEach(r => {
        const duration = r.time_out ? 
          Math.round((new Date(r.time_out) - new Date(r.time_in)) / 1000 / 60) : 0;
        const timeIn = new Date(r.time_in);
        const cutoff = new Date(timeIn);
        cutoff.setHours(8, 30, 0, 0);
        const isLate = timeIn > cutoff;
        
        detailSheet.addRow({
          employee_id: r.employee_id,
          name: r.name,
          role: r.role,
          date: new Date(r.time_in).toLocaleDateString(),
          time_in: new Date(r.time_in).toLocaleTimeString(),
          time_out: r.time_out ? new Date(r.time_out).toLocaleTimeString() : "Active",
          duration: duration,
          status: isLate ? "Late" : "On Time"
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
      (rows || []).forEach(r => {
        const empId = r.employee_id;
        if (!empStats[empId]) {
          empStats[empId] = { 
            employee_id: empId,
            name: r.name, 
            days: 0, 
            hours: 0, 
            late: 0 
          };
        }
        empStats[empId].days++;
        const duration = r.time_out ? 
          (new Date(r.time_out) - new Date(r.time_in)) / 1000 / 60 / 60 : 0;
        empStats[empId].hours += duration;
        
        const timeIn = new Date(r.time_in);
        const cutoff = new Date(timeIn);
        cutoff.setHours(8, 30, 0, 0);
        if (timeIn > cutoff) {
          empStats[empId].late++;
        }
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

      (rows || []).forEach(r => {
        const duration = r.time_out ? 
          Math.round((new Date(r.time_out) - new Date(r.time_in)) / 1000 / 60) : 0;
        const timeIn = new Date(r.time_in);
        const cutoff = new Date(timeIn);
        cutoff.setHours(8, 30, 0, 0);
        const isLate = timeIn > cutoff;
        
        breakdownSheet.addRow({
          date: new Date(r.time_in).toLocaleDateString(),
          name: r.name,
          time_in: new Date(r.time_in).toLocaleTimeString(),
          time_out: r.time_out ? new Date(r.time_out).toLocaleTimeString() : "-",
          duration: `${duration} mins`,
          remark: isLate ? "LATE" : "-"
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
    res.status(500).json({ message: "Failed to generate report" });
  }
});

module.exports = router;
