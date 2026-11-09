"use client";

// ============================================================
// AttendanceCorrectionModal — M.39 admin Time Out correction control.
//
// Opens from the admin attendance views for records that need a real
// Time Out (AUTO / PENDING CORRECTION) or that were already corrected
// (ADMIN-CORRECTED — shows the audit trail and allows re-correction).
//
// Rules enforced here are usability-only mirrors of the backend:
// the server remains authoritative for bounds and authorization.
// The actual Time Out must fall on the record's own Manila attendance
// day and must not precede Time In — so the control only asks for the
// TIME (native time picker); the attendance date is fixed and shown.
// ============================================================

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, TriangleAlert, Check, History, Loader2, Clock3 } from "lucide-react";
import { api } from "@/lib/api";

type CorrectionRow = {
  id: number;
  old_time_out: string | null;
  new_time_out: string;
  corrected_by: number | null;
  corrected_by_name: string | null;
  corrected_at: string;
};

type Props = {
  log: any; // attendance row: id, name, time_in, time_out, closed_by, status, pending
  onClose: () => void;
  onCorrected: (updated: any) => void;
};

/** Attendance date of a record, as a Manila YYYY-MM-DD string. */
function manilaDateStr(value: string | Date) {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

/** Manila wall-clock HH:MM of a record timestamp. */
function manilaTimeStr(value: string | Date) {
  return new Date(value).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Human label for a record timestamp (Manila). */
function manilaLabel(value: string | Date | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Calendar-safe YYYY-MM-DD shift (UTC arithmetic only). */
function shiftDay(dayStr: string, offsetDays: number) {
  const [y, m, d] = dayStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return dt.toISOString().slice(0, 10);
}

export default function AttendanceCorrectionModal({ log, onClose, onCorrected }: Props) {
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [timeValue, setTimeValue] = useState("");
  const [nextDay, setNextDay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [trail, setTrail] = useState<CorrectionRow[]>([]);
  const [result, setResult] = useState<any>(null);

  const isAuto = log.closed_by === "auto";
  // Blank record past the 24h window (payroll "No Time Out" model).
  const isNoTimeOut = !log.time_out;
  const attendanceDate = manilaDateStr(log.time_in);
  // Overnight shifts end the NEXT day (e.g. 21:00 → 06:00).
  const targetDate = nextDay ? shiftDay(attendanceDate, 1) : attendanceDate;

  // Audit trail — only readable by admins (route is admin-only server-side).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = await api.getAttendanceCorrections(log.id);
        if (active && Array.isArray(rows)) setTrail(rows);
      } catch {
        // Trail is informational — the correction itself must still work.
      }
    })();
    return () => {
      active = false;
    };
  }, [log.id]);

  const validate = (hhmm: string) => {
    if (!/^\d{2}:\d{2}$/.test(hhmm)) return "Please pick a valid time.";
    // Mirrors the server rule (usability only — the server is authoritative):
    // the actual Time Out must be after Time In and within the legitimate
    // session window (24h), so overnight duties are representable.
    const effective = new Date(`${targetDate}T${hhmm}:00+08:00`).getTime();
    const start = new Date(log.time_in).getTime();
    if (effective <= start) return "The actual Time Out must be after this record's Time In.";
    if (effective > start + 24 * 3600 * 1000) return "The actual Time Out must be within 24 hours after Time In.";
    return null;
  };

  const handleReview = () => {
    const v = validate(timeValue);
    setError(v);
    if (!v) setStep("confirm");
  };

  const handleConfirm = async () => {
    try {
      setSaving(true);
      setError(null);
      // Shift-aware: the actual Time Out may land the NEXT day for
      // overnight duties (e.g. 21:00 → 06:00).
      const res: any = await api.correctAttendanceTimeOut(
        log.id,
        `${targetDate} ${timeValue}:00`
      );
      setResult(res);
      setStep("done");
      onCorrected({
        ...log,
        time_out: res?.attendance?.time_out ?? `${targetDate} ${timeValue}:00`,
        closed_by: "admin",
        status: "ADMIN-CORRECTED",
        pending: false,
      });
      try {
        const rows = await api.getAttendanceCorrections(log.id);
        if (Array.isArray(rows)) setTrail(rows);
      } catch {
        // informational only
      }
    } catch (err: any) {
      setError(err?.message || "Correction failed. Please check the value and try again.");
      setStep("form");
    } finally {
      setSaving(false);
    }
  };

  const closureBadge = (l: any) => {
    if (!l.time_out) return "OPEN";
    if (l.status === "AUTO") return l.pending ? "AUTO / PENDING CORRECTION" : "AUTO";
    return l.status || "USER";
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto"
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Clock3 size={18} className="text-amber-600" />
            {step === "done" ? "Correction Recorded" : "Correct Time Out"}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* RECORD SUMMARY */}
          <div className="rounded-2xl bg-gray-50 p-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-gray-500 font-bold uppercase text-xs">Employee</span>
              <span className="font-semibold text-gray-900 text-right">{log.name || `Employee #${log.employee_db_id}`}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500 font-bold uppercase text-xs">Attendance Date</span>
              <span className="font-semibold text-gray-900">{attendanceDate}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500 font-bold uppercase text-xs">Time In</span>
              <span className="font-semibold text-gray-900">{manilaLabel(log.time_in)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500 font-bold uppercase text-xs">
                {isAuto ? "Automatic Time Out" : "Recorded Time Out"}
              </span>
              <span className="font-semibold text-gray-900">{manilaLabel(log.time_out)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500 font-bold uppercase text-xs">Status</span>
              <span className={`font-bold text-xs px-2 py-1 rounded-full ${
                isAuto ? "bg-orange-100 text-orange-700" : "bg-emerald-100 text-emerald-700"
              }`}>
                {closureBadge(log)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500 font-bold uppercase text-xs">Credited Hours</span>
              <span className="font-semibold text-gray-900">
                {log.no_time_out ? "No Time Out (blank)" : log.pending ? "Pending" : "Calculated normally"}
              </span>
            </div>
          </div>

          {/* WARNING — record needs correction */}
          {(isAuto || isNoTimeOut) && step !== "done" && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex gap-3">
              <TriangleAlert size={20} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 leading-relaxed">
                {isNoTimeOut
                  ? "This record has no Time Out recorded (the 24-hour time-out period has passed). Enter the approved Time Out from the employee's DTR Correction Form."
                  : "This attendance record was automatically closed because no Time Out was recorded. Enter the employee's actual Time Out for this attendance date."}{" "}
                The correction is based on your administrative record of the actual time.
              </p>
            </div>
          )}

          {/* AUDIT TRAIL */}
          {trail.length > 0 && (
            <div className="rounded-2xl border border-gray-100 p-4">
              <p className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2 mb-2">
                <History size={14} /> Correction History
              </p>
              <div className="space-y-2">
                {trail.map((c) => (
                  <div key={c.id} className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3">
                    <div>
                      <span className="font-semibold">{manilaLabel(c.old_time_out)}</span>
                      {" → "}
                      <span className="font-semibold text-emerald-700">{manilaLabel(c.new_time_out)}</span>
                    </div>
                    <div className="text-gray-400 mt-1">
                      Corrected by {c.corrected_by_name || "Unknown"} on {manilaLabel(c.corrected_at)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === "form" && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">
                  Actual Time Out ({attendanceDate})
                </label>
                <input
                  type="time"
                  value={timeValue}
                  onChange={(e) => {
                    setTimeValue(e.target.value);
                    setError(null);
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-amber-500 outline-none text-gray-900"
                />
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Must be after Time In ({manilaTimeStr(log.time_in)}) and within 24 hours
                  (overnight duties included). Time In and the attendance date are not
                  modifiable.
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={nextDay}
                  onChange={(e) => {
                    setNextDay(e.target.checked);
                    setError(null);
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                Next day (overnight shift — Time Out is after midnight)
              </label>

              {error && (
                <p className="text-sm text-red-600 font-semibold">{error}</p>
              )}

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReview}
                  disabled={!timeValue}
                  className="flex-1 py-3 rounded-xl font-bold text-white bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-200 transition-all disabled:opacity-50"
                >
                  Review Correction
                </button>
              </div>
            </>
          )}

          {step === "confirm" && (
            <>
              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/50 p-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500 font-bold uppercase text-xs">Employee</span>
                  <span className="font-semibold text-gray-900 text-right">{log.name || `Employee #${log.employee_db_id}`}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500 font-bold uppercase text-xs">Attendance Date</span>
                  <span className="font-semibold text-gray-900">{attendanceDate}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500 font-bold uppercase text-xs">Original System Time Out</span>
                  <span className="font-semibold text-gray-900">{manilaLabel(log.time_out)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500 font-bold uppercase text-xs">New Time Out</span>
                  <span className="font-bold text-emerald-700">{targetDate} {timeValue}</span>
                </div>
              </div>

              <p className="text-xs text-gray-400 leading-relaxed">
                You are correcting this record based on external/administrative knowledge —
                the system does not know the employee's true Time Out. The original value is
                preserved in the audit trail.
              </p>

              {error && (
                <p className="text-sm text-red-600 font-semibold">{error}</p>
              )}

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep("form")}
                  className="flex-1 py-3 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl font-bold text-white bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-200 transition-all disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {saving ? <Loader2 size={18} className="animate-spin" /> : "Confirm Correction"}
                </button>
              </div>
            </>
          )}

          {step === "done" && (
            <>
              <div className="text-center py-2">
                <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
                  <Check size={24} className="text-green-600" />
                </div>
                <p className="font-bold text-gray-900">Time Out corrected</p>
                <p className="text-sm text-gray-500 mt-1">
                  The record is now ADMIN-CORRECTED and its hours are calculated normally.
                  The original automatic value remains in the correction history.
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all"
              >
                Done
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
