# ⚠️ IMPORTANT: Backend Code Migration Required

## Current Status

Your backend has been configured for Supabase, but **all route files still use MySQL-style queries** that need to be migrated to Supabase methods.

## What's Been Done ✅

1. ✅ Installed `@supabase/supabase-js` package
2. ✅ Removed `mysql2` dependency
3. ✅ Updated `config/db.js` with Supabase client
4. ✅ Created database schema (`supabase-schema.sql`)
5. ✅ Updated `.env.example` with Supabase variables
6. ✅ Updated `render.yaml` for Supabase deployment
7. ✅ Created migration guide (`MIGRATION_GUIDE.md`)

## What Needs to Be Done ⚠️

All route files currently use this pattern:
```javascript
db.query('SELECT * FROM table WHERE id = ?', [id], (err, results) => { ... });
```

This needs to be changed to Supabase pattern:
```javascript
const { data, error } = await db.supabase
  .from('table')
  .select('*')
  .eq('id', id);
```

## Files That Need Migration

### Priority 1 - Core Authentication
- [ ] `routes/authRoutes.js` - Login, logout, user management
- [ ] `middleware/authMiddleware.js` - Token verification

### Priority 2 - Attendance Management
- [ ] `routes/dtrRoutes.js` - Time in/out operations
- [ ] `routes/timeRoutes.js` - Time status checks
- [ ] `routes/monthlyRoutes.js` - Monthly reports

### Priority 3 - Employee & Department Management
- [ ] `routes/employeeRoutes.js` - CRUD operations
- [ ] `routes/departmentRoutes.js` - Department queries
- [ ] `routes/logsRoutes.js` - Log retrieval

## Quick Start Migration Example

### authRoutes.js - Login Function

**Before (MySQL):**
```javascript
db.query(
  `SELECT e.*, d.fullname, d.empid, d.FK_dept 
   FROM employees e 
   LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user 
   WHERE e.username = ?`,
  [username],
  async (err, result) => {
    if (err) return res.status(500).json({ message: "Server error" });
    if (result.length === 0) return res.status(401).json({ message: "User not found" });
    const user = result[0];
    // ... rest of code
  }
);
```

**After (Supabase):**
```javascript
try {
  const { data: users, error } = await db.supabase
    .from('employees')
    .select(`
      *,
      dtr_user (
        fullname,
        empid,
        FK_dept
      )
    `)
    .eq('username', username)
    .single();

  if (error || !users) {
    return res.status(401).json({ message: "User not found" });
  }

  const user = {
    ...users,
    fullname: users.dtr_user?.fullname,
    empid: users.dtr_user?.empid,
    FK_dept: users.dtr_user?.FK_dept
  };
  
  // ... rest of code
} catch (err) {
  return res.status(500).json({ message: "Server error" });
}
```

## Migration Steps

### Step 1: Set Up Supabase Database
1. Follow `MIGRATION_GUIDE.md` to create Supabase project
2. Run `supabase-schema.sql` in Supabase SQL Editor
3. Migrate your data from MySQL to Supabase

### Step 2: Update Route Files
Start with `authRoutes.js` since it's the foundation. Then move to other routes.

### Step 3: Test Locally
```bash
cd backend
cp .env.example .env
# Edit .env with your Supabase credentials
npm start
```

### Step 4: Deploy to Render
Update environment variables in Render dashboard:
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `JWT_SECRET`
- `CORS_ORIGIN`

## Common Patterns

### SELECT with WHERE
```javascript
// MySQL
db.query('SELECT * FROM employees WHERE id = ?', [id], callback);

// Supabase
const { data, error } = await db.supabase
  .from('employees')
  .select('*')
  .eq('id', id);
```

### INSERT
```javascript
// MySQL
db.query('INSERT INTO table (col1, col2) VALUES (?, ?)', [val1, val2], callback);

// Supabase
const { data, error } = await db.supabase
  .from('table')
  .insert([{ col1: val1, col2: val2 }]);
```

### UPDATE
```javascript
// MySQL
db.query('UPDATE table SET col1 = ? WHERE id = ?', [val1, id], callback);

// Supabase
const { data, error } = await db.supabase
  .from('table')
  .update({ col1: val1 })
  .eq('id', id);
```

### DELETE
```javascript
// MySQL
db.query('DELETE FROM table WHERE id = ?', [id], callback);

// Supabase
const { data, error } = await db.supabase
  .from('table')
  .delete()
  .eq('id', id);
```

### JOINs
```javascript
// MySQL
db.query(`
  SELECT e.*, d.fullname 
  FROM employees e 
  LEFT JOIN dtr_user d ON e.dtr_user_id = d.PK_user
  WHERE e.id = ?
`, [id], callback);

// Supabase
const { data, error } = await db.supabase
  .from('employees')
  .select(`
    *,
    dtr_user (
      fullname
    )
  `)
  .eq('id', id);
```

### Date Functions
```javascript
// MySQL
CURDATE() → CURRENT_DATE
NOW() → CURRENT_TIMESTAMP
DATE(column) → column::date
TIME(column) → column::time
```

## Need Help?

Refer to:
- [Supabase JavaScript Documentation](https://supabase.com/docs/reference/javascript/introduction)
- `MIGRATION_GUIDE.md` for detailed migration steps
- `supabase-schema.sql` for database structure

## Testing Checklist

After migrating each file:
- [ ] Install dependencies: `npm install`
- [ ] Test locally with your Supabase instance
- [ ] Verify all endpoints work correctly
- [ ] Check error handling
- [ ] Test authentication flows
- [ ] Verify data integrity

---

**Status**: 🟡 Partially Complete - Infrastructure ready, code migration needed
