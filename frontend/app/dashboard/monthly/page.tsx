"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import LogSourceSelector from "@/components/LogSourceSelector";
import type { SourceMode } from "@/lib/types";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  TrendingUp,
  BriefcaseBusiness,
} from "lucide-react";

export default function MonthlyDashboard() {
  return (
    <ProtectedRoute>
      <MonthlyContent />
    </ProtectedRoute>
  );
}

function MonthlyContent() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [selectedDay, setSelectedDay] = useState<any>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  // M.69: Log Source — online (default) / biometrics / both
  const [source, setSource] = useState<SourceMode>("online");
  const router = useRouter();

  // M.69: safe display parsing for ISO strings (Online DTR) and Manila
  // wall strings (Biometrics).
  const toDate = (v: string | Date | null | undefined): Date | null => {
    if (!v) return null;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) {
      return new Date(v.replace(" ", "T") + "+08:00");
    }
    return new Date(v);
  };

  // FETCH DATA (M.70: request sequencing guards against stale repaints)
  const requestSeq = useRef(0);
  const fetchMonthly = async () => {
    if (!user) return;

    const seq = ++requestSeq.current;
    try {
      const res = await api.getMonthlyLogs(
        user.employee_db_id,
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        source
      );
      if (seq !== requestSeq.current) return;
      setData(res);
    } catch (err) {
      console.error("Failed to fetch monthly data:", err);
      if (seq !== requestSeq.current) return;
      setData(null);
    }
  };

  useEffect(() => {
    if (user) fetchMonthly();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user,
    currentDate.getFullYear(),
    currentDate.getMonth(),
    source,
  ]);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f7f5] text-emerald-700 text-lg font-semibold">
        Loading monthly attendance...
      </div>
    );
  }

  // CALENDAR SETUP
  const monthStart = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1
  );

  const monthEnd = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0
  );

  const startDay = monthStart.getDay();
  const totalDays = monthEnd.getDate();

  const daysArray: (number | null)[] = [];

  for (let i = 0; i < startDay; i++) daysArray.push(null);
  for (let i = 1; i <= totalDays; i++) daysArray.push(i);

  // HELPERS
  const getDayRecord = (day: number) => {
    const fullDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      day
    );

    return data.days.find(
      (d: any) =>
        new Date(d.date).toDateString() === fullDate.toDateString()
    );
  };

  const isPastDay = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const isWeekday = (date: Date) => {
    const d = date.getDay();
    return d !== 0 && d !== 6;
  };

  const getDayColor = (day: number, record: any) => {
    const fullDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      day
    );

    const past = isPastDay(fullDate);
    const weekday = isWeekday(fullDate);

    if (!record && past && weekday)
      return "bg-red-100 text-red-600 border-red-200";

    if (!record)
      return "bg-slate-100 text-slate-400 border-slate-200";

    // Blank expired record ("No Time Out") — payroll model
    if (record.no_time_out)
      return "bg-rose-100 text-rose-700 border-rose-200";

    // Auto-closed (forgotten Time Out) — visibly distinct from a real day
    if (record.pending)
      return "bg-orange-100 text-orange-700 border-orange-200";

    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  };

  const progress =
    (parseFloat(data.summary.total_hours) / 160) * 100;

  return (
    <div className="min-h-screen bg-[#f4f7f5] overflow-x-hidden">

      {/* BG */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-120px] left-[-120px] w-[320px] h-[320px] bg-emerald-200/40 blur-3xl rounded-full" />
        <div className="absolute bottom-[-120px] right-[-120px] w-[320px] h-[320px] bg-green-200/40 blur-3xl rounded-full" />
      </div>

      <div className="relative px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        <div className="max-w-6xl mx-auto space-y-7">

          {/* HEADER */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="
              rounded-[36px]

              bg-white/80
              backdrop-blur-2xl

              border border-white/70

              shadow-[0_15px_50px_rgba(0,0,0,0.08)]

              p-6 sm:p-8
            "
          >

            <div className="flex flex-col lg:flex-row justify-between gap-6 lg:items-center">

              <div>

                <p className="text-xs tracking-[0.28em] uppercase text-emerald-600 font-semibold mb-3">
                  Performance Overview
                </p>

                <h1 className="text-3xl sm:text-5xl font-black text-slate-900">
                  Monthly Attendance
                </h1>

                <p className="text-slate-500 mt-3">
                  Track your attendance performance
                </p>

                <div className="mt-4">
                  <LogSourceSelector
                    value={source}
                    onChange={(s) => {
                      setSource(s);
                      setSelectedDay(null);
                    }}
                  />
                </div>

              </div>

              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => router.push("/dashboard")}
                className="
                  flex items-center justify-center gap-2

                  px-6 py-4

                  rounded-2xl

                  bg-[#0f172a]
                  hover:bg-slate-800

                  text-white
                  font-semibold

                  shadow-[0_10px_30px_rgba(15,23,42,0.22)]

                  transition-all duration-300

                  w-full sm:w-auto
                "
              >
                <ArrowLeft size={18} />
                Dashboard
              </motion.button>

            </div>

          </motion.div>

          {/* SUMMARY */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

            {/* TOTAL HOURS */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="
                rounded-[32px]

                bg-gradient-to-br
                from-[#07152f]
                via-[#081b3d]
                to-[#0b3b2e]

                p-6

                text-white

                shadow-[0_15px_40px_rgba(0,0,0,0.14)]
              "
            >

              <div className="flex items-center gap-2 text-emerald-200/80 text-sm uppercase tracking-[0.2em]">
                <Clock3 size={16} />
                Total Hours
              </div>

              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black mt-4">
                {data.summary.total_hours}
              </h2>

            </motion.div>

            {/* DAYS WORKED */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="
                rounded-[32px]

                bg-white/90
                backdrop-blur-xl

                border border-white

                p-6

                shadow-[0_10px_35px_rgba(0,0,0,0.07)]
              "
            >

              <div className="flex items-center gap-2 text-slate-500 text-sm uppercase tracking-[0.2em]">
                <BriefcaseBusiness size={16} />
                Days Worked
              </div>

              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black mt-4 text-emerald-700">
                {data.summary.total_days}
              </h2>

            </motion.div>

          </div>

          {/* PROGRESS */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="
              rounded-[36px]

              bg-white/92
              backdrop-blur-2xl

              border border-white

              shadow-[0_15px_50px_rgba(0,0,0,0.08)]

              p-6 sm:p-8
            "
          >

            <div className="flex items-center gap-2 text-slate-500 text-sm uppercase tracking-[0.2em]">
              <TrendingUp size={16} />
              Monthly Progress
            </div>

            <div className="mt-5 w-full h-4 rounded-full bg-slate-200 overflow-hidden">

              <div
                className="
                  h-full

                  bg-gradient-to-r
                  from-emerald-500
                  to-green-600

                  rounded-full

                  transition-all duration-500
                "
                style={{
                  width: `${Math.min(progress, 100)}%`,
                }}
              />

            </div>

            <p className="mt-3 text-slate-500 text-sm font-medium">
              {progress.toFixed(1)}% of 160 monthly hours
            </p>

          </motion.div>

          {/* CALENDAR */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="
              rounded-[36px]

              bg-white/92
              backdrop-blur-2xl

              border border-white

              shadow-[0_15px_50px_rgba(0,0,0,0.08)]

              p-6 sm:p-8
            "
          >

            {/* TOP */}
            <div className="flex items-center justify-between mb-8">

              <button
                onClick={() =>
                  setCurrentDate(
                    new Date(
                      currentDate.getFullYear(),
                      currentDate.getMonth() - 1
                    )
                  )
                }
                className="
                  h-11 w-11

                  rounded-2xl

                  bg-slate-100
                  hover:bg-slate-200

                  text-slate-700

                  transition
                "
              >
                ←
              </button>

              <h2 className="text-2xl font-black text-slate-900">
                {currentDate.toLocaleString("default", {
                  month: "long",
                  year: "numeric",
                })}
              </h2>

              <button
                onClick={() =>
                  setCurrentDate(
                    new Date(
                      currentDate.getFullYear(),
                      currentDate.getMonth() + 1
                    )
                  )
                }
                className="
                  h-11 w-11

                  rounded-2xl

                  bg-slate-100
                  hover:bg-slate-200

                  text-slate-700

                  transition
                "
              >
                →
              </button>

            </div>

            {/* WEEK */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-3">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
                <div
                  key={d}
                  className="
                    text-center

                    text-xs
                    uppercase

                    tracking-[0.16em]

                    text-slate-400
                    font-semibold
                  "
                >
                  {d}
                </div>
              ))}
            </div>

            {/* GRID */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2 md:gap-3">

              {daysArray.map((day, i) => {

                if (!day) {
                  return <div key={i} />;
                }

                const record = getDayRecord(day);

                const color = getDayColor(day, record);

                const isSelected =
                  selectedDay &&
                  new Date(selectedDay.date).getDate() === day;

                return (

                  <button
                    key={i}
                    onClick={() => setSelectedDay(record)}
                    className={`
                      h-14 rounded-2xl

                      border

                      font-bold

                      transition-all duration-300

                      hover:scale-[1.05]

                      ${color}

                      ${
                        isSelected
                          ? "ring-2 ring-emerald-600 scale-[1.05]"
                          : ""
                      }
                    `}
                  >
                    {day}
                  </button>

                );
              })}

            </div>

            {/* LEGEND */}
            <div className="flex flex-wrap gap-5 mt-8 text-sm font-semibold">

              <div className="flex items-center gap-2 text-slate-700">
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
                Present
              </div>

              <div className="flex items-center gap-2 text-slate-700">
                <span className="w-3 h-3 rounded-full bg-red-500" />
                Absent
              </div>

              <div className="flex items-center gap-2 text-slate-700">
                <span className="w-3 h-3 rounded-full bg-orange-400" />
                Auto-closed (pending)
              </div>

              <div className="flex items-center gap-2 text-slate-700">
                <span className="w-3 h-3 rounded-full bg-rose-400" />
                No Time Out
              </div>

            </div>

          </motion.div>

          {/* DETAILS */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65 }}
            className="
              rounded-[36px]

              bg-white/92
              backdrop-blur-2xl

              border border-white

              shadow-[0_15px_50px_rgba(0,0,0,0.08)]

              p-6 sm:p-8
            "
          >

            {selectedDay ? (

              <>

                <div className="flex items-center gap-2 text-slate-500 text-sm uppercase tracking-[0.2em] mb-3">
                  <CalendarDays size={16} />
                  Attendance Details
                </div>

                <h2 className="text-3xl font-black text-slate-900">
                  {new Date(selectedDay.date).toLocaleDateString()}
                </h2>

                <div className="mt-6 grid sm:grid-cols-2 gap-4">

                  <div className="rounded-2xl bg-slate-50 p-5">
                    <p className="text-slate-400 text-xs uppercase tracking-[0.16em]">
                      Status
                    </p>

                    <h3 className="mt-2 text-xl font-black text-slate-900">
                      {selectedDay.no_time_out
                        ? "No Time Out"
                        : selectedDay.pending
                        ? "Auto-closed (Pending)"
                        : selectedDay.last_out
                        ? "Completed"
                        : "Open"}
                    </h3>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-5">
                    <p className="text-slate-400 text-xs uppercase tracking-[0.16em]">
                      Hours Worked
                    </p>

                    <h3 className="mt-2 text-xl font-black text-slate-900">
                      {selectedDay.no_time_out ? "—" : selectedDay.pending ? "Pending" : selectedDay.hours}
                    </h3>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-5">
                    <p className="text-slate-400 text-xs uppercase tracking-[0.16em]">
                      Time In
                    </p>

                    <h3 className="mt-2 text-xl font-black text-slate-900">
                      {toDate(selectedDay.first_in)?.toLocaleTimeString() ?? "—"}
                    </h3>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-5">
                    <p className="text-slate-400 text-xs uppercase tracking-[0.16em]">
                      Time Out
                      {selectedDay.status === "NO TIME-OUT" && (
                        <span className="ml-2 text-rose-500">(No Time Out)</span>
                      )}
                      {selectedDay.status === "AUTO" && (
                        <span className="ml-2 text-orange-500">(Auto-closed)</span>
                      )}
                      {selectedDay.status === "ADMIN-CORRECTED" && (
                        <span className="ml-2 text-emerald-600">(Corrected)</span>
                      )}
                    </p>

                    <h3 className="mt-2 text-xl font-black text-slate-900">
                      {selectedDay.last_out
                        ? toDate(selectedDay.last_out)?.toLocaleTimeString()
                        : selectedDay.no_time_out
                        ? "No Time Out"
                        : "—"}
                    </h3>
                  </div>

                </div>

                {/* M.69 — Both/Summary: every source session preserved,
                    never merged into one fabricated range. */}
                {(selectedDay.online || selectedDay.biometrics) && (
                  <div className="mt-6 grid sm:grid-cols-2 gap-4">
                    <div className="rounded-2xl bg-emerald-50/60 p-5">
                      <p className="text-emerald-700 text-xs uppercase tracking-[0.16em] font-bold">
                        Online DTR sessions
                      </p>
                      <div className="mt-2 space-y-1 text-slate-800 font-mono text-sm">
                        {(selectedDay.online || []).length > 0 ? (
                          selectedDay.online.map((s: { source_id?: number; id?: number; time_in?: string | null; time_out?: string | null }) => (
                            <div key={s.source_id ?? s.id}>
                              {toDate(s.time_in)?.toLocaleTimeString() ?? "—"} →{" "}
                              {s.time_out ? toDate(s.time_out)?.toLocaleTimeString() : "MISSING"}
                            </div>
                          ))
                        ) : (
                          <div>—</div>
                        )}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-sky-50/60 p-5">
                      <p className="text-sky-700 text-xs uppercase tracking-[0.16em] font-bold">
                        Biometrics sessions
                      </p>
                      <div className="mt-2 space-y-1 text-slate-800 font-mono text-sm">
                        {(selectedDay.biometrics || []).length > 0 ? (
                          selectedDay.biometrics.map((s: { source_id?: number; id?: number; time_in?: string | null; time_out?: string | null }) => (
                            <div key={s.source_id ?? s.id}>
                              {toDate(s.time_in)?.toLocaleTimeString() ?? "—"} →{" "}
                              {s.time_out ? toDate(s.time_out)?.toLocaleTimeString() : "MISSING"}
                            </div>
                          ))
                        ) : (
                          <div>—</div>
                        )}
                      </div>
                    </div>
                    {selectedDay.reconciliation && (
                      <div className="sm:col-span-2">
                        <span
                          className={`px-4 py-2 rounded-full text-xs font-bold ${
                            selectedDay.reconciliation.state === "MATCHED"
                              ? "bg-emerald-100 text-emerald-700"
                              : selectedDay.reconciliation.state === "MISSING_TIMEOUT"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {selectedDay.reconciliation.state}
                        </span>
                      </div>
                    )}
                  </div>
                )}

              </>

            ) : (

              <div className="text-center py-10">

                <p className="text-slate-400 text-lg">
                  Select a date to view attendance details
                </p>

              </div>

            )}

          </motion.div>

        </div>

      </div>

    </div>
  );
}