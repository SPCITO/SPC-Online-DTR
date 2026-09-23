-- ============================================================
-- SPC Online DTR — Production MySQL Schema
-- Generated: 2025-09-15
-- Updated: 2026-09-17 (L.8 — school DB migration readiness)
-- Application: Next.js (Vercel) → Express (Render) → MySQL
--
-- This schema defines the 3 application tables:
--   1. employees       — Application user accounts, auth, sessions
--   2. attendance_logs — Daily time-in/time-out records
--   3. security_logs   — Security event audit trail
--
-- The legacy school tables (dtr_user, dtr_entry, dtr_dept, dtr_org)
-- are owned by the school DTR system and must NOT be created or
-- modified by this application schema.
--
-- Safety: Uses CREATE TABLE IF NOT EXISTS. No destructive SQL.
-- ============================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- ============================================================
-- 1. employees — Application user accounts
--    Authentication, session management, role authorization.
--    Linked to dtr_user via dtr_user_id (logical, no FK constraint).
--    Populated by syncEmployees.js from dtr_user.
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
-- 2. attendance_logs — Daily time-in/time-out records
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
-- 3. security_logs — Security event audit trail
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
-- 4. notification_log — Idempotency for scheduled notifications
--    Prevents duplicate emails per employee per calendar day.
--    Used by the 9:00 PM timeout-reminder scheduler.
-- ============================================================

CREATE TABLE IF NOT EXISTS `notification_log` (
  `id`                INT          NOT NULL AUTO_INCREMENT,
  `employee_id`       INT          NOT NULL,
  `notification_date` DATE         NOT NULL,
  `sent_at`           TIMESTAMP    NULL     DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_employee_date` (`employee_id`, `notification_date`),
  CONSTRAINT `notification_log_ibfk_1`
    FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`)
    ON DELETE CASCADE
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

-- Note: idx_groupno on dtr_user is NOT created here.
-- The application must not modify existing school tables.

-- Optimize employee listing ORDER BY created_at DESC
CREATE INDEX `idx_created_at`
  ON `employees` (`created_at`);


-- ============================================================
-- 5. sync_source_map — Sync idempotency & source tracking
--    Maps local dtr_entry.PK_entry → online attendance_logs.id.
--    Provides crash-safe idempotency for the sync agent.
--    Each source PK_entry maps to at most one attendance record.
-- ============================================================

CREATE TABLE IF NOT EXISTS `sync_source_map` (
  `id`               INT            NOT NULL AUTO_INCREMENT,
  `source_pk_entry`  INT UNSIGNED   NOT NULL,
  `online_log_id`    INT            NOT NULL,
  `source_hash`      VARCHAR(64)             DEFAULT NULL,
  `synced_at`        TIMESTAMP      NULL     DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_source_pk` (`source_pk_entry`),
  KEY `idx_online_log` (`online_log_id`),
  CONSTRAINT `fk_sync_attendance`
    FOREIGN KEY (`online_log_id`) REFERENCES `attendance_logs` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
