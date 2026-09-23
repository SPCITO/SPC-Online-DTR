// ============================================================
// SPC Online DTR — Sync API Authentication Middleware
//
// Machine-to-machine authentication for sync endpoints.
// Uses a dedicated SYNC_API_KEY (not browser JWT).
//
// The sync agent sends: Authorization: Bearer <SYNC_API_KEY>
//
// This middleware is applied ONLY to /api/sync/* routes.
// It does NOT affect normal browser authentication.
// ============================================================

const rateLimit = require("express-rate-limit");

// Sync-specific rate limiter: 200 requests per hour per API key
const syncLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  message: { message: "Sync rate limit exceeded. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: () => "sync-agent", // single agent identity
});

/**
 * Middleware: verify SYNC_API_KEY from Authorization header.
 * Rejects requests without a valid key.
 */
function verifySyncKey(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Sync authentication required" });
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix
  const expectedKey = process.env.SYNC_API_KEY;

  if (!expectedKey) {
    console.error("[SyncAuth] SYNC_API_KEY not configured");
    return res.status(500).json({ message: "Sync service not configured" });
  }

  // Constant-time comparison to prevent timing attacks
  const crypto = require("crypto");
  const tokenBuf = Buffer.from(token, "utf8");
  const expectedBuf = Buffer.from(expectedKey, "utf8");

  if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
    return res.status(401).json({ message: "Invalid sync credentials" });
  }

  // Mark request as sync-authenticated (for downstream middleware bypass)
  req.isSyncRequest = true;
  next();
}

module.exports = { verifySyncKey, syncLimiter };
