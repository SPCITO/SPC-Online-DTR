-- ============================================================
-- Stage 5: Database Performance Indexes
-- Date: 2026-09-10
-- Non-destructive, additive only
-- ============================================================

-- M1: Optimize time-in dup check, time-out lookup, status check
CREATE INDEX idx_emp_timeout_timein ON attendance_logs (employee_db_id, time_out, time_in);

-- M2: Optimize all date-range filtered queries
CREATE INDEX idx_time_in ON attendance_logs (time_in);

-- M3: Optimize employee-specific date-range queries (monthly reports)
CREATE INDEX idx_emp_timein ON attendance_logs (employee_db_id, time_in);

-- M4: Optimize department filtering by groupno
CREATE INDEX idx_groupno ON dtr_user (groupno);

-- M5: Optimize employee email duplicate checks
CREATE INDEX idx_email ON employees (email);

-- M6: Optimize employee listing ORDER BY created_at DESC
CREATE INDEX idx_created_at ON employees (created_at);
