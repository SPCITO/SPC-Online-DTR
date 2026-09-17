const jwt = require("jsonwebtoken");
const db = require("../config/db");

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET = process.env.JWT_SECRET;

const verifyToken = async (req, res, next) => {
  // HttpOnly cookie authentication (Authorization header fallback removed — cookie migration verified)
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const [rows] = await db.promise().query(
      `
      SELECT active_session, must_change_password
      FROM employees
      WHERE id = ? AND is_active = 1
      LIMIT 1
      `,
      [decoded.id]
    );

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

    // Server-side enforcement: if the employee must change their password,
    // only allow access to the endpoints required to complete that flow.
    if (rows[0].must_change_password) {
      const allowedPaths = [
        "/api/change-password",
        "/api/logout",
        "/api/auth/csrf",
        "/api/me",
      ];
      if (!allowedPaths.includes(req.originalUrl)) {
        return res.status(403).json({
          message: "Password change required. Please change your password first.",
        });
      }
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