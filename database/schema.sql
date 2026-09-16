-- ============================================================
-- SPC Online DTR — Production MySQL Schema
-- Generated: 2025-09-15
-- Application: Next.js (Vercel) → Express (Render) → MySQL
--
-- This schema defines the 4 runtime-required tables:
--   1. dtr_user      — Legacy employee master data (read-only by app)
--   2. employees     — Application user accounts, auth, sessions
--   3. attendance_logs — Daily time-in/time-out records
--   4. security_logs — Security event audit trail
--
-- Safety: Uses CREATE TABLE IF NOT EXISTS. No destructive SQL.
-- ============================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- ============================================================
-- 1. dtr_user — Legacy employee master data
--    Source of truth for employee names, departments, empids.
--    Read-only by application (joined via employees.dtr_user_id).
--    Populated by existing school DTR system.
-- ============================================================

CREATE TABLE IF NOT EXISTS `dtr_user` (
  `PK_user`        INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `FK_dept`        TINYINT UNSIGNED         DEFAULT 0,
  `empid`          VARCHAR(15)              DEFAULT '0',
  `fullname`       VARCHAR(50)     NOT NULL,
  `picture`        LONGBLOB                 DEFAULT NULL,
  `fingerprint`    BLOB                     DEFAULT NULL,
  `fp_zk4500`      BLOB                     DEFAULT NULL,
  `groupno`        TINYINT UNSIGNED         DEFAULT 1,
  `isadmin`        TINYINT UNSIGNED         DEFAULT 0,
  `username`       VARCHAR(20)              DEFAULT 'user',
  `password`       VARCHAR(20)              DEFAULT NULL,
  `isactive`       TINYINT UNSIGNED         DEFAULT 1,
  `FK_clinic_user` INT UNSIGNED             DEFAULT 0,
  `isupdonline`    TINYINT                  DEFAULT 0,

  PRIMARY KEY (`PK_user`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ============================================================
-- 2. employees — Application user accounts
--    Authentication, session management, role authorization.
--    Linked to dtr_user via dtr_user_id (logical, no FK constraint).
-- ============================================================

CREATE TABLE IF NOT EXISTS `employees` (
  `id`                   INT          NOT NULL AUTO_INCREMENT,
  `employee_id`          VARCHAR(50)           DEFAULT NULL,
  `name`                 VARCHAR(100)          DEFAULT NULL,
  `email`                VARCHAR(100)          DEFAULT NULL,
  `password`             VARCHAR(255)          DEFAULT NULL,
  `role`                 VARCHAR(20)           DEFAULT 'employee',
  `active_session`       VARCHAR(255)          DEFAULT NULL,
  `session_expires_at`   TIMESTAMP    NULL     DEFAULT NULL,
  `dtr_user_id`          INT UNSIGNED          DEFAULT NULL,
  `is_active`            TINYINT               DEFAULT 1,
  `created_at`           TIMESTAMP    NULL     DEFAULT CURRENT_TIMESTAMP,
  `username`             VARCHAR(100)          DEFAULT NULL,
  `must_change_password` BOOLEAN      NOT NULL DEFAULT FALSE,

  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_id` (`employee_id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ============================================================
-- 3. attendance_logs — Daily time-in/time-out records
--    Each row is one attendance session for one employee.
--    time_out IS NULL means the employee is currently clocked in.
-- ============================================================

CREATE TABLE IF NOT EXISTS `attendance_logs` (
  `id`              INT      NOT NULL AUTO_INCREMENT,
  `employee_db_id`  INT      NOT NULL,
  `time_in`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `time_out`        DATETIME          DEFAULT NULL,
  `created_at`      TIMESTAMP NULL    DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `employee_db_id` (`employee_db_id`),
  CONSTRAINT `attendance_logs_ibfk_1`
    FOREIGN KEY (`employee_db_id`) REFERENCES `employees` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ============================================================
-- 4. security_logs — Security event audit trail
--    Write-only by application. Logs login, logout, time-in,
--    time-out, password change, admin password reset, etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS `security_logs` (
  `id`          INT          NOT NULL AUTO_INCREMENT,
  `employee_id` VARCHAR(100)          DEFAULT NULL,
  `action_type` VARCHAR(100)          DEFAULT NULL,
  `ip_address`  VARCHAR(255)          DEFAULT NULL,
  `user_agent`  TEXT                  DEFAULT NULL,
  `session_id`  VARCHAR(255)          DEFAULT NULL,
  `created_at`  TIMESTAMP    NULL     DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ============================================================
-- PERFORMANCE INDEXES
-- Derived from backend/scripts/add-performance-indexes.sql
--
-- Note: idx_email is NOT included here because the UNIQUE
-- constraint on employees(email) already provides an index
-- on that column.
-- ============================================================

-- Optimize time-in duplicate check, time-out lookup, status check
CREATE INDEX `idx_emp_timeout_timein`
  ON `attendance_logs` (`employee_db_id`, `time_out`, `time_in`);

-- Optimize date-range filtered queries (admin stats, exports)
CREATE INDEX `idx_time_in`
  ON `attendance_logs` (`time_in`);

-- Optimize employee-specific date-range queries (monthly reports)
CREATE INDEX `idx_emp_timein`
  ON `attendance_logs` (`employee_db_id`, `time_in`);

-- Optimize department filtering by groupno
CREATE INDEX `idx_groupno`
  ON `dtr_user` (`groupno`);

-- Optimize employee listing ORDER BY created_at DESC
CREATE INDEX `idx_created_at`
  ON `employees` (`created_at`);
