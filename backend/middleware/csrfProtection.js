const { ALLOWED_ORIGINS, isProd } = require("../config/origins");

// CSRF double-submit cookie validation
const csrfProtection = (req, res, next) => {
  // Skip for safe methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  // Skip for login (no session yet)
  if (req.path === "/login") {
    return next();
  }

  // Skip for auth/csrf endpoint (generates the token)
  if (req.path === "/auth/csrf") {
    return next();
  }

  const headerToken = req.headers["x-csrf-token"];
  const cookieToken = req.cookies?.csrf_token;

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return res.status(403).json({ message: "Invalid CSRF token" });
  }

  next();
};

// Origin validation for state-changing requests
const originCheck = (req, res, next) => {
  // Skip for safe methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const origin = req.headers.origin;

  if (isProd) {
    // In production, require origin header matching configured origins
    if (!origin) {
      return res.status(403).json({ message: "Origin required" });
    }
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return res.status(403).json({ message: "Origin not allowed" });
    }
  }
  // In development: allow requests with or without origin (curl, Postman, etc.)

  next();
};

module.exports = { csrfProtection, originCheck };
