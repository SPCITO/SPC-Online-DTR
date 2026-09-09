const jwt = require("jsonwebtoken");
const db = require("../config/db");

const JWT_SECRET = process.env.JWT_SECRET || "secret";

const verifyToken = async (req, res, next) => {
  // Authorization: Bearer xxx
  let token = req.headers.authorization?.split(" ")[1];

  // Backwards compatibility
  if (!token && req.cookies) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    console.log("VERIFY TOKEN");
    console.log(decoded);

    const [rows] = await db.promise().query(
      `
      SELECT active_session
      FROM employees
      WHERE id = ?
      LIMIT 1
      `,
      [decoded.id]
    );

    console.log("SESSION IN DATABASE");
    console.log(rows);

    if (rows.length === 0) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    if (rows[0].active_session !== decoded.session_id) {
      return res.status(401).json({
        message: "Session expired",
      });
    }

    req.user = decoded;

    next();

  } catch (err) {
    console.error("verifyToken error:", err);

    return res.status(401).json({
      message: "Invalid token",
    });
  }
};

module.exports = verifyToken;