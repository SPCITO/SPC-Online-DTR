const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { ALLOWED_ORIGINS } = require("./config/origins");
const { csrfProtection, originCheck } = require("./middleware/csrfProtection");

const app = express();

// Trust proxy for Render — req.ip returns real client IP, rate limiters work per-IP
app.set("trust proxy", 1);

	const corsOptions = {
	  origin: function (origin, callback) {
	    // Allow requests with no origin (like mobile apps or curl requests)
	    if (!origin) return callback(null, true);
	    
	    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
	      callback(null, true);
	    } else {
	      console.log(`Blocked CORS request from origin: ${origin}`);
	      callback(new Error("Not allowed by CORS"));
	    }
	  },	  credentials: true,
	  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
	  allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
	  maxAge: 600,
	};
	
	app.use(cors(corsOptions));
	
	// Explicitly handle OPTIONS preflight requests for all routes
	app.options(/.*/, cors(corsOptions));
	
	app.use(express.json({ limit: "1mb" }));
	app.use(cookieParser());

	// Security middleware (after cookieParser, before routes)
	app.use(originCheck);
	app.use(csrfProtection);

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
	  "/api/employees",	  verifyToken,
	  requireRole("admin"),
	  employeeRoutes
	);
	
	app.use("/api/monthly", verifyToken, require("./routes/monthlyRoutes"));
	
	// DEPARTMENT ROUTES (PROTECTED)
	const departmentRoutes = require("./routes/departmentRoutes");
	app.use("/api/departments", departmentRoutes);

	// ADMIN STATS (dedicated aggregate endpoint)
	app.get("/api/admin/stats", verifyToken, requireRole("admin"), async (req, res) => {
	  try {
		const db = require("./config/db");
		const now = new Date();
		const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

		const [[{ todayLogs }]] = await db.promise().query(
		  "SELECT COUNT(*) AS todayLogs FROM attendance_logs WHERE time_in >= ? AND time_in <= ?",
		  [startOfDay, endOfDay]
		);

		const [[{ activeNow }]] = await db.promise().query(
		  "SELECT COUNT(*) AS activeNow FROM attendance_logs WHERE time_in >= ? AND time_in <= ? AND time_out IS NULL",
		  [startOfDay, endOfDay]
		);

		const [[{ totalEmployees }]] = await db.promise().query(
		  "SELECT COUNT(*) AS totalEmployees FROM employees WHERE is_active = 1"
		);

		const [[{ totalLogs }]] = await db.promise().query(
		  "SELECT COUNT(*) AS totalLogs FROM attendance_logs"
		);

		res.json({ todayLogs, activeNow, totalEmployees, totalLogs });
	  } catch (err) {
		console.error("Admin stats error:", err);
		res.status(500).json({ message: "Failed to fetch stats" });
	  }
	});
	
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
	
	const PORT = process.env.PORT || 5000;
	const server = app.listen(PORT, () => {
	  console.log(`Server running on port ${PORT}`);
	});

	// ========== GRACEFUL SHUTDOWN ==========
	let isShuttingDown = false;

	function shutdown(signal) {
	  if (isShuttingDown) return;
	  isShuttingDown = true;
	  console.log(`${signal} received. Shutting down gracefully...`);

	  // Stop accepting new connections
	  server.close(() => {
	    console.log("HTTP server closed.");
	    // Close database pool
		const db = require("./config/db");
	    db.pool.end(() => {
	      console.log("Database pool closed.");
	      process.exit(0);
	    });
	  });

	  // Force exit after 10 seconds if graceful shutdown hangs
	  setTimeout(() => {
	  console.error("Forced exit after timeout.");
	  process.exit(1);
	  }, 10000);
	}

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));

	process.on("uncaughtException", (err) => {
	  console.error("UNCAUGHT EXCEPTION:", err);
	  shutdown("uncaughtException");
	});

	process.on("unhandledRejection", (reason) => {
	  console.error("UNHANDLED REJECTION:", reason);
	  // Log but don't crash — let the process continue for non-fatal rejections
	});