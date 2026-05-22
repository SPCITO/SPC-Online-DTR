const db = require("../config/db");

const detectSuspiciousLogin = (
  employee_id,
  ip_address,
  callback
) => {
  db.query(
    `
      SELECT *
      FROM security_logs
      WHERE employee_id = ?
      ORDER BY created_at DESC
      LIMIT 5
    `,
    [employee_id],
    (err, results) => {
      if (err) return callback(false);

      const suspicious = results.some(
        (log) =>
          log.ip_address !== ip_address
      );

      callback(suspicious);
    }
  );
};

module.exports = detectSuspiciousLogin;