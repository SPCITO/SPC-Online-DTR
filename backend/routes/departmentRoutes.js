const express = require("express");
const router = express.Router();
const db = require("../config/db");
const ExcelJS = require("exceljs");
const rateLimit = require("express-rate-limit");

const verifyToken = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole"); 
const { getAllDepartments } = require("../utils/deptMapping");
const {
  philippineDateStr,
  manilaDayRange,
  manilaWeekRange,
  manilaMonthRange,
  manilaRangeFromQuery,
  manilaDateLabel,
  manilaTimeLabel,
} = require("../utils/phTime");
const { rowCredit, closedByLabel } = require("../utils/attendanceCredit");

// Rate limiter for exports: 10 per hour per authenticated user
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { message: "Too many export requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id.toString(),
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
router.get("/summary", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    // M.39 H1b: Manila calendar-day window (previously UTC-calendar bounds).
    const { start: startOfDay, end: endOfDay } = manilaDayRange();

    const [rows] = await db.promise().query(
      `SELECT COALESCE(d.groupno, e.department_id) AS department_id,
              COUNT(DISTINCT e.id) AS total_employees,
              SUM(CASE WHEN al.time_out IS NULL AND al.id IS NOT NULL THEN 1 ELSE 0 END) AS active_count
       FROM employees e
       LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user
       LEFT JOIN attendance_logs al ON al.employee_db_id = e.id
         AND al.time_in >= ? AND al.time_in <= ?
       GROUP BY COALESCE(d.groupno, e.department_id)`,
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
router.get("/:deptId/logs", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const deptId = Number(req.params.deptId);

    // Payroll-grade loading: server-side date window + pagination so every
    // historical day is retrievable (the old fixed 50-row window hid older
    // records entirely).
    let page = Math.max(1, parseInt(req.query.page) || 1);
    let limit = Math.min(1000, Math.max(1, parseInt(req.query.limit) || 200));
    const offset = (page - 1) * limit;
    const range = manilaRangeFromQuery(req.query);
    const rangeClause = range ? " AND al.time_in >= ? AND al.time_in <= ?" : "";
    const rangeParams = range ? [range.start, range.end] : [];

    // Get total count
    const [[{ total }]] = await db.promise().query(
      `SELECT COUNT(*) AS total
       FROM attendance_logs al
       JOIN employees e ON al.employee_db_id = e.id
       LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user
       WHERE COALESCE(d.groupno, e.department_id) = ?${rangeClause}`,
      [deptId, ...rangeParams]
    );

    const [rows] = await db.promise().query(
      `SELECT al.id, al.employee_db_id, al.time_in, al.time_out, al.closed_by,
              e.name, e.employee_id, e.role, COALESCE(d.groupno, e.department_id) AS groupno
       FROM attendance_logs al
       JOIN employees e ON al.employee_db_id = e.id
       LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user
       WHERE COALESCE(d.groupno, e.department_id) = ?${rangeClause}
       ORDER BY al.time_in DESC, al.id DESC
       LIMIT ? OFFSET ?`,
      [deptId, ...rangeParams, limit, offset]
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
      // USER / AUTO / ADMIN-CORRECTED — or OPEN / NO TIME-OUT (blank expired)
      closed_by: row.closed_by,
      status: rowCredit({ time_in: row.time_in, time_out: row.time_out, closed_by: row.closed_by }).status,
      pending: rowCredit({ time_in: row.time_in, time_out: row.time_out, closed_by: row.closed_by }).pending,
      no_time_out: rowCredit({ time_in: row.time_in, time_out: row.time_out, closed_by: row.closed_by }).expired,
    }));

    res.json({
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: offset + (rows || []).length < total,
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

    // Validate export type
    if (!type || !['all', 'department'].includes(type)) {
      return res.status(400).json({ message: "Invalid export type. Use 'all' or 'department'." });
    }

    // 1. Calculate Date Range — M.39 H1b: Manila calendar windows.
    // Week convention preserved: Monday..Sunday (same rule as before).
    // Explicit from/to days (payroll periods) override dateRange.
    let startDate, endDate;
    const explicit = manilaRangeFromQuery({ from: req.query.from, to: req.query.to });
    if (explicit) {
      ({ start: startDate, end: endDate } = explicit);
    } else if (dateRange === 'today') {
      ({ start: startDate, end: endDate } = manilaDayRange());
    } else if (dateRange === 'week') {
      ({ start: startDate, end: endDate } = manilaWeekRange());
    } else { // month
      const [phtYear, phtMonth] = philippineDateStr().split("-").map(Number);
      ({ start: startDate, end: endDate } = manilaMonthRange(phtYear, phtMonth));
    }

    // 2. Fetch Data via MySQL JOIN (with optional deptId filter)
    let sql = `
      SELECT al.time_in, al.time_out, al.closed_by, e.name, e.employee_id, e.role,
             COALESCE(d.groupno, e.department_id) AS groupno
      FROM attendance_logs al
      JOIN employees e ON al.employee_db_id = e.id
      LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user
      WHERE al.time_in >= ? AND al.time_in <= ?
    `;
    const queryParams = [startDate, endDate];

    if (deptId) {
      sql += ` AND COALESCE(d.groupno, e.department_id) = ?`;
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
        { header: "Avg Duration (mins)", key: "avg", width: 20 },
        { header: "Pending Rows", key: "pending", width: 15 }
      ];
      
      const stats = { "All Staff": { total: 0, late: 0, durations: [], pending: 0 } };
      
      (rows || []).forEach(r => {
        stats["All Staff"].total++;
        // Policy-aware credit: auto-closed rows pending correction contribute
        // no duration to the average and are counted in "Pending Rows".
        const credit = rowCredit(r);
        if (credit.pending) {
          stats["All Staff"].pending++;
        } else if (credit.minutes !== null) {
          stats["All Staff"].durations.push(credit.minutes);
        }
        
        const timeIn = new Date(r.time_in);
        const phtHour = (timeIn.getUTCHours() + 8) % 24;
        const phtMinute = timeIn.getUTCMinutes();
        if (phtHour > 8 || (phtHour === 8 && phtMinute > 30)) {
          stats["All Staff"].late++;
        }
      });

      Object.keys(stats).forEach(dept => {
        const s = stats[dept];
        const avg = s.durations.length ? (s.durations.reduce((a,b)=>a+b,0)/s.durations.length).toFixed(1) : 0;
        summarySheet.addRow({ dept, total: s.total, late: s.late, avg, pending: s.pending });
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
        { header: "Status", key: "status", width: 15 },
        { header: "Closed By", key: "closed_by", width: 18 }
      ];

      (rows || []).forEach(r => {
        const credit = rowCredit(r);
        const duration = credit.expired
          ? "—"
          : credit.pending
          ? "PENDING"
          : credit.minutes !== null
          ? credit.minutes
          : 0;
        const timeIn = new Date(r.time_in);
        const phtHour = (timeIn.getUTCHours() + 8) % 24;
        const phtMinute = timeIn.getUTCMinutes();
        const isLate = phtHour > 8 || (phtHour === 8 && phtMinute > 30);
        
        detailSheet.addRow({
          employee_id: r.employee_id,
          name: r.name,
          role: r.role,
          date: manilaDateLabel(r.time_in),
          time_in: manilaTimeLabel(r.time_in),
          time_out: r.time_out ? manilaTimeLabel(r.time_out) : credit.expired ? "NO TIME-OUT" : "Active",
          duration: duration,
          status: isLate ? "Late" : "On Time",
          closed_by: r.time_out ? closedByLabel(r.closed_by) : credit.expired ? "NO TIME-OUT" : "—"
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
        { header: "Times Late", key: "late", width: 15 },
        { header: "Pending Days", key: "pending", width: 15 }
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
            late: 0,
            pending: 0
          };
        }
        empStats[empId].days++;
        // Policy-aware credit: pending rows contribute no hours (counted
        // separately) so exports never fabricate worked time.
        const credit = rowCredit(r);
        if (credit.pending) {
          empStats[empId].pending++;
        } else if (credit.minutes !== null) {
          empStats[empId].hours += credit.minutes / 60;
        }
        
        const timeIn = new Date(r.time_in);
        const phtHour = (timeIn.getUTCHours() + 8) % 24;
        const phtMinute = timeIn.getUTCMinutes();
        if (phtHour > 8 || (phtHour === 8 && phtMinute > 30)) {
          empStats[empId].late++;
        }
      });

      Object.values(empStats).forEach(stat => {
        overviewSheet.addRow({
          employee_id: stat.employee_id,
          name: stat.name,
          days: stat.days,
          hours: stat.hours.toFixed(2),
          late: stat.late,
          pending: stat.pending
        });
      });

      const breakdownSheet = workbook.addWorksheet("Daily Breakdown");
      breakdownSheet.columns = [
        { header: "Date", key: "date", width: 12 },
        { header: "Employee", key: "name", width: 25 },
        { header: "Time In", key: "time_in", width: 15 },
        { header: "Time Out", key: "time_out", width: 15 },
        { header: "Duration", key: "duration", width: 12 },
        { header: "Remark", key: "remark", width: 15 },
        { header: "Closed By", key: "closed_by", width: 18 }
      ];

      (rows || []).forEach(r => {
        const credit = rowCredit(r);
        const duration = credit.expired
          ? "—"
          : credit.pending
          ? "PENDING"
          : credit.minutes !== null
          ? `${credit.minutes} mins`
          : "0 mins";
        const timeIn = new Date(r.time_in);
        const phtHour = (timeIn.getUTCHours() + 8) % 24;
        const phtMinute = timeIn.getUTCMinutes();
        const isLate = phtHour > 8 || (phtHour === 8 && phtMinute > 30);
        
        breakdownSheet.addRow({
          date: manilaDateLabel(r.time_in),
          name: r.name,
          time_in: manilaTimeLabel(r.time_in),
          time_out: r.time_out ? manilaTimeLabel(r.time_out) : credit.expired ? "NO TIME-OUT" : "-",
          duration: duration,
          remark: isLate ? "LATE" : "-",
          closed_by: r.time_out ? closedByLabel(r.closed_by) : credit.expired ? "NO TIME-OUT" : "—"
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
      `attachment; filename="DTR_Report_${dateRange}_${philippineDateStr()}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ message: "Failed to generate report" });
  }
});

module.exports = router;
