const express = require("express");
const router = express.Router();
const db = require("../config/db");

const logSecurityEvent = require("../utils/securityLogger");

// ==========================
// TIME IN
// ==========================
router.post("/time-in", async (req, res) => {
  const { employee_db_id } = req.body;
  
  const now = new Date();
  
  if (!employee_db_id) {
    return res.status(400).json({
      message: "Employee DB ID is required",
    });
  }
  
  try {
    const { error } = await db.supabase
      .from('attendance_logs')
      .insert([{
        employee_db_id,
        time_in: now.toISOString()
      }]);

    if (error) {
      console.error(error);
      return res.status(500).json({
        message: "Time In failed",
      });
    }

    logSecurityEvent({
      employee_id: employee_db_id,
      action_type: "TIME_IN",
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
      session_id: req.user?.session_id,
    });

    res.json({
      message: "Time In recorded",
      time: now,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Time In failed",
    });
  }
});

// ==========================
// TIME OUT
// ==========================
router.post("/time-out", async (req, res) => {
  const { employee_db_id } = req.body;
  
  const now = new Date();
  
  if (!employee_db_id) {
    return res.status(400).json({
      message: "Employee DB ID is required",
    });
  }
  
  try {
    // Get today's date range
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
    
    // Find the latest attendance log for today without time_out
    const { data: logs } = await db.supabase
      .from('attendance_logs')
      .select('id')
      .eq('employee_db_id', employee_db_id)
      .gte('time_in', startOfDay)
      .lte('time_in', endOfDay)
      .is('time_out', null)
      .order('time_in', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!logs) {
      return res.status(404).json({
        message: "No active time-in record found for today",
      });
    }

    const { error } = await db.supabase
      .from('attendance_logs')
      .update({ time_out: now.toISOString() })
      .eq('id', logs.id);

    if (error) {
      console.error(error);
      return res.status(500).json({
        message: "Time Out failed",
      });
    }

    logSecurityEvent({
      employee_id: employee_db_id,
      action_type: "TIME_OUT",
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
      session_id: req.user?.session_id,
    });

    res.json({
      message: "Time Out recorded",
      time: now,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Time Out failed",
    });
  }
});

module.exports = router;
