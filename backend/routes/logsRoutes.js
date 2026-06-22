const express = require("express");
const router = express.Router();
const db = require("../config/db");

// ==========================
// GET ALL LOGS (ADMIN)
// ==========================
router.get("/", async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;
  
  try {
    const { data, error } = await db.supabase
      .from('attendance_logs')
      .select(`
        id,
        time_in,
        time_out,
        employee_db_id,
        employees (
          id,
          employee_id,
          role,
          dtr_user (
            fullname,
            groupno
          )
        )
      `)
      .order('time_in', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) {
      console.error(error);
      return res.status(500).json({ message: "Failed to fetch logs" });
    }

    // Transform data to match expected format
    const transformed = (data || []).map(log => ({
      id: log.id,
      time_in: log.time_in,
      time_out: log.time_out,
      employee_db_id: log.employee_db_id,
      employee_id: log.employees?.employee_id,
      role: log.employees?.role,
      name: log.employees?.dtr_user?.fullname,
      department_id: log.employees?.dtr_user?.groupno
    }));

    res.json(transformed);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to fetch logs" });
  }
});

// ==========================
// GET USER LOGS
// ==========================
router.get("/me/:employee_db_id", async (req, res) => {
  const { employee_db_id } = req.params;
  
  try {
    const { data, error } = await db.supabase
      .from('attendance_logs')
      .select(`
        id,
        time_in,
        time_out,
        employees (
          dtr_user (
            fullname,
            groupno
          )
        )
      `)
      .eq('employee_db_id', employee_db_id)
      .order('time_in', { ascending: false });

    if (error) {
      console.error(error);
      return res.status(500).json({ message: "Server error" });
    }

    // Transform data to match expected format
    const transformed = (data || []).map(log => ({
      id: log.id,
      time_in: log.time_in,
      time_out: log.time_out,
      name: log.employees?.dtr_user?.fullname,
      department_id: log.employees?.dtr_user?.groupno
    }));

    res.json(transformed);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ==========================
// MONTHLY LOGS
// ==========================
router.get("/monthly/:employee_id", async (req, res) => {
  const { employee_id } = req.params;
  
  try {
    const { data, error } = await db.supabase
      .from('attendance_logs')
      .select(`
        id,
        time_in,
        time_out,
        employee_db_id,
        employees (
          employee_id,
          role,
          dtr_user (
            fullname,
            groupno
          )
        )
      `)
      .eq('employee_db_id', employee_id)
      .order('time_in', { ascending: true });

    if (error) {
      console.error(error);
      return res.status(500).json({ message: "Error" });
    }

    let totalHours = 0;
    let lateDays = 0;

    const grouped = {};

    (data || []).forEach((r) => {
      const date = new Date(r.time_in).toISOString().split("T")[0];

      if (!grouped[date]) {
        grouped[date] = {
          date,
          first_in: r.time_in,
          last_out: r.time_out,
        };
      }

      if (r.time_out) grouped[date].last_out = r.time_out;
    });

    const days = Object.values(grouped).map((d) => {
      let hours = 0;

      if (d.first_in && d.last_out) {
        hours =
          (new Date(d.last_out) - new Date(d.first_in)) /
          1000 /
          60 /
          60;

        totalHours += hours;
      }

      const inTime = new Date(d.first_in);
      const cutoff = new Date(d.first_in);
      cutoff.setHours(8, 30, 0);

      const isLate = inTime > cutoff;

      if (isLate) lateDays++;

      return {
        date: d.date,
        first_in: d.first_in,
        last_out: d.last_out,
        hours: hours.toFixed(2),
        late: isLate,
      };
    });

    res.json({
      days,
      summary: {
        total_hours: totalHours.toFixed(2),
        total_days: days.length,
        late_days: lateDays,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error" });
  }
});

module.exports = router;
