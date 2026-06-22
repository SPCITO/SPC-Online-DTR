const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");
require("dotenv").config();

// Supabase client configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase credentials. Check your .env file.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      eventsPerSecond: 10
    },
    transport: ws
  }
});

/**
 * Database helper with MySQL-compatible API for Supabase
 * This allows gradual migration from MySQL to Supabase
 */
const db = {
  /**
   * Execute a query with callback-style API (MySQL compatible)
   * @param {string} sql - SQL query (will be ignored, used for logging only)
   * @param {Array} params - Query parameters
   * @param {Function} callback - Callback function (err, results)
   */
  query: async (sql, params = [], callback) => {
    console.log("⚠️  MySQL-style query detected. Consider migrating to Supabase methods.");
    console.log("SQL:", sql.substring(0, 100));
    
    const error = new Error("Direct SQL not supported. Please migrate to Supabase client methods.");
    
    if (callback) {
      setImmediate(() => callback(error, null));
    }
    
    return { error };
  },
  
  /**
   * Promise-based query interface (MySQL compatible)
   */
  promise: () => ({
    query: async (sql, params) => {
      console.log("⚠️  MySQL-style promise query detected. Consider migrating to Supabase methods.");
      throw new Error("Direct SQL not supported. Please migrate to Supabase client methods.");
    }
  }),
  
  /**
   * Direct Supabase client access
   * Usage: db.supabase.from('table').select('*')
   */
  supabase,
  
  /**
   * Helper method for SELECT queries
   */
  select: async (table, columns = '*', options = {}) => {
    let query = supabase.from(table).select(columns);
    
    if (options.where) {
      query = query.eq(options.where.column, options.where.value);
    }
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }
    
    const { data, error } = await query;
    return { data, error };
  },
  
  /**
   * Helper method for INSERT queries
   */
  insert: async (table, values) => {
    const { data, error } = await supabase.from(table).insert(values);
    return { data, error };
  },
  
  /**
   * Helper method for UPDATE queries
   */
  update: async (table, values, options = {}) => {
    let query = supabase.from(table).update(values);
    
    if (options.where) {
      query = query.eq(options.where.column, options.where.value);
    }
    
    const { data, error } = await query;
    return { data, error };
  },
  
  /**
   * Helper method for DELETE queries
   */
  delete: async (table, options = {}) => {
    let query = supabase.from(table).delete();
    
    if (options.where) {
      query = query.eq(options.where.column, options.where.value);
    }
    
    const { data, error } = await query;
    return { data, error };
  }
};

console.log("✅ Supabase Connected");

module.exports = db;