// ============================================================
// SPC Online DTR — Source-aware attendance access (M.69)
//
// Read-only presentation layer over the two EXISTING attendance
// sources in sysa_dtr (no new tables, no replication):
//   ONLINE_DTR — attendance_logs
//   BIOMETRICS — dtr_entry → dtr_user → employees
//
// Identity: employees.dtr_user_id = dtr_user.PK_user = dtr_entry.FK_user
//
// Both/Summary is built from INDEPENDENT source queries plus
// application-level grouping — NEVER a row-level JOIN between the
// two attendance tables (that multiplies multi-session days).
//
// BIOMETRIC ATTENDANCE IS SELECT-ONLY. This module never writes to
// dtr_entry or any biometric table.
//
// Pure logic (parsing, grouping, reconciliation) is exported without
// touching the database so it can be unit-tested standalone.
// ============================================================

const { philippineDateStr } = require("../utils/phTime");

const SOURCES = {
  ONLINE: "online",
  BIOMETRICS: "biometrics",
  BOTH: "both",
};

// TOLERANCE: BUSINESS DECISION PENDING — used ONLY to label a 1:1 pair
// as MATCHED vs TIME_MISMATCH. It never pairs records, never credits
// hours and never drops rows. Payroll must approve the final value.
const MATCH_TOLERANCE_MINUTES = 5;

const SOURCE_LABELS = {
  ONLINE_DTR: "ONLINE_DTR",
  BIOMETRICS: "BIOMETRICS",
};

// ---------- source parameter ----------

/**
 * Parse the `source` query parameter.
 * Missing → "online" (existing behavior preserved).
 * @returns {{ok: true, source: string} | {ok: false}}
 */
function parseSourceParam(value) {
  if (value === undefined || value === null || value === "") {
    return { ok: true, source: SOURCES.ONLINE };
  }
  const v = String(value).toLowerCase();
  if (v === SOURCES.ONLINE || v === SOURCES.BIOMETRICS || v === SOURCES.BOTH) {
    return { ok: true, source: v };
  }
  return { ok: false };
}

// ---------- Manila wall-time helpers (Asia/Manila, no UTC day math) ----------

/** "YYYY-MM-DD HH:MM:SS" wall string → epoch ms at Asia/Manila. */
function wallToEpoch(wall) {
  return new Date(String(wall).replace(" ", "T") + "+08:00").getTime();
}

