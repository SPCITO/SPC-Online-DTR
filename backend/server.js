const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const app = express();

// middleware
const allowedOrigins = [
  "http://localhost:3000",
  "https://dtr.sanpablocolleges.edu.ph",
  "https://spc-online-dtr.vercel.app"
  ];
  	const corsOptions = {
	  origin: function (origin, callback) {
	    // Allow requests with no origin (like mobile apps or curl requests)
	    if (!origin) return callback(null, true);
	    
	    if (allowedOrigins.indexOf(origin) !== -1) {
	      callback(null, true);
	    } else {
	      console.log(`Blocked CORS request from origin: ${origin}`);
	      callback(new Error("Not allowed by CORS"));
	    }
	  },	  credentials: true,
	  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
	  allowedHeaders: ["Content-Type", "Authorization"],
	};
	
	app.use(cors(corsOptions));
	
	// Explicitly handle OPTIONS preflight requests for all routes
	app.options(/.*/, cors(corsOptions));
	
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
	app.listen(PORT, () => {
	  console.log(`Server running on port ${PORT}`);
});