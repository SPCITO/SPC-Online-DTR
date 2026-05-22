const db = require("../config/db");

const logSecurityEvent = ({
  employee_id,
  action_type,
  ip_address,
  user_agent,
  session_id,
}) => {
  db.query(
    `
      INSERT INTO security_logs
      (
        employee_id,
        action_type,
        ip_address,
        user_agent,
        session_id
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      employee_id,
      action_type,
      ip_address,
      user_agent,
      session_id,
    ]
  );
};

module.exports = logSecurityEvent;