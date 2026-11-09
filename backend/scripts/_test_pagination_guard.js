// M.72 — regression test for the departments pagination-request guard.
// Pure logic only (no database, no React). Run:
//   node backend/scripts/_test_pagination_guard.js
//
// Covers the race invariants that live in the guard itself. Invariants
// implemented in component state/JSX (empty-vs-loading rendering, the
// full-page spinner's loadedOnce gate, in-table loading rows) and the
// response-ordering requestSeq guard are verified by code-path analysis
// in the M.72 report — no React test runner exists in this project and
// none is installed for this phase.
const assert = require("assert");
const {
  makeWindowKey,
  beginRequest,
  settleRequest,
  canStartPagination,
} = require("../../frontend/lib/paginationGuard.js");

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
    process.exitCode = 1;
  }
}

const idle = (key) => ({ key, busy: false });
const base = { loading: false, fetchingMore: false, hasMore: true };

console.log("PAGINATION GUARD");

check("window key identifies the request window (page is not part of it)", () => {
  const a = makeWindowKey({ search: "TALA", filter: "today", from: "2026-06-01", to: "2026-06-30", source: "online", idSpace: "" });
  const b = makeWindowKey({ search: "TALA", filter: "today", from: "2026-06-01", to: "2026-06-30", source: "online", idSpace: "" });
  assert.strictEqual(a, b, "identical windows must produce identical keys");
  const c = makeWindowKey({ search: "TALA", filter: "today", from: "2026-06-01", to: "2026-07-15", source: "online", idSpace: "" });
  assert.notStrictEqual(a, c, "a changed date window must change the key");
  const d = makeWindowKey({ search: "TALA", filter: "today", from: "2026-06-01", to: "2026-06-30", source: "both", idSpace: "" });
  assert.notStrictEqual(a, d, "a changed source must change the key");
});

check("detail-page style keys (tab/dates/source) behave the same", () => {
  const a = makeWindowKey({ tab: "today", from: "", to: "", source: "online" });
  const b = makeWindowKey({ tab: "week", from: "", to: "", source: "online" });
  assert.notStrictEqual(a, b, "tab change must invalidate pagination context");
});

check("inv 2: Load More cannot start while a request is in flight (loading)", () => {
  assert.strictEqual(
    canStartPagination({ guard: idle("K"), key: "K", ...base, loading: true }),
    false
  );
});

check("inv 2: Load More cannot start while a pagination fetch is in flight", () => {
  assert.strictEqual(
    canStartPagination({ guard: idle("K"), key: "K", ...base, fetchingMore: true }),
    false
  );
});

check("inv 2: Load More cannot start when no further results exist", () => {
  assert.strictEqual(
    canStartPagination({ guard: idle("K"), key: "K", ...base, hasMore: false }),
    false
  );
});

check("inv 1: a first-page request invalidates the previous pagination context", () => {
  // The request for the NEW window has started: guard locked at its key.
  const guard = beginRequest("NEW");
  assert.strictEqual(canStartPagination({ guard, key: "NEW", ...base }), false,
    "locked guard rejects even for the current window");
});

check("inv 1: a stale-render click for the old window is rejected after the window changed", () => {
  // Filter changed → effect not yet flushed: the click's closure already
  // carries the NEW window key while the guard still holds the old one.
  const guard = idle("OLD");
  assert.strictEqual(canStartPagination({ guard, key: "NEW", ...base }), false,
    "key mismatch = stale window; must not paginate");
  assert.strictEqual(canStartPagination({ guard, key: "OLD", ...base }), true,
    "same window while idle may paginate (positive control)");
});

check("inv 2: double-accept in one render gap is rejected by the synchronous lock", () => {
  const guard = idle("K");
  const first = canStartPagination({ guard, key: "K", ...base });
  assert.strictEqual(first, true);
  const locked = beginRequest("K"); // what the handler does on accept
  assert.strictEqual(canStartPagination({ guard: locked, key: "K", ...base }), false,
    "second click before the effect flush must be rejected");
});

check("idle guard accepts pagination for the current window (positive control)", () => {
  assert.strictEqual(canStartPagination({ guard: idle("K"), key: "K", ...base }), true);
});

check("settling releases only the busy lock, keeping the window key", () => {
  const settled = settleRequest(beginRequest("K"));
  assert.strictEqual(settled.busy, false);
  assert.strictEqual(settled.key, "K", "window identity must survive until the next request");
  assert.strictEqual(canStartPagination({ guard: settled, key: "K", ...base }), true);
});

check("a settled guard for another window still rejects the stale click", () => {
  const settled = settleRequest(beginRequest("NEW"));
  assert.strictEqual(canStartPagination({ guard: settled, key: "OLD", ...base }), false);
});

check("guard survives unset/torn states without throwing", () => {
  assert.strictEqual(canStartPagination({ guard: undefined, key: "K", ...base }), false);
  const settled = settleRequest(undefined);
  assert.strictEqual(settled.busy, false);
});

console.log(`\n${passed} checks passed${process.exitCode ? " (WITH FAILURES)" : ""}`);
if (process.exitCode) process.exit(process.exitCode);
