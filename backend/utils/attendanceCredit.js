// ============================================================
// SPC Online DTR — attendance credit policy & status helpers.
//
// M.38 auto-timeout safeguards. The school has NOT yet decided how
// an automatically closed (forgotten) time-out should be credited.
// This module makes that decision ONE explicit configuration point
// instead of a hardcoded assumption:
//
//   ATTENDANCE_CREDIT_POLICY = "pending" (default) | "bounded" | "fixed"
//     pending — auto-closed rows are reported as PENDING CORRECTION
//               and are credited NO worked time until an administrator
//               corrects the record. Nothing is fabricated.
//     bounded — auto-closed rows are credited up to the technical
//               boundary timestamp (23:59:59 of the attendance day).
//     fixed   — auto-closed rows are credited ATTENDANCE_FIXED_HOURS
//               hours (school-defined fixed credit).
//
// The default ("pending") asserts no payroll policy and fabricates no
// hours: the credit is withheld until the school decides and/or an
// administrator records the real Time Out. Switching policy later is
// a configuration change, not a code change.
// ============================================================

const { philippineDateStr } = require("./phTime");

/**
 * Maximum legitimate session span in hours (default 24, configurable via
 * ATTENDANCE_MAX_SESSION_HOURS, clamped to (0, 48]).
 *
 * This is the shift-aware replacement for the old calendar-day rule:
 * a session may legally run across midnight (e.g. a nurse 21:00 → 06:00)
 * as long as it stays within this window from its Time In. Only sessions
 * still open BEYOND the window are treated as forgotten.
 */
function maxSessionHours() {
  const h = Number(process.env.ATTENDANCE_MAX_SESSION_HOURS);
  return Number.isFinite(h) && h > 0 && h <= 48 ? h : 24;
}

/** Resolved credit policy: "pending" | "bounded" | "fixed". */
function getCreditPolicy() {
  const raw = (process.env.ATTENDANCE_CREDIT_POLICY || "pending")
    .toLowerCase()
    .trim();

  if (raw === "bounded") return "bounded";

  if (raw === "fixed") {
    const h = Number(process.env.ATTENDANCE_FIXED_HOURS);
    if (!Number.isFinite(h) || h <= 0 || h > 24) {
      console.warn(
        "[Attendance Credit] ATTENDANCE_CREDIT_POLICY=fixed requires " +
          "ATTENDANCE_FIXED_HOURS in (0, 24] — falling back to \"pending\"."
      );
      return "pending";
    }
    return "fixed";
  }

  if (raw !== "pending") {
    console.warn(
      `[Attendance Credit] Unknown ATTENDANCE_CREDIT_POLICY="${raw}" — using "pending".`
    );
  }
  return "pending";
}

/** Fixed-credit hours when policy = "fixed" (0 if unset/invalid). */
function fixedCreditHours() {
  return Number(process.env.ATTENDANCE_FIXED_HOURS) || 0;
}

/**
 * Human-readable closure source. The distinction must survive
 * reporting and export:
 *   USER            — genuine employee Time Out
 *   AUTO            — automatic system closure (forgotten Time Out)
 *   ADMIN-CORRECTED — administrator correction
 */
function closedByLabel(closedBy) {
  if (closedBy === "auto") return "AUTO";
  if (closedBy === "admin") return "ADMIN-CORRECTED";
  return "USER";
}

/**
 * Per-attendance-row credit under the configured policy.
 *
 * @param {Object} row            — { time_in, time_out, closed_by }
 * @param {Date} [now]
 * @returns {{minutes: number|null, pending: boolean, status: string, expired: boolean, span: number}}
 *   minutes — credited worked minutes (null = withheld / pending)
 *   pending — true when the row awaits correction before any credit
 *   status  — OPEN | NO TIME-OUT | USER | AUTO | ADMIN-CORRECTED
 *   expired — open row past the 24h window ("No Time Out" — blank record)
 *   span    — raw elapsed minutes time_in → time_out
 */
