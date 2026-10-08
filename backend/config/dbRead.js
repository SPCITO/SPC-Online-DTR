// ============================================================
// SPC Online DTR — read-only access to biometric attendance (M.69)
//
// BIOMETRIC ATTENDANCE (dtr_entry) IS SELECT-ONLY FOR THIS APP.
//
// Preferred setup (school DBA provisioned): a dedicated read-only
// integration account configured via DTR_READ_* environment values.
// Fallback: the main application pool (works only after the DBA
// grants column-scoped SELECT on dtr_entry to dtr_app).
//
// This module never grants permissions and never logs credentials.
// ============================================================

const mysql = require("mysql2");
require("dotenv").config();

const hasDedicated = Boolean(process.env.DTR_READ_HOST);

let readPool = null;
if (hasDedicated) {
  readPool = mysql.createPool({
    host: process.env.DTR_READ_HOST,
    port: Number(process.env.DTR_READ_PORT || 3306),
    user: process.env.DTR_READ_USER,
    password: process.env.DTR_READ_PASSWORD,
    database: process.env.DTR_READ_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 10000,
    charset: "utf8mb4",
    timezone: "+08:00",
    // DATE/TIME columns come back as verbatim strings — the biometric
    // attendance day (dtr_entry.tdate) must never pass through UTC math.
    dateStrings: true,
  });
  readPool.on("error", (err) => {
    console.error("Read-only MySQL pool error:", err.code || err.message);
  });
}

function getPool() {
  if (readPool) return readPool;
  // Fallback: main app pool (SELECT-only usage against dtr_entry).
  return require("./db").pool;
}

module.exports = {
  isDedicated: hasDedicated,
  async query(sql, params = []) {
    return getPool().promise().query(sql, params);
  },
};
