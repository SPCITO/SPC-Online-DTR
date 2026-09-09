const mysql = require("mysql2");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,

  charset: "utf8mb4",
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