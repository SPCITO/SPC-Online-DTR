"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import LogSourceSelector from "@/components/LogSourceSelector";
import type { SourceMode, SummaryGroup } from "@/lib/types";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  ClipboardList,
} from "lucide-react";

export default function UserLogsPage() {
  return (
    <ProtectedRoute>
      <UserLogsContent />
    </ProtectedRoute>
  );
}

function UserLogsContent() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<SourceMode>("online");
  const [groups, setGroups] = useState<SummaryGroup[]>([]);
  const router = useRouter();

  // M.69: timestamps arrive either as ISO strings (Online DTR) or Manila
  // wall strings (Biometrics) — parse both safely for display.
  const toDate = (v: string | Date | null | undefined): Date | null => {
    if (!v) return null;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) {
      return new Date(v.replace(" ", "T") + "+08:00");
    }
    return new Date(v);
  };
  const sessionLines = (sessions: Array<{ time_in?: string | null; time_out?: string | null }>) =>
    sessions && sessions.length > 0
      ? sessions.map((s) => {
          const start = s.time_in ? String(s.time_in).slice(11, 19) : "—";
          const end = s.time_out ? String(s.time_out).slice(11, 19) : "MISSING";
          return `${start} → ${end}`;
        })
      : ["—"];

  // FETCH LOGS (M.69: source-aware; default Online DTR unchanged)
  // M.70: request sequencing prevents a slower previous-source response
  // from repainting stale attendance data.
  const requestSeq = useRef(0);
  const fetchLogs = async () => {
    if (!user) return;

    const seq = ++requestSeq.current;
    try {
      if (source === "both") {
        const data = await api.getAttendanceSummary({
          employee_db_id: user.employee_db_id,
          limit: 100,
        });
        if (seq !== requestSeq.current) return;
        setGroups(data?.groups || []);
        setLogs([]);
        return;
      }
      const data = await api.getMyLogs(
        user.employee_db_id,
        source === "biometrics" ? { source: "biometrics", limit: 100 } : undefined
      );
      if (seq !== requestSeq.current) return;
      // Backend now returns paginated response: { logs, total, page, limit, totalPages }
      const logList = Array.isArray(data) ? data : (data?.logs || []);
      setLogs(logList);
      setGroups([]);
    } catch (err) {
      console.error("Logs fetch error:", err);
      if (seq !== requestSeq.current) return;
      setLogs([]);
      setGroups([]);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchLogs();

      const interval = setInterval(fetchLogs, 30000);

      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, source]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#f4f7f5] overflow-x-hidden">

      {/* BACKGROUND */}
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

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">

              <div>

                <p className="text-xs tracking-[0.28em] uppercase text-emerald-600 font-semibold mb-3">
                  Attendance Records
                </p>

                <h1 className="text-3xl sm:text-5xl font-black text-slate-900 leading-tight">
                  My Attendance Logs
                </h1>

                <p className="text-slate-500 mt-3 text-sm sm:text-base">
                  {user.name} • {user.employee_db_id}
                </p>

              </div>

              {/* BACK BUTTON */}
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

          {/* STATS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

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
                <ClipboardList size={16} />
                Total Logs
              </div>

              <h2 className="text-4xl font-black mt-4">
                {logs.length}
              </h2>

            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
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
                <CalendarDays size={16} />
                Latest Date
              </div>

              <h2 className="text-2xl font-black mt-4 text-slate-900">
                {logs[0]
                  ? new Date(logs[0].time_in).toLocaleDateString()
                  : "—"}
              </h2>

            </motion.div>

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
                <Clock3 size={16} />
                Status Tracking
              </div>

              <h2 className="text-2xl font-black mt-4 text-emerald-700">
                Real-Time
              </h2>

            </motion.div>

          </div>

          {/* TABLE */}
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

              overflow-hidden
            "
          >

            <div className="p-6 sm:p-8 border-b border-slate-100">

              <p className="text-xs uppercase tracking-[0.24em] text-slate-400 mb-2">
                Attendance History
              </p>

              <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
                Employee Log Records
              </h2>

              <div className="mt-4">
                <LogSourceSelector value={source} onChange={setSource} />
              </div>

            </div>

            <div className="overflow-x-auto">

              {source === "both" ? (

              <table className="w-full min-w-[700px]">

                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left p-6 text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">Date</th>
                    <th className="text-left p-6 text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">Online DTR</th>
                    <th className="text-left p-6 text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">Biometrics</th>
                    <th className="text-left p-6 text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">Status</th>
                  </tr>
                </thead>

                <tbody>

                  {loading ? (

                    <tr>
                      <td colSpan={4} className="p-10 text-center text-slate-400">
                        Loading attendance logs...
                      </td>
                    </tr>

                  ) : groups.length > 0 ? (

                    groups.map((g) => (
                      <tr
                        key={`${g.employee_db_id}|${g.date}`}
                        className="border-b border-slate-100/80 hover:bg-slate-50/80 transition-all duration-300"
                      >
                        <td className="p-6 font-semibold text-slate-800">{g.date}</td>
                        <td className="p-6 text-slate-600 font-mono text-xs leading-6">
                          {sessionLines(g.online).map((line, i) => (<div key={i}>{line}</div>))}
                        </td>
                        <td className="p-6 text-slate-600 font-mono text-xs leading-6">
                          {sessionLines(g.biometrics).map((line, i) => (<div key={i}>{line}</div>))}
                        </td>
                        <td className="p-6">
                          <span
                            className={`px-4 py-2 rounded-full text-xs font-bold ${
                              g.reconciliation.state === "MATCHED"
                                ? "bg-emerald-100 text-emerald-700"
                                : g.reconciliation.state === "MISSING_TIMEOUT"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {g.reconciliation.state}
                          </span>
                        </td>
                      </tr>
                    ))

                  ) : (

                    <tr>
                      <td colSpan={4} className="p-10 text-center text-slate-400">
                        No attendance logs yet
                      </td>
                    </tr>

                  )}

                </tbody>

              </table>

              ) : (

              <table className="w-full min-w-[700px]">

                <thead>
                  <tr className="border-b border-slate-100">

                    <th className="text-left p-6 text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">
                      Date
                    </th>

                    <th className="text-left p-6 text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">
                      Time In
                    </th>

                    <th className="text-left p-6 text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">
                      Time Out
                    </th>

                    <th className="text-left p-6 text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">
                      Status
                    </th>

                  </tr>
                </thead>

                <tbody>

                  {loading ? (

                    <tr>
                      <td
                        colSpan={4}
                        className="p-10 text-center text-slate-400"
                      >
                        Loading attendance logs...
                      </td>
                    </tr>

                  ) : logs.length > 0 ? (

                    logs.map((log, i) => {

                      const state = log.no_time_out
                        ? "No Time Out"
                        : log.time_out
                        ? "Completed"
                        : "Active";

                      return (

                        <tr
                          key={i}
                          className="
                            border-b border-slate-100/80

                            hover:bg-slate-50/80

                            transition-all duration-300
                          "
                        >

                          <td className="p-6 font-semibold text-slate-800">
                            {toDate(log.time_in)?.toLocaleDateString() ?? log.date ?? "—"}
                          </td>

                          <td className="p-6 text-slate-600 font-medium">
                            {toDate(log.time_in)?.toLocaleTimeString() ?? "—"}
                          </td>

                          <td className="p-6 text-slate-600 font-medium">
                            {log.time_out
                              ? toDate(log.time_out)?.toLocaleTimeString()
                              : "—"}
                          </td>

                          <td className="p-6">

                            <span
                              className={`
                                px-4 py-2 rounded-full
                                text-xs font-bold

                                ${
                                  state === "Active"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : state === "No Time Out"
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-slate-100 text-slate-600"
                                }
                              `}
                            >
                              {state}
                            </span>

                          </td>

                        </tr>

                      );
                    })

                  ) : (

                    <tr>
                      <td
                        colSpan={4}
                        className="p-10 text-center text-slate-400"
                      >
                        No attendance logs yet
                      </td>
                    </tr>

                  )}

                </tbody>

              </table>

              )}

            </div>

          </motion.div>

        </div>

      </div>

    </div>
  );
}