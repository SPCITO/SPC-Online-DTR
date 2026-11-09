// M.72 — pure pagination-request guard for the admin departments pages.
//
// React state flags (loading / fetchingMore / hasMore) only update after
// the fetch effect flushes, so a click that lands between a filter change
// and that flush would read stale flags and could paginate a window the
// user has already left. The guard is a synchronously updated ref holding
// { key, busy }:
//   - key  — request window (search/filter/dates/source) of the request
//            last started or accepted; a click whose own window key
//            differs is stale and must not paginate
//   - busy — locked synchronously the moment a request is accepted or
//            started; released only when that request settles (the caller
//            sequence-guards the settle so an obsolete request can never
//            release a newer request's lock)
//
// Pure functions only — no React — so the race rules stay unit-testable.

function makeWindowKey(parts = {}) {
  return [
    parts.search,
    parts.filter,
    parts.tab,
    parts.from,
    parts.to,
    parts.source,
    parts.idSpace,
  ]
    .map((p) => (p == null ? "" : String(p)))
    .join("|");
}

/** Guard state for a request that is starting/being accepted. */
function beginRequest(key) {
  return { key, busy: true };
}

/** Guard state after the owning request settled (caller sequence-guards). */
function settleRequest(guard) {
  return guard ? { ...guard, busy: false } : { key: "", busy: false };
}

/**
 * May a pagination request be issued right now?
 * Rejects while any request is in flight (loading or fetchingMore), when
 * no further results exist (hasMore), for a locked guard (click racing a
 * pending request), and for a stale window key (filter changed since the
 * last request started but its effect has not flushed yet).
 */
function canStartPagination({ guard, key, loading, fetchingMore, hasMore }) {
  if (loading || fetchingMore || !hasMore) return false;
  if (!guard || guard.busy) return false;
  return guard.key === key;
}

module.exports = { makeWindowKey, beginRequest, settleRequest, canStartPagination };
