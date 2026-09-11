const isProd = process.env.NODE_ENV === "production";

// Parse CORS_ORIGIN env var into array (supports comma-separated multiple origins)
const parseOrigins = () => {
  const raw = process.env.CORS_ORIGIN || "";
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
};

const PRODUCTION_ORIGINS = parseOrigins();
const DEVELOPMENT_ORIGINS = ["http://localhost:3000"];

const ALLOWED_ORIGINS = isProd
  ? PRODUCTION_ORIGINS
  : [...PRODUCTION_ORIGINS, ...DEVELOPMENT_ORIGINS];

module.exports = { ALLOWED_ORIGINS, isProd };