function rowCredit(row, now = new Date()) {
  if (!row.time_out) {
    // Payroll model: an open session past the window is a BLANK record —
    // no Time Out, no hours. The employee files a DTR Correction Form.
    const expired = isExpired(row.time_in, now);
    return {
      minutes: 0,
      pending: false,
      status: expired ? "NO TIME-OUT" : "OPEN",
      expired,
      span: 0,
    };
  }

  const status = closedByLabel(row.closed_by);
  const span = Math.max(
    0,
    Math.round((new Date(row.time_out) - new Date(row.time_in)) / 60000)
  );

  if (row.closed_by === "auto") {
    const policy = getCreditPolicy();
    if (policy === "pending") {
      return { minutes: null, pending: true, status, expired: false, span };
    }
    if (policy === "fixed") {
      return {
        minutes: Math.round(fixedCreditHours() * 60),
        pending: false,
        status,
        expired: false,
        span,
      };
    }
    // "bounded" — the provisional boundary value itself
    return { minutes: span, pending: false, status, expired: false, span };
  }

  return { minutes: span, pending: false, status, expired: false, span };
}

/**
 * Decide what a TIME OUT action must do to an open attendance record.
 * (Pure — deterministic, dependency-free.)
 *
 * SHIFT-AWARE WINDOW: an open record whose age is within
 * maxSessionHours() of its Time In is a legitimate session — the
 * employee's real Time Out is recorded as-is (overnight shifts like
 * 21:00 → 06:00 work normally).
 *
 * PAYROLL RULE: once the window passes, the record is HARD-BLOCKED —
 * Time Out can no longer be recorded through the system. The record
 * stays BLANK ("No Time Out"), the employee is notified, and the school's
 * DTR Correction Form (via Payroll) is the only way to fix it. Nothing is
 * ever written or fabricated here.
 *
 * @param {Date|string} openTimeIn — attendance_logs.time_in of the open row
 * @param {Date} [now]             — evaluation instant
 * @returns {{action: "user_close"|"hard_block", day: string}}
 */
function planTimeOut(openTimeIn, now = new Date()) {
  const startMs = new Date(openTimeIn).getTime();
  const recordDay = philippineDateStr(new Date(openTimeIn));

  const withinWindow = now.getTime() <= startMs + maxSessionHours() * 3600000;

  if (withinWindow) {
    return { action: "user_close", day: recordDay };
  }
  return { action: "hard_block", day: recordDay };
}

/** True when an open session has passed the legitimate window. */
function isExpired(timeIn, now = new Date()) {
  return now.getTime() > new Date(timeIn).getTime() + maxSessionHours() * 3600000;
}

/**
 * Decide what a TIME IN action must do given the employee's open records.
 * (Pure — deterministic, dependency-free.)
 *
 * A FORGOTTEN TIME OUT NEVER BLOCKS THE NEXT WORK DAY: a record left open
 * from a PREVIOUS Manila day is a missed Time Out, not a live session —
 * the employee must be able to Time In again immediately (the DTR
 * Correction Form with Payroll is slow and must not be a prerequisite for
 * recording attendance). The abandoned record stays BLANK ("No Time Out");
 * nothing is ever written to it.
 *
 * Guards:
 *   - an open record from TODAY always blocks (duplicate Time In)
 *   - a previous-day record still WITHIN maxSessionHours() could be a
 *     live overnight shift (e.g. 21:00 → 06:00) — abandoning it requires
 *     explicit confirmation (abandonRequested) so a stray tap cannot
 *     silently strand a real session
 *   - a previous-day record past the window is definitely forgotten —
 *     proceeds without confirmation
 *
 * @param {Array<{id?: number, time_in: Date|string}>} openRows — open records
 * @param {Date} [now]                 — evaluation instant
 * @param {boolean} [abandonRequested] — caller confirmed abandoning the open record(s)
 * @returns {{action: "proceed"|"blocked"|"confirm_abandon", day: string|null, abandonDays: string[]}}
 */
function planTimeIn(openRows, now = new Date(), abandonRequested = false) {
  const today = philippineDateStr(now);
  const days = (openRows || []).map((r) => philippineDateStr(new Date(r.time_in)));

  // Same-day open record — Time Out first. A session started today is
  // never abandoned, confirmation or not.
  if (days.includes(today)) {
    return { action: "blocked", day: today, abandonDays: [] };
  }

  const abandonDays = [...new Set(days)];
  const withinWindow = (openRows || []).some((r) => !isExpired(r.time_in, now));

  if (withinWindow && !abandonRequested) {
    return { action: "confirm_abandon", day: abandonDays[0] || null, abandonDays };
  }
  return { action: "proceed", day: null, abandonDays };
}

module.exports = {
  getCreditPolicy,
  fixedCreditHours,
  closedByLabel,
  rowCredit,
  planTimeOut,
  planTimeIn,
  isExpired,
  maxSessionHours,
};
