const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();

// Get CORS origin from environment variable or default to localhost for development
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

// middleware
const allowedOrigins = [
  "http://localhost:3000",
  "https://dtr.sanpablocolleges.edu.ph",
  "https://spc-online-dtr.vercel.app"
];

app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// 🔐 AUTH MIDDLEWARE
const verifyToken = require("./middleware/authMiddleware");
const requireRole = require("./middleware/requireRole");

// ROUTES (public)
app.use("/api", require("./routes/authRoutes"));

// ROUTES (protected)
app.use("/api/dtr", verifyToken, require("./routes/dtrRoutes"));
app.use("/api/logs", verifyToken, require("./routes/logsRoutes"));
app.use("/api/time", verifyToken, require("./routes/timeRoutes"));

// 👇 FIXED: import route BEFORE using it
const employeeRoutes = require("./routes/employeeRoutes");

// 🔒 ROLE PROTECTED ROUTE (ADMIN ONLY)
app.use(
  "/api/employees",
  verifyToken,
  requireRole("admin"),
  employeeRoutes
);

app.use("/api/monthly", verifyToken, require("./routes/monthlyRoutes"));

// DEPARTMENT ROUTES (PROTECTED)
const departmentRoutes = require("./routes/departmentRoutes");
app.use("/api/departments", departmentRoutes);

// TEST
app.get("/", (req, res) => {
  res.send("API running");
});

// GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.error("🔥 SERVER ERROR:", err);

  res.status(500).json({
    message: "Internal server error",
  });
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});