/** Serialize an instant as the Manila wall string the app stores. */
function manilaWallString(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

/**
 * Attendance-day key (YYYY-MM-DD, Asia/Manila).
 *  - wall strings are stored Manila-local: the date prefix IS the day
 *  - Date instants are formatted in Asia/Manila (never toISOString())
 */
function manilaDayKey(value) {
  if (value instanceof Date) return philippineDateStr(value);
  return String(value).slice(0, 10);
}

/** Normalize a mysql2 DATE column value (string or driver Date) to YYYY-MM-DD. */
function dayColumnToKey(value) {
  if (value instanceof Date) return philippineDateStr(value);
  return String(value).slice(0, 10);
}

/** Normalize a mysql2 TIME column value to "HH:MM:SS" or null. */
function timeColumnToString(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

// ---------- session normalization ----------

/** attendance_logs row → Online DTR session (display-ready). */
function normalizeOnlineRow(row) {
  const timeInWall = manilaWallString(new Date(row.time_in));
  const timeOutWall = row.time_out ? manilaWallString(new Date(row.time_out)) : null;
  return {
    source: SOURCE_LABELS.ONLINE_DTR,
    source_id: row.id,
    id: row.id,
    employee_db_id: row.employee_db_id,
    employee_id: row.employee_id ?? null,
    role: row.role ?? null,
    name: row.name ?? row.fullname ?? null,
    department_id: row.groupno ?? row.department_id ?? null,
    date: manilaDayKey(timeInWall),
    time_in: timeInWall,
    time_out: timeOutWall,
    closed_by: row.closed_by,
    status: row.status,
    pending: row.pending,
    no_time_out: row.no_time_out,
  };
}

/**
 * dtr_entry row → Biometrics session (display-ready).
 * tdate is the authoritative attendance day. NULL timein/timeout are
 * preserved as null — never dropped, never invented.
 */
function normalizeBiometricRow(row) {
  const day = dayColumnToKey(row.date ?? row.tdate);
  const timeIn = timeColumnToString(row.timein);
  const timeOut = timeColumnToString(row.timeout);
  return {
    source: SOURCE_LABELS.BIOMETRICS,
    source_id: row.source_id ?? row.PK_entry,
    id: row.source_id ?? row.PK_entry,
    employee_db_id: row.employee_db_id,
    employee_id: row.employee_id ?? null,
    role: row.role ?? null,
    name: row.fullname ?? row.name ?? null,
    department_id: row.groupno ?? row.department_id ?? null,
    date: day,
    time_in: timeIn ? `${day} ${timeIn}` : null,
    time_out: timeOut ? `${day} ${timeOut}` : null,
    closed_by: null,
    status: "BIOMETRIC",
    pending: false,
    no_time_out: timeOut === null,
  };
}

// ---------- grouping + reconciliation (pure) ----------

function sessionHasMissingTimeout(s) {
  return !s.time_out;
}

/**
 * Group a mixed session stream by (employee_db_id, Manila day).
 * Every native source row is preserved — multi-session days stay
 * multi-session; nothing is collapsed or paired here.
 * Ordering: date DESC, employee_db_id ASC.
 */
function groupEmployeeDays(sessions) {
  const map = new Map();
  for (const s of sessions) {
    const key = `${s.employee_db_id}|${s.date}`;
    if (!map.has(key)) {
      map.set(key, {
        employee_db_id: s.employee_db_id,
        employee_id: s.employee_id,
        role: s.role,
        name: s.name,
        department_id: s.department_id,
        date: s.date,
        online: [],
        biometrics: [],
      });
    }
    const g = map.get(key);
    if (s.source === SOURCE_LABELS.ONLINE_DTR) g.online.push(s);
    else g.biometrics.push(s);
  }
  const groups = Array.from(map.values());
  for (const g of groups) {
    g.reconciliation = computeReconciliation(g);
  }
  groups.sort((a, b) =>
    a.date === b.date
      ? a.employee_db_id - b.employee_db_id
      : a.date < b.date
      ? 1
      : -1
  );
  return groups;
}

/**
 * Computed presentation state only — never persisted.
 * States: MATCHED | BIOMETRIC_ONLY | ONLINE_ONLY | TIME_MISMATCH |
 *         MISSING_TIMEOUT | DUPLICATE_CANDIDATE
 */
function computeReconciliation(group) {
  const on = group.online || [];
  const bio = group.biometrics || [];
  const flags = [];
  if ([...on, ...bio].some(sessionHasMissingTimeout)) flags.push("MISSING_TIMEOUT");

  if (on.length === 0 && bio.length === 0) {
    return { state: "ONLINE_ONLY", flags }; // unreachable; defensive
  }
  if (on.length === 0) return { state: "BIOMETRIC_ONLY", flags };
  if (bio.length === 0) return { state: "ONLINE_ONLY", flags };

  // Both present. Ambiguous multi-session days are NEVER auto-paired
  // just because timestamps are close — mark for review instead.
  if (on.length !== 1 || bio.length !== 1) {
    return { state: "DUPLICATE_CANDIDATE", flags };
  }

  if (flags.includes("MISSING_TIMEOUT")) {
    return { state: "MISSING_TIMEOUT", flags };
  }

  const deltaIn = Math.abs(wallToEpoch(on[0].time_in) - wallToEpoch(bio[0].time_in)) / 60000;
  const deltaOut = Math.abs(wallToEpoch(on[0].time_out) - wallToEpoch(bio[0].time_out)) / 60000;
  const matched = deltaIn <= MATCH_TOLERANCE_MINUTES && deltaOut <= MATCH_TOLERANCE_MINUTES;
  return {
    state: matched ? "MATCHED" : "TIME_MISMATCH",
    flags: [...flags, matched ? "TIME_IN_OUT_WITHIN_TOLERANCE" : "TIME_IN_OUT_DIVERGE"],
  };
}

/** Span metrics over one source's sessions (min in → max out). */
function spanOfSessions(sessions) {
  const ins = (sessions || []).filter((s) => s.time_in).map((s) => String(s.time_in)).sort();
  const outs = (sessions || []).filter((s) => s.time_out).map((s) => String(s.time_out)).sort();
  const first_in = ins.length ? ins[0] : null;
  const last_out = outs.length ? outs[outs.length - 1] : null;
  const hours =
    first_in && last_out
      ? (wallToEpoch(last_out) - wallToEpoch(first_in)) / 3600000
      : 0;
  return { first_in, last_out, hours: Math.max(0, Number(hours.toFixed(2))) };
}

/**
 * Monthly day model from source sessions (pure).
 * M.70: metrics are derived per source — min/max session bounds, and
 * hours never mix Online DTR with Biometrics. Multi-session days keep
 * every session; hours are raw recorded spans, never credit decisions.
 */
function buildDaysFromSessions(sessions, { includeSources }) {
  const grouped = {};
  for (const s of sessions) {
    if (!grouped[s.date]) {
      grouped[s.date] = { date: s.date, logs: [], online: [], biometrics: [] };
    }
    grouped[s.date].logs.push(s);
    if (s.source === SOURCE_LABELS.ONLINE_DTR) grouped[s.date].online.push(s);
    else grouped[s.date].biometrics.push(s);
  }
  return Object.values(grouped).map((d) => {
    // Primary source for day metrics: Online DTR when present, else
    // Biometrics — the metric is never a cross-source span.
    const primary = includeSources
      ? d.online.length > 0
        ? d.online
        : d.biometrics
      : d.logs;
    const primarySpan = spanOfSessions(primary);
    const bioSpan = spanOfSessions(d.biometrics);

    const hasNoTimeOut =
      primary.some((l) => !l.time_out) && !primary.some((l) => l.time_out);

    const out = {
      date: d.date,
      first_in: primarySpan.first_in,
      last_out: primarySpan.last_out,
      hours: hasNoTimeOut ? null : primarySpan.hours,
      hours_source: includeSources
        ? d.online.length > 0
          ? SOURCE_LABELS.ONLINE_DTR
          : SOURCE_LABELS.BIOMETRICS
        : undefined,
      status: hasNoTimeOut
        ? "NO TIME-OUT"
        : d.online.length > 0
        ? "USER"
        : "BIOMETRIC",
      pending: false,
      no_time_out: hasNoTimeOut,
    };
    if (includeSources) {
      out.logs = primary.map((s) => ({
        id: s.source_id,
        source: s.source,
        source_id: s.source_id,
        time_in: s.time_in,
        time_out: s.time_out,
        closed_by: s.closed_by ?? null,
      }));
      out.online = d.online.map((s) => ({
        id: s.source_id,
        source: s.source,
        source_id: s.source_id,
        time_in: s.time_in,
        time_out: s.time_out,
        closed_by: s.closed_by,
      }));
      out.biometrics = d.biometrics.map((s) => ({
        id: s.source_id,
        source: s.source,
        source_id: s.source_id,
        time_in: s.time_in,
        time_out: s.time_out,
        closed_by: null,
      }));
      if (d.biometrics.length > 0) out.biometrics_hours = bioSpan.hours;
    }
    return out;
  });
}

// ---------- query helpers (lazy DB access; SELECT only) ----------

function getDb() {
  return require("../config/db"); // main app pool (attendance_logs)
}
function getDbRead() {
  return require("../config/dbRead"); // read-only biometric access
}

/** Map DB access failures to a clear, honest API error. */
function mapSourceError(err) {
  if (
    err &&
    (err.code === "ER_TABLEACCESS_DENIED_ERROR" ||
      err.code === "ER_SPECIFIC_ACCESS_DENIED_ERROR" ||
      err.code === "ER_COLUMNACCESS_DENIED_ERROR" ||
      err.code === "ER_ACCESS_DENIED_ERROR")
  ) {
    const e = new Error(
      "Biometric read access is not provisioned yet (DBA grant pending)"
    );
    e.status = 503;
    e.code = "BIOMETRIC_READ_PENDING";
    return e;
  }
  return err;
}

function buildSearchClauses(search, nameExpr, idExpr, params) {
  const conditions = [];
  if (search && String(search).trim() !== "") {
    const searchNum = parseInt(search, 10);
    if (!isNaN(searchNum)) {
      conditions.push(`(${nameExpr} LIKE ? OR ${idExpr} = ?)`);
      params.push(`%${search}%`, searchNum);
    } else {
      conditions.push(`${nameExpr} LIKE ?`);
      params.push(`%${search}%`);
    }
  }
  return conditions;
}

function buildScopeClauses({ start, end, employeeDbId, deptId, timeExpr, dayExpr }, params, deptExpr = "COALESCE(du.groupno, e.department_id)") {
  const conditions = [];
  if (start) {
    if (dayExpr) {
      conditions.push(`${dayExpr} >= ?`);
      params.push(manilaDayKey(start));
    } else {
      conditions.push(`${timeExpr} >= ?`);
      params.push(start);
    }
  }
  if (end) {
    if (dayExpr) {
      conditions.push(`${dayExpr} <= ?`);
      params.push(manilaDayKey(end));
    } else {
      conditions.push(`${timeExpr} <= ?`);
      params.push(end);
    }
  }
  if (employeeDbId) {
    conditions.push("e.id = ?");
    params.push(employeeDbId);
  }
  if (deptId) {
    conditions.push(`${deptExpr} = ?`);
    params.push(deptId);
  }
  return conditions;
}

/** Restrict a query to a page's (employee_db_id, day) keys. */
function buildKeyClauses(keys, empExpr, dayExpr, params) {
  if (!keys || keys.length === 0) return [];
  const tuples = keys.map(() => "(?, ?)").join(", ");
  for (const k of keys) {
    params.push(k.employee_db_id, k.date);
  }
  return [`(${empExpr}, ${dayExpr}) IN (${tuples})`];
}

/**
 * Online DTR sessions from attendance_logs (existing semantics).
 * @returns {Promise<{sessions: Array, total: number}>}
 */
async function fetchOnlineSessions(opts = {}) {
  const { search, limit, offset, keys } = opts;
  const params = [];
  const where = [];
  where.push(...buildScopeClauses(
    { ...opts, timeExpr: "al.time_in" },
    params,
    "COALESCE(d.groupno, e.department_id)"
  ));
  where.push(...buildKeyClauses(keys, "al.employee_db_id", "DATE(al.time_in)", params));
  where.push(...buildSearchClauses(
    search,
    "COALESCE(d.fullname, e.name)",
    "al.employee_db_id",
    params
  ));

  const from = `FROM attendance_logs al
       JOIN employees e ON al.employee_db_id = e.id
       LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user`;
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";

  const [[{ total }]] = await getDb().promise().query(
    `SELECT COUNT(*) AS total ${from}${whereSql}`,
    params
  );

  const pageParams = [...params];
  let limitSql = "";
  if (limit !== undefined && limit !== null) {
    limitSql = " LIMIT ? OFFSET ?";
    pageParams.push(limit, offset || 0);
  }
  const [rows] = await getDb().promise().query(
    `SELECT al.id, al.employee_db_id, al.time_in, al.time_out, al.closed_by,
            e.employee_id, e.role, COALESCE(d.fullname, e.name) AS fullname,
            COALESCE(d.groupno, e.department_id) AS groupno
     ${from}${whereSql}
     ORDER BY al.time_in DESC, al.id DESC${limitSql}`,
    pageParams
  );
  return { sessions: (rows || []).map(normalizeOnlineRow), total: total || 0 };
}

/**
 * Biometric sessions from dtr_entry (SELECT ONLY).
 * dtr_entry.tdate is the authoritative attendance day.
 */
async function fetchBiometricSessions(opts = {}) {
  const { search, limit, offset, keys } = opts;
  const params = [];
  const where = [];
  where.push(...buildScopeClauses(
    { ...opts, timeExpr: "de.tdate", dayExpr: "de.tdate" },
    params
  ));
  where.push(...buildKeyClauses(keys, "e.id", "de.tdate", params));
  where.push(...buildSearchClauses(
    search,
    "COALESCE(du.fullname, e.name)",
    "e.id",
    params
  ));

  const from = `FROM dtr_entry de
       JOIN dtr_user du ON du.PK_user = de.FK_user
       JOIN employees e ON e.dtr_user_id = du.PK_user`;
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";

  try {
    const [[{ total }]] = await getDbRead().query(
      `SELECT COUNT(*) AS total ${from}${whereSql}`,
      params
    );

    const pageParams = [...params];
    let limitSql = "";
    if (limit !== undefined && limit !== null) {
      limitSql = " LIMIT ? OFFSET ?";
      pageParams.push(limit, offset || 0);
    }
    const [rows] = await getDbRead().query(
      `SELECT de.PK_entry AS source_id, de.tdate, de.timein, de.timeout,
              e.id AS employee_db_id, e.employee_id, e.role,
              COALESCE(du.fullname, e.name) AS fullname,
              COALESCE(du.groupno, e.department_id) AS groupno
       ${from}${whereSql}
       ORDER BY de.tdate DESC, de.PK_entry DESC${limitSql}`,
      pageParams
    );
    return { sessions: (rows || []).map(normalizeBiometricRow), total: total || 0 };
  } catch (err) {
    throw mapSourceError(err);
  }
}

/** Employee-day group keys from one source (tiny result sets). */
async function fetchGroupKeys(source, opts = {}) {
  const { search } = opts;
  const params = [];
  const where = [];
  if (source === SOURCE_LABELS.ONLINE_DTR) {
    where.push(...buildScopeClauses(
      { ...opts, timeExpr: "al.time_in" },
      params,
      "COALESCE(d.groupno, e.department_id)"
    ));
    where.push(...buildSearchClauses(search, "COALESCE(d.fullname, e.name)", "al.employee_db_id", params));
    const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const [rows] = await getDb().promise().query(
      `SELECT DISTINCT al.employee_db_id AS employee_db_id, DATE(al.time_in) AS day
       FROM attendance_logs al
       JOIN employees e ON al.employee_db_id = e.id
       LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user
       ${whereSql}`,
      params
    );
    return (rows || []).map((r) => ({
      employee_db_id: r.employee_db_id,
      date: dayColumnToKey(r.day),
    }));
  }

  where.push(...buildScopeClauses({ ...opts, timeExpr: "de.tdate", dayExpr: "de.tdate" }, params));
  where.push(...buildSearchClauses(search, "COALESCE(du.fullname, e.name)", "e.id", params));
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  try {
    const [rows] = await getDbRead().query(
      `SELECT DISTINCT e.id AS employee_db_id, de.tdate AS day
       FROM dtr_entry de
       JOIN dtr_user du ON du.PK_user = de.FK_user
       JOIN employees e ON e.dtr_user_id = du.PK_user
       ${whereSql}`,
      params
    );
    return (rows || []).map((r) => ({
      employee_db_id: r.employee_db_id,
      date: dayColumnToKey(r.day),
    }));
  } catch (err) {
    throw mapSourceError(err);
  }
}

/**
 * Both/Summary with GROUP-LEVEL pagination: the page slice is taken
 * over employee-day keys (never over raw sessions), so an employee-day
 * is never split across pages and no session is duplicated.
 * @returns {Promise<{groups: Array, total: number}>}
 */
async function fetchSummaryPage(opts = {}) {
  const { page = 1, limit = 25 } = opts;
  const [onlineKeys, bioKeys] = await Promise.all([
    fetchGroupKeys("ONLINE_DTR", opts),
    fetchGroupKeys("BIOMETRICS", opts),
  ]);

  const keyMap = new Map();
  for (const k of [...onlineKeys, ...bioKeys]) {
    keyMap.set(`${k.employee_db_id}|${k.date}`, k);
  }
  const keys = Array.from(keyMap.values()).sort((a, b) =>
    a.date === b.date ? a.employee_db_id - b.employee_db_id : a.date < b.date ? 1 : -1
  );
  const total = keys.length;
  const startIdx = (page - 1) * limit;
  const pageKeys = keys.slice(startIdx, startIdx + limit);
  if (pageKeys.length === 0) return { groups: [], total };

  const [onlineRes, bioRes] = await Promise.all([
    fetchOnlineSessions({ ...opts, keys: pageKeys, limit: null, offset: 0 }),
    fetchBiometricSessions({ ...opts, keys: pageKeys, limit: null, offset: 0 }),
  ]);
  return { groups: groupEmployeeDays([...onlineRes.sessions, ...bioRes.sessions]), total };
}

module.exports = {
  SOURCES,
  SOURCE_LABELS,
  MATCH_TOLERANCE_MINUTES,
  parseSourceParam,
  wallToEpoch,
  manilaWallString,
  manilaDayKey,
  normalizeOnlineRow,
  normalizeBiometricRow,
  groupEmployeeDays,
  computeReconciliation,
  spanOfSessions,
  buildDaysFromSessions,
  mapSourceError,
  fetchOnlineSessions,
  fetchBiometricSessions,
  fetchGroupKeys,
  fetchSummaryPage,
};
