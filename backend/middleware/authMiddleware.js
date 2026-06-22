const jwt = require("jsonwebtoken");
const db = require("../config/db");

const JWT_SECRET = process.env.JWT_SECRET || "secret";

const verifyToken = async (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Migrated to Supabase
    const { data, error } = await db.supabase
      .from('employees')
      .select('active_session')
      .eq('id', decoded.id)
      .single();

    if (error || !data) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const activeSession = data.active_session;

    if (activeSession !== decoded.session_id) {
      return res.status(401).json({
        message: "Session expired",
      });
    }

    req.user = decoded;

    next();
  } catch (err) {
    return res.status(401).json({
      message: "Invalid token",
    });
  }
};

module.exports = verifyToken;