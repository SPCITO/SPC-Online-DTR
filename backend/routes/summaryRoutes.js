// ============================================================
// SPC Online DTR — Both/Summary attendance endpoint (M.69)
//
// GET /api/attendance/summary — employee-day summary groups built
// from the two EXISTING sources (attendance_logs + dtr_entry) via
// independent queries and application-level grouping. Read-only.
//
// Pagination is GROUP-level (employee + Manila day), so a day is
// never split across pages and no session is duplicated.
//
// Authorization: self-or-admin (existing model). A non-admin always
// receives only their own groups; client-supplied employee IDs can
// never widen the scope.
// ============================================================

const express = require("express");
const router = express.Router();
const { fetchSummaryPage, mapSourceError } = require("../services/attendanceSources");
const { manilaRangeFromQuery } = require("../utils/phTime");

router.get("/summary", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const range = manilaRangeFromQuery(req.query);

    const isAdmin = req.user.role === "admin";
    let employeeDbId = null;
    if (!isAdmin) {
      employeeDbId = req.user.id;
    } else if (req.query.employee_db_id) {
      const n = parseInt(req.query.employee_db_id, 10);
      if (isNaN(n) || n <= 0) {
        return res.status(400).json({ message: "Invalid employee filter" });
      }
      employeeDbId = n;
    }

    const deptId = req.query.deptId ? parseInt(req.query.deptId, 10) : null;

    const { groups, total } = await fetchSummaryPage({
      start: range ? range.start : null,
      end: range ? range.end : null,
      employeeDbId,
      deptId,
      search: req.query.search || "",
      page,
      limit,
    });

    return res.json({
      groups,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    const mapped = mapSourceError(err);
    if (mapped.status === 503) {
      return res.status(503).json({ message: mapped.message, code: mapped.code });
    }
    console.error("GET attendance summary error:", mapped);
    return res.status(500).json({ message: "Failed to fetch attendance summary" });
  }
});

module.exports = router;
