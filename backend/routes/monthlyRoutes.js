const express = require("express");
const router = express.Router();
const db = require("../config/db");

// GET MONTHLY LOGS
router.get("/:employee_db_id/:year/:month", async (req, res) => {
  const { employee_db_id, year, month } = req.params;
  
  try {
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();
    
    const { data: results, error } = await db.supabase
      .from('attendance_logs')
      .select('*')
      .eq('employee_db_id', employee_db_id)
      .gte('time_in', startDate)
      .lte('time_in', endDate)
      .order('time_in', { ascending: true });

    if (error) {
      console.error(error);
      return res.status(500).json({ message: "Error fetching monthly logs", error: error.message });
    }

    // GROUP BY DAY
    const grouped = {};

    (results || []).forEach((log) => {
      const date = new Date(log.time_in)
        .toISOString()
        .split("T")[0];

      if (!grouped[date]) {
        grouped[date] = {
          date,
          logs: [],
          first_in: log.time_in,
          last_out: log.time_out,
        };
      }

      grouped[date].logs.push(log);

      if (log.time_out) {
        grouped[date].last_out = log.time_out;
      }
    });

    const days = Object.values(grouped).map((d) => {
      const hours =
        (new Date(d.last_out) - new Date(d.first_in)) /
        (1000 * 60 * 60);

      return {
        date: d.date,
        first_in: d.first_in,
        last_out: d.last_out,
        hours: isNaN(hours) ? 0 : Number(hours.toFixed(2)),
        late: new Date(d.first_in).getHours() > 8, // example rule
      };
    });

    const total_hours = days.reduce(
      (sum, d) => sum + d.hours,
      0
    );

    const late_days = days.filter((d) => d.late).length;

    res.json({
      summary: {
        total_hours: total_hours.toFixed(2),
        late_days,
        total_days: days.length,
      },
      days,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error", error: err.message });
  }
});

module.exports = router;
