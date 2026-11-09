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
      SELECT active_session, session_expires_at, must_change_password, role
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

    // Enforce database-side session expiration
    if (rows[0].session_expires_at && new Date(rows[0].session_expires_at) < new Date()) {
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

    // M.52: the JWT's role claim is a login-time snapshot. The DB row is
    // already fetched above for session validation (zero extra queries), so
    // the DB role is authoritative: promotions/demotions apply on the very
    // next request instead of after re-login. Before this, a promoted admin
    // kept getting 403 on admin panels until logging out/in, and a demoted
    // admin kept admin API power until session expiry.
    req.user = { ...decoded, role: rows[0].role };

    next();

  } catch (err) {
    console.error("verifyToken error:", err);

    // M.44: classify failures. Genuine token problems stay 401; database/pool
    // infrastructure failures return 503 so pool pressure never masquerades as
    // an unauthenticated session. No internals are leaked to the client.
    const jwtFailure =
      err.name === "JsonWebTokenError" ||
      err.name === "TokenExpiredError" ||
      err.name === "NotBeforeError";

    if (jwtFailure) {
      return res.status(401).json({
        message: "Invalid token",
      });
    }

    res.setHeader("Retry-After", "5");
    return res.status(503).json({
      message: "Service temporarily unavailable. Please try again.",
    });
  }
};

module.exports = verifyToken;