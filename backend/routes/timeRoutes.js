const express = require("express");
const router = express.Router();

const db = require("../config/db");

// =====================================
// TIME IN
// =====================================
router.post("/time-in", async (req, res) => {
  const { employee_db_id } = req.body;
  
  try {
    const now = new Date().toISOString();
    
    const { error } = await db.supabase
      .from('attendance_logs')
      .insert([{ employee_db_id, time_in: now }]);

    if (error) {
      console.error(error);
      return res.status(500).json({ message: "Time In failed" });
    }
    
    res.json({ message: "Time In recorded" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Time In failed" });
  }
});

// =====================================
// TIME OUT
// =====================================
router.post("/time-out", async (req, res) => {
  const { employee_db_id } = req.body;
  
  try {
    const now = new Date().toISOString();
    
    // Find the latest attendance log without time_out
    const { data: logs } = await db.supabase
      .from('attendance_logs')
      .select('id')
      .eq('employee_db_id', employee_db_id)
      .is('time_out', null)
      .order('time_in', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!logs) {
      return res.status(404).json({ message: "No active time-in record found" });
    }

    const { error } = await db.supabase
      .from('attendance_logs')
      .update({ time_out: now })
      .eq('id', logs.id);

    if (error) {
      console.error(error);
      return res.status(500).json({ message: "Time Out failed" });
    }
    
    res.json({ message: "Time Out recorded" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Time Out failed" });
  }
});

// =====================================
// STATUS
// =====================================
router.get("/status/:employee_db_id", async (req, res) => {
  const { employee_db_id } = req.params;
  
  try {
    const { data, error } = await db.supabase
      .from('attendance_logs')
      .select('*')
      .eq('employee_db_id', employee_db_id)
      .is('time_out', null)
      .order('time_in', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(error);
      return res.status(500).json({ message: "Status check failed" });
    }

    if (!data) {
      return res.json({
        status: "OUT",
        time_in: null,
      });
    }

    return res.json({
      status: "IN",
      time_in: data.time_in,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Status check failed" });
  }
});

// =====================================
// SERVER TIME
// =====================================
router.get("/", (req, res) => {
  res.json({
    time: new Date().toISOString(),
  });
});

module.exports = router;
