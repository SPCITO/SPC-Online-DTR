const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { manilaRangeFromQuery } = require("../utils/phTime");
const {
  parseSourceParam,
  fetchBiometricSessions,
  fetchSummaryPage,
  mapSourceError,
} = require("../services/attendanceSources");

// M.69: source-aware error/response helpers. The Online DTR query
// behavior below is unchanged; `source` only routes to the read-only
// biometric source or the Both/Summary aggregation.
function sendSourceError(res, err) {
  const mapped = mapSourceError(err);
  if (mapped.status === 503) {
    return res.status(503).json({ message: mapped.message, code: mapped.code });
  }
  console.error("GET source logs error:", mapped);
  return res.status(500).json({ message: "Failed to fetch logs" });
}

function biometricRowToApi(row) {
  return {
    id: row.id,
    source: row.source,
    source_id: row.source_id,
    time_in: row.time_in,
    time_out: row.time_out,
    closed_by: null,
    status: row.status,
    pending: row.pending,
    no_time_out: row.no_time_out,
    employee_db_id: row.employee_db_id,
    employee_id: row.employee_id,
    role: row.role,
    name: row.name,
    department_id: row.department_id,
    date: row.date,
  };
}
const requireRole = require("../middleware/requireRole");

// ==========================
// GET ALL LOGS (ADMIN ONLY)
// ==========================
router.get("/", requireRole("admin"), async (req, res) => {
  let page = Math.max(1, parseInt(req.query.page) || 1);
  let limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const search = req.query.search || "";
  const offset = (page - 1) * limit;
  // Server-side date window (today|week|month or explicit from/to days) —
  // payroll-safe: the database filters, never a partially-loaded page.
  const range = manilaRangeFromQuery(req.query);

  // M.69: source selector — default "online" preserves existing behavior.
  const parsed = parseSourceParam(req.query.source);
  if (!parsed.ok) {
    return res.status(400).json({ message: "Invalid source. Use 'online', 'biometrics' or 'both'." });
  }


    if (parsed.source === "biometrics") {
      const { sessions } = await fetchBiometricSessions({
        start: range ? range.start : null,
        end: range ? range.end : null,
        search,
        limit,
        offset,
      });
      return res.json(sessions.map(biometricRowToApi));
    }
    if (parsed.source === "both") {
      const { groups, total } = await fetchSummaryPage({
        start: range ? range.start : null,
        end: range ? range.end : null,
        search,
        page,
        limit,
      });
      return res.json({ groups, total, page, limit, totalPages: Math.ceil(total / limit) });
    }

  try {
    let sql = `
      SELECT al.id, al.time_in, al.time_out, al.employee_db_id,
             e.employee_id, e.role, COALESCE(d.fullname, e.name) AS fullname,
             COALESCE(d.groupno, e.department_id) AS groupno
      FROM attendance_logs al
      JOIN employees e ON al.employee_db_id = e.id
      LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user
    `;
    const params = [];

    if (search && search.trim() !== "") {
      const searchNum = parseInt(search);
      if (!isNaN(searchNum)) {
        sql += ` WHERE COALESCE(d.fullname, e.name) LIKE ? OR al.employee_db_id = ?`;
        params.push(`%${search}%`, searchNum);
      } else {
        sql += ` WHERE COALESCE(d.fullname, e.name) LIKE ?`;
        params.push(`%${search}%`);
      }
    }

    sql += ` ORDER BY al.time_in DESC, al.id DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const [rows] = await db.promise().query(sql, params);

    const transformed = (rows || []).map(log => ({
      // M.69: additive source metadata (response-level only, never persisted)
      source: "ONLINE_DTR",
      source_id: log.id,
      id: log.id,
      time_in: log.time_in,
      time_out: log.time_out,
      employee_db_id: log.employee_db_id,
      employee_id: log.employee_id,
      role: log.role,
      name: log.fullname,
      department_id: log.groupno
    }));

    res.json(transformed);
  } catch (err) {
    return sendSourceError(res, err);
  }
});

// ==========================
// GET USER LOGS
// ==========================
router.get("/me/:employee_db_id", async (req, res) => {
  const { employee_db_id } = req.params;

  // Ownership check: employees can only view their own logs
  if (parseInt(employee_db_id) !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  // Pagination with safe defaults and limits
  let page = Math.max(1, parseInt(req.query.page) || 1);
  let limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  // M.69: source selector (self-scoped for all sources).
  const parsed = parseSourceParam(req.query.source);
  if (!parsed.ok) {
    return res.status(400).json({ message: "Invalid source. Use 'online', 'biometrics' or 'both'." });
  }


    if (parsed.source === "biometrics") {
      const { sessions, total } = await fetchBiometricSessions({
        employeeDbId: parseInt(employee_db_id, 10),
        limit,
        offset,
      });
      return res.json({
        logs: sessions.map(biometricRowToApi),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    }
    if (parsed.source === "both") {
      const { groups, total } = await fetchSummaryPage({
        employeeDbId: parseInt(employee_db_id, 10),
        page,
        limit,
      });
      return res.json({ groups, total, page, limit, totalPages: Math.ceil(total / limit) });
    }

  try {
    // Get total count
    const [[{ total }]] = await db.promise().query(
      "SELECT COUNT(*) AS total FROM attendance_logs WHERE employee_db_id = ?",
      [employee_db_id]
    );

    const [rows] = await db.promise().query(
      `SELECT al.id, al.time_in, al.time_out, COALESCE(d.fullname, e.name) AS fullname,
              COALESCE(d.groupno, e.department_id) AS groupno
       FROM attendance_logs al
       JOIN employees e ON al.employee_db_id = e.id
       LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user
       WHERE al.employee_db_id = ?
       ORDER BY al.time_in DESC, al.id DESC
       LIMIT ? OFFSET ?`,
      [employee_db_id, limit, offset]
    );

    const logs = (rows || []).map(log => ({
      // M.69: additive source metadata (response-level only, never persisted)
      source: "ONLINE_DTR",
      source_id: log.id,
      id: log.id,
      time_in: log.time_in,
      time_out: log.time_out,
      name: log.fullname,
      department_id: log.groupno
    }));

    res.json({
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    return sendSourceError(res, err);
  }
});

// Dead route GET /monthly/:employee_id removed — functionality served by monthlyRoutes.js

module.exports = router;
