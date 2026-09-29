// ============================================================
// Shared Philippine-time (Asia/Manila) date helpers.
//
// Reuses the project's established mechanism: the "en-CA" locale with
// timeZone "Asia/Manila" produces YYYY-MM-DD Manila dates — the same
// pattern as timeoutReminder.getPhilippineDate().
//
// The mysql2 driver is configured with timezone "+08:00"
// (backend/config/db.js), so Date bounds produced here are serialized
// as Manila wall-clock strings (00:00:00 .. 23:59:59) in queries.
// ============================================================

/** Today's calendar date in Asia/Manila as YYYY-MM-DD. */
function philippineDateStr(now = new Date()) {
  return now.toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  });
}

/**
 * The Manila calendar-day window containing `now`, as Date bounds.
 * The window rolls over at 00:00 Asia/Manila (not at the container's
 * UTC 08:00 equivalent).
 */
function manilaDayRange(now = new Date()) {
  const day = philippineDateStr(now);
  return {
    start: new Date(`${day}T00:00:00+08:00`),
    end: new Date(`${day}T23:59:59+08:00`),
  };
}

// ---- M.39 H1b additions (pure, deterministic, dependency-free) ----

/** Calendar-safe YYYY-MM-DD from y/m/d parts (UTC arithmetic only). */
function ymd(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/**
 * The Manila calendar-month window (calendar-month semantics preserved).
 * `month` is 1-12. Starts 00:00:00 on the 1st and ends 23:59:59 on the
 * month's last Manila day — both at Asia/Manila midnight boundaries.
 */
function manilaMonthRange(year, month) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: new Date(`${ymd(year, month, 1)}T00:00:00+08:00`),
    end: new Date(`${ymd(year, month, lastDay)}T23:59:59+08:00`),
  };
}

/**
 * The Manila week window containing `now`.
 * PRESERVES the application's existing week convention: Monday..Sunday
 * (same rule as the previous departmentRoutes export logic). Rolls over
 * at 00:00 Asia/Manila.
 */
function manilaWeekRange(now = new Date()) {
  const [y, m, d] = philippineDateStr(now).split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // weekday of the Manila date
  const backToMonday = dow === 0 ? 6 : dow - 1;
  return {
    start: new Date(`${ymd(y, m, d - backToMonday)}T00:00:00+08:00`),
    end: new Date(`${ymd(y, m, d - backToMonday + 6)}T23:59:59+08:00`),
  };
}

/** Date label in the caller's usual display format, interpreted in Asia/Manila. */
function manilaDateLabel(value) {
  return new Date(value).toLocaleDateString(undefined, {
    timeZone: "Asia/Manila",
  });
}

/** Time label in the caller's usual display format, interpreted in Asia/Manila. */
function manilaTimeLabel(value) {
  return new Date(value).toLocaleTimeString(undefined, {
    timeZone: "Asia/Manila",
  });
}

module.exports = {
  philippineDateStr,
  manilaDayRange,
  manilaMonthRange,
  manilaWeekRange,
  manilaDateLabel,
  manilaTimeLabel,
};
