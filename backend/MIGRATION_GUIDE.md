# 🚀 Supabase Migration Guide

This guide will help you migrate your backend from MySQL (Aiven) to Supabase (PostgreSQL).

## 📋 Prerequisites

1. **Supabase Account**: Create one at [supabase.com](https://supabase.com)
2. **Backup Your Data**: Export your existing MySQL data before migration

---

## 🔧 Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Fill in:
   - **Project Name**: `spc-dtr-system` (or your preferred name)
   - **Database Password**: Save this securely!
   - **Region**: Choose closest to your users
4. Wait for project creation (~2 minutes)

---

## 🗄️ Step 2: Set Up Database Schema

### Option A: Using Supabase SQL Editor (Recommended)

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **"New Query"**
3. Copy the entire contents of `supabase-schema.sql`
4. Paste into the editor
5. Click **"Run"** to execute

### Option B: Using Supabase CLI

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Push schema
supabase db push
```

---

## 📊 Step 3: Migrate Your Data

### Export from MySQL

```bash
# Export employees table
mysqldump -h your-aiven-host -u your-user -p \
  --no-create-info \
  spc_online_dtr employees > employees.csv

# Export attendance_logs table
mysqldump -h your-aiven-host -u your-user -p \
  --no-create-info \
  spc_online_dtr attendance_logs > attendance_logs.csv

# Export dtr_user table
mysqldump -h your-aiven-host -u your-user -p \
  --no-create-info \
  spc_online_dtr dtr_user > dtr_user.csv
```

### Import to Supabase

1. In Supabase Dashboard, go to **Table Editor**
2. Select a table (e.g., `employees`)
3. Click **"Insert"** → **"Import CSV"**
4. Upload your CSV file
5. Map columns if needed
6. Click **"Import"**

Repeat for each table.

---

## 🔑 Step 4: Get Supabase Credentials

1. In Supabase Dashboard, go to **Settings** → **API**
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: `eyJhbG...` (for frontend)
   - **service_role key**: `eyJhbG...` (for backend - keep secret!)

---

## ⚙️ Step 5: Update Backend Configuration

### Create `.env` file in `/backend`:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_KEY=your-service-role-key
JWT_SECRET=your-generated-jwt-secret
CORS_ORIGIN=https://your-frontend.vercel.app
NODE_ENV=production
PORT=5000
```

### Generate JWT Secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## 🔐 Step 6: Configure Row Level Security (RLS)

**IMPORTANT**: By default, Supabase enables RLS. You have two options:

### Option A: Disable RLS (Quick Start - Less Secure)

Run in SQL Editor:

```sql
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE security_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE dtr_user DISABLE ROW LEVEL SECURITY;
```

### Option B: Configure RLS Policies (Recommended for Production)

See `supabase-schema.sql` for example policies. Adjust based on your authentication needs.

---

## 🧪 Step 7: Test Locally

```bash
cd backend
npm install
npm start
```

Test endpoints:
- `GET http://localhost:5000/api` - Should return "API running"
- `POST http://localhost:5000/api/login` - Test login
- Other protected routes

---

## 🚀 Step 8: Deploy to Render

1. Go to [render.com](https://render.com)
2. Create new Web Service or update existing one
3. Connect your GitHub repository
4. Set environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `JWT_SECRET`
   - `CORS_ORIGIN`
5. Deploy!

---

## 🔄 Key Differences: MySQL vs Supabase/PostgreSQL

| MySQL | Supabase/PostgreSQL |
|-------|---------------------|
| `NOW()` | `CURRENT_TIMESTAMP` |
| `CURDATE()` | `CURRENT_DATE` |
| `AUTO_INCREMENT` | `SERIAL` or `GENERATED ALWAYS AS IDENTITY` |
| `TINYINT(1)` for boolean | `BOOLEAN` (TRUE/FALSE) |
| Backticks `` `column` `` | Double quotes `"column"` |
| `LIMIT offset, count` | `LIMIT count OFFSET offset` |

---

## 🛠️ Code Changes Required

Your backend code needs to be updated to use Supabase methods instead of raw SQL. Example:

### Before (MySQL):
```javascript
db.query(
  'SELECT * FROM employees WHERE id = ?',
  [userId],
  (err, results) => { ... }
);
```

### After (Supabase):
```javascript
const { data, error } = await db.supabase
  .from('employees')
  .select('*')
  .eq('id', userId);
```

---

## 📝 Migration Checklist

- [ ] Create Supabase project
- [ ] Run schema SQL in Supabase
- [ ] Export data from MySQL
- [ ] Import data to Supabase
- [ ] Get Supabase credentials
- [ ] Update `.env` file
- [ ] Configure RLS (enable/disable)
- [ ] Test locally
- [ ] Update Render environment variables
- [ ] Deploy and test production
- [ ] Monitor logs for errors

---

## 🆘 Troubleshooting

### Connection Issues
- Verify `SUPABASE_URL` and `SUPABASE_KEY` are correct
- Check that your Supabase project is active
- Ensure database password is correct

### RLS Policy Errors
- If getting "permission denied" errors, check RLS policies
- Temporarily disable RLS for testing: `ALTER TABLE tablename DISABLE ROW LEVEL SECURITY;`

### Data Type Mismatches
- Boolean fields: MySQL uses 1/0, PostgreSQL uses TRUE/FALSE
- Timestamps: PostgreSQL includes timezone by default

---

## 📚 Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Render Deployment Guide](https://render.com/docs)

---

## ✅ Next Steps

After successful migration:

1. Monitor your application for any database-related errors
2. Optimize queries using Supabase's query builder
3. Set up database backups in Supabase
4. Configure monitoring and alerts
5. Update documentation for your team

Good luck with your migration! 🎉
