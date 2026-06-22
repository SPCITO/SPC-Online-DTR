-- ============================================
-- SUPABASE POSTGRESQL SCHEMA
-- Migration from MySQL to Supabase
-- ============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. DTR_USER TABLE (Department/User Mapping)
-- ============================================
CREATE TABLE IF NOT EXISTS dtr_user (
    PK_user SERIAL PRIMARY KEY,
    fullname VARCHAR(255) NOT NULL,
    empid VARCHAR(50),
    FK_dept INTEGER,
    groupno INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. EMPLOYEES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    employee_id VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'employee',
    username VARCHAR(100) UNIQUE,
    active_session UUID,
    is_active BOOLEAN DEFAULT TRUE,
    dtr_user_id INTEGER REFERENCES dtr_user(PK_user),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 3. ATTENDANCE_LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS attendance_logs (
    id SERIAL PRIMARY KEY,
    employee_db_id INTEGER REFERENCES employees(id),
    time_in TIMESTAMP WITH TIME ZONE NOT NULL,
    time_out TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 4. SECURITY_LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS security_logs (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(50),
    action_type VARCHAR(100) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    session_id UUID,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_employees_username ON employees(username);
CREATE INDEX IF NOT EXISTS idx_employees_employee_id ON employees(employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_dtr_user_id ON employees(dtr_user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_db_id ON attendance_logs(employee_db_id);
CREATE INDEX IF NOT EXISTS idx_attendance_time_in ON attendance_logs(time_in);
CREATE INDEX IF NOT EXISTS idx_attendance_date_in ON attendance_logs USING btree (date_trunc('day', time_in));
CREATE INDEX IF NOT EXISTS idx_security_logs_employee_id ON security_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_security_logs_timestamp ON security_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_dtr_user_groupno ON dtr_user(groupno);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Configure these based on your authentication needs
-- ============================================

-- Enable RLS on tables
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dtr_user ENABLE ROW LEVEL SECURITY;

-- Example policies (adjust based on your auth setup)
-- Note: You may need to adjust these based on your Supabase auth configuration

-- Policy: Allow authenticated users to read their own employee data
CREATE POLICY "Users can view own employee data"
ON employees FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Policy: Allow authenticated users to read their own attendance logs
CREATE POLICY "Users can view own attendance logs"
ON attendance_logs FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Policy: Allow authenticated users to insert their own attendance logs
CREATE POLICY "Users can insert own attendance logs"
ON attendance_logs FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_employees_updated_at
BEFORE UPDATE ON employees
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dtr_user_updated_at
BEFORE UPDATE ON dtr_user
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- INITIAL DATA (Optional - Add sample departments)
-- ============================================
-- Uncomment and modify as needed
-- INSERT INTO dtr_user (fullname, empid, groupno) VALUES
-- ('Sample User', 'EMP001', 1);

-- ============================================
-- NOTES FOR MIGRATION
-- ============================================
-- 1. Run this schema in Supabase SQL Editor
-- 2. Migrate your existing data using CSV import or custom scripts
-- 3. Update environment variables in your backend
-- 4. Test all endpoints thoroughly
-- 5. Key differences from MySQL:
--    - Use CURRENT_TIMESTAMP instead of NOW()
--    - Use CURRENT_DATE instead of CURDATE()
--    - Boolean values are TRUE/FALSE instead of 1/0
--    - Timestamps include timezone by default
--    - Serial columns for auto-increment instead of AUTO_INCREMENT
