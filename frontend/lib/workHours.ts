// M.135 — attendance timestamp helpers (extracted from the Department
// logs page unchanged so the work-hours contract is directly testable).
// M.134 fix: a NULL or unparseable time_in is a legitimate Biometrics
// value (dtr_entry.timein NULL) — the work span is unknowable and must
// display "--" instead of throwing at getTime().

export type TimeInput = string | Date | null | undefined;

export interface WorkHoursLog {
  time_in?: TimeInput;
  time_out?: TimeInput;
  pending?: boolean;
}

// M.69: timestamps may be ISO strings (Online DTR) or Manila wall
// strings ("YYYY-MM-DD HH:MM:SS", Biometrics) — parse both safely.
export const toDate = (v: TimeInput): Date | null => {
  if (!v) return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) {
    return new Date(v.replace(" ", "T") + "+08:00");
  }
  return new Date(v);
};

const isValidDate = (d: Date | null): d is Date =>
  d !== null && !Number.isNaN(d.valueOf());

export const getWorkHours = (log: WorkHoursLog): string => {
  if (!log.time_out) return "--";
  const start = toDate(log.time_in);
  const end = toDate(log.time_out);
  if (!isValidDate(start) || !isValidDate(end)) return "--";
  // AUTO rows awaiting correction carry NO credited hours (Policy A).
  if (log.pending) return "Pending";
  const diff = end.getTime() - start.getTime();
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hrs}h ${mins}m`;
};
