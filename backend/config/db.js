const mysql = require("mysql2");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  // M.44: raised from 10 after M.43 measured pool saturation at ~60 in-flight
  // roundtrips (777 spurious auth failures, 859 queue rejections). 20 active
  // connections is safe against MySQL max_connections=151 (observed peak 18).
  connectionLimit: 20,
  maxIdle: 10,
  idleTimeout: 60000,
  // M.44: raised from 50 — queue entries hold no MySQL connections; a deeper
  // queue converts burst rejections into short waits (~30ms at 20 workers).
  queueLimit: 100,
  connectTimeout: 10000,

  charset: "utf8mb4",
  timezone: "+08:00",
});

// Pool-level error handler — prevents unhandled error events
pool.on("error", (err) => {
  console.error("MySQL pool error:", err.code || err.message);
});

pool.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Failed to connect to MySQL");
    console.error(err);
    process.exit(1);
  }

  console.log("✅ MySQL Connected");

  connection.release();
});

module.exports = {
  async query(sql, params = []) {
    return pool.promise().query(sql, params);
  },

  async execute(sql, params = []) {
    return pool.promise().execute(sql, params);
  },

  promise() {
    return pool.promise();
  },

  pool,
};