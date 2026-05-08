const mysql = require("mysql2");

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Pangetka123",
  database: "spc_online_dtr", // ✅ your DB
});

db.connect((err) => {
  if (err) console.error(err);
  else console.log("MySQL Connected");
});

module.exports = db;