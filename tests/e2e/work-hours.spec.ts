// M.135 — pure-logic regression tests for the Department work-hours
// helper (frontend/lib/workHours.ts). No browser, server, or database is
// involved. Replaces the throw seen in M.134 when a Biometrics record
// has a legitimate NULL time_in alongside a recorded time_out.
//
// Run: npx playwright test tests/e2e/work-hours.spec.ts

import { test, expect } from "@playwright/test";
import { toDate, getWorkHours } from "../../frontend/lib/workHours";

// Exact response shape produced by biometricRowToApi (backend/routes/logsRoutes.js).
const bioRow = (time_in: string | null, time_out: string | null) => ({
  id: 1,
  source: "BIOMETRICS",
  source_id: 1,
  time_in,
  time_out,
  closed_by: null,
  status: "BIOMETRIC",
  pending: false,
  no_time_out: time_out === null,
  employee_db_id: 1,
  employee_id: "0001",
  role: "staff",
  name: "Fixture",
  department_id: 1,
  date: "2026-11-08",
});

test.describe("getWorkHours — valid records (existing behavior unchanged)", () => {
  test("valid ISO time_in/time_out (Online DTR) keeps the existing calculation", () => {
    expect(
      getWorkHours({
        time_in: "2026-11-09T00:00:00.000Z",
        time_out: "2026-11-09T07:30:00.000Z",
      })
    ).toBe("7h 30m");
  });

  test("valid Manila wall strings (Biometrics) keep the existing calculation", () => {
    expect(
      getWorkHours({
        time_in: "2026-11-09 08:00:00",
        time_out: "2026-11-09 17:15:00",
      })
    ).toBe("9h 15m");
  });

  test("duration formatting/rounding is unchanged (floor hours, floor minutes)", () => {
    expect(
      getWorkHours({
        time_in: "2026-11-09 08:00:00",
        time_out: "2026-11-09 10:59:59",
      })
    ).toBe("2h 59m");
  });

  test("AUTO row awaiting correction keeps Policy A 'Pending' (no credited hours)", () => {
    expect(
      getWorkHours({
        time_in: "2026-11-09 08:00:00",
        time_out: "2026-11-09 17:00:00",
        pending: true,
      })
    ).toBe("Pending");
  });
});

test.describe("getWorkHours — M.134 NULL/invalid time_in safety", () => {
  test("NULL time_in with recorded time_out (M.134 crash shape) returns '--' without throwing", () => {
    const row = bioRow(null, "2026-11-08 17:02:11");
    expect(() => getWorkHours(row)).not.toThrow();
    expect(getWorkHours(row)).toBe("--");
  });

  test("undefined time_in returns '--' without throwing", () => {
    expect(() =>
      getWorkHours({ time_out: "2026-11-08 17:02:11" })
    ).not.toThrow();
    expect(getWorkHours({ time_out: "2026-11-08 17:02:11" })).toBe("--");
  });

  test("empty-string time_in is treated as missing and returns '--'", () => {
    expect(getWorkHours({ time_in: "", time_out: "2026-11-08 17:02:11" })).toBe("--");
  });

  test("unparseable time_in returns '--' instead of NaN arithmetic", () => {
    expect(
      getWorkHours({ time_in: "not-a-date", time_out: "2026-11-08 17:02:11" })
    ).toBe("--");
  });

  test("unparseable time_out with valid time_in returns '--'", () => {
    expect(
      getWorkHours({ time_in: "2026-11-08 08:00:00", time_out: "garbage" })
    ).toBe("--");
  });

  test("missing time_out with valid time_in preserves the existing '--'", () => {
    expect(getWorkHours({ time_in: "2026-11-08 08:00:00", time_out: null })).toBe("--");
    expect(getWorkHours({ time_in: "2026-11-08 08:00:00" })).toBe("--");
  });

  test("both timestamps missing returns '--'", () => {
    expect(getWorkHours(bioRow(null, null))).toBe("--");
  });

  test("date validity is checked before the Policy A 'Pending' label", () => {
    // Pending rows in production always carry a time_in (attendance_logs
    // is NOT NULL); if one ever lacked it, work hours must still be '--'.
    expect(
      getWorkHours({ time_in: null, time_out: "2026-11-08 17:02:11", pending: true })
    ).toBe("--");
  });

  test("the log object itself is never mutated", () => {
    const row = bioRow(null, "2026-11-08 17:02:11");
    const snapshot = JSON.stringify(row);
    getWorkHours(row);
    expect(JSON.stringify(row)).toBe(snapshot);
  });
});

test.describe("Department Biometrics rendering input (M.134 scenario)", () => {
  test("a biometric row with NULL dtr_entry.timein renders work hours as '--'", () => {
    // The Department table maps rows through getWorkHours inside
    // filteredLogs.map — this is the exact value rendered in that cell.
    expect(getWorkHours(bioRow(null, "2026-11-08 17:02:11"))).toBe("--");
    // Complete rows keep their computed span.
    expect(getWorkHours(bioRow("2026-11-08 08:01:00", "2026-11-08 17:02:11"))).toBe("9h 1m");
  });
});

test.describe("toDate — parsing contract preserved (M.69)", () => {
  test("Manila wall strings are parsed at +08:00", () => {
    expect(toDate("2026-11-09 08:00:00")?.toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });

  test("ISO strings pass through Date parsing", () => {
    expect(toDate("2026-11-09T00:00:00.000Z")?.toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });

  test("null/undefined return null", () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
  });
});
