const express = require("express");
const cors = require("cors");

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// 🔐 AUTH MIDDLEWARE
const verifyToken = require("./middleware/authMiddleware");

// ROUTES (public)
app.use("/api", require("./routes/authRoutes"));

// ROUTES (protected)
app.use("/api/dtr", verifyToken, require("./routes/dtrRoutes"));
app.use("/api/logs", verifyToken, require("./routes/logsRoutes"));
app.use("/api/time", verifyToken, require("./routes/timeRoutes"));
app.use("/api/employees", verifyToken, require("./routes/employeeRoutes"));
app.use("/api/monthly", verifyToken, require("./routes/monthlyRoutes")); 

// TEST
app.get("/", (req, res) => {
  res.send("API running");
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});