const jwt = require("jsonwebtoken");
const db = require("../config/db");

const JWT_SECRET = process.env.JWT_SECRET || "secret";

const verifyToken = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    db.query(
      "SELECT active_session FROM employees WHERE id = ?",
      [decoded.id],
      (err, result) => {
        if (err || result.length === 0) {
          return res.status(401).json({
            message: "Unauthorized",
          });
        }

        const activeSession = result[0].active_session;


        if (activeSession !== decoded.session_id) {
          return res.status(401).json({
            message: "Session expired",
          });
        }

        req.user = decoded;

        next();
      }
    );
  } catch (err) {
    return res.status(401).json({
      message: "Invalid token",
    });
  }
};

module.exports = verifyToken;