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
router.get("/:deptId/logs", verifyToken, async (req, res) => {
  try {
    const deptId = Number(req.params.deptId);

    // Fetch attendance logs with employee + department relation
    const { data, error } = await db.supabase
      .from("attendance_logs")
      .select(`
        id,
        employee_db_id,
        time_in,
        time_out,
        employees (
          id,
          name,
          employee_id,
          role,
          dtr_user_id,
          dtr_user (
            PK_user,
            groupno
          )
        )
      `)
      .order("time_in", { ascending: false });

    if (error) {
      console.error(error);
      return res.status(500).json({
        message: "Failed to fetch department logs",
      });
    }

    // Filter after fetching
    const logs = (data || [])
      .filter(
        (row) =>
          Number(row.employees?.dtr_user?.groupno) === deptId
      )
      .map((row) => ({
        id: row.id,
        employee_db_id: row.employee_db_id,
        name: row.employees?.name,
        employee_id: row.employees?.employee_id,
        role: row.employees?.role,
        department_id: row.employees?.dtr_user?.groupno,
        time_in: row.time_in,
        time_out: row.time_out,
      }));

    res.json(logs);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to fetch department logs",
    });
  }
});

// =====================================
// GET DEPARTMENT SUMMARY
// =====================================
router.get("/summary", async (req, res) => {
  try {
    // Get current date range for today
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

    // Fetch all employees with their departments
    const { data: employees } = await db.supabase
      .from('employees')
      .select(`
        id,
        dtr_user (
          FK_dept
        )
      `);

    // Fetch today's attendance logs
    const { data: logs } = await db.supabase
      .from('attendance_logs')
      .select(`
        employee_db_id,
        time_in,
        time_out
      `)
      .gte('time_in', startOfDay)
      .lte('time_in', endOfDay);

    // Calculate summary by department
    const deptSummary = {};

    (employees || []).forEach(emp => {
      const deptId = emp.dtr_user?.FK_dept || 'unknown';
      if (!deptSummary[deptId]) {
        deptSummary[deptId] = {
          department_id: deptId,
          total_employees: 0,
          active_count: 0,
          late_count: 0
        };
      }
      deptSummary[deptId].total_employees++;
    });

    (logs || []).forEach(log => {
      // Find employee's department
      const emp = (employees || []).find(e => e.id === log.employee_db_id);
      const deptId = emp?.dtr_user?.FK_dept || 'unknown';
      
      if (deptSummary[deptId]) {
        // Check if active (no time_out)
        if (!log.time_out) {
          deptSummary[deptId].active_count++;
        }
        
        // Check if late (after 8:30 AM)
        const timeIn = new Date(log.time_in);
        const cutoff = new Date(timeIn);
        cutoff.setHours(8, 30, 0);
        if (timeIn > cutoff) {
          deptSummary[deptId].late_count++;
        }
      }
    });

    res.json(Object.values(deptSummary));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to load summary" });
  }
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
    const { data: rows, error } = await db.supabase
      .from('attendance_logs')
      .select(`
        time_in,
        time_out,
        employees (
          name,
          employee_id,
          role
        )
      `)
      .gte('time_in', startDate.toISOString())
      .lte('time_in', endDate.toISOString());

    if (error) {
      throw new Error(error.message);
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
        cutoff.setHours(8, 0, 0);
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
        cutoff.setHours(8, 0, 0);
        const isLate = timeIn > cutoff;
        
        detailSheet.addRow({
          employee_id: r.employees?.employee_id,
          name: r.employees?.name,
          role: r.employees?.role,
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
        const empId = r.employees?.employee_id;
        if (!empStats[empId]) {
          empStats[empId] = { 
            employee_id: empId,
            name: r.employees?.name, 
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
        cutoff.setHours(8, 0, 0);
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
        cutoff.setHours(8, 0, 0);
        const isLate = timeIn > cutoff;
        
        breakdownSheet.addRow({
          date: new Date(r.time_in).toLocaleDateString(),
          name: r.employees?.name,
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
    res.status(500).json({ message: "Failed to generate report", error: error.message });
  }
});

module.exports = router;
