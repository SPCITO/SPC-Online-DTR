"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  ClipboardList,
} from "lucide-react";

export default function UserLogsPage() {
  const [user, setUser] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // LOAD USER
  useEffect(() => {
    const loadUser = async () => {
      try {
        const data = await api.me();
        setUser(data);
      } catch {
        router.replace("/login");
      }
    };

    loadUser();
  }, [router]);

  // FETCH LOGS
  const fetchLogs = async () => {
    if (!user) return;

    try {
      const data = await api.getMyLogs(user.employee_id);
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Logs fetch error:", err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchLogs();

      const interval = setInterval(fetchLogs, 5000);

      return () => clearInterval(interval);
    }
  }, [user]);

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
                  {user.name} • {user.employee_id}
                </p>

              </div>

              {/* BACK BUTTON */}
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => (window.location.href = "/dashboard")}
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

            </div>

            <div className="overflow-x-auto">

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

                      const late =
                        new Date(log.time_in).getHours() > 8;

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
                            {new Date(log.time_in).toLocaleDateString()}
                          </td>

                          <td className="p-6 text-slate-600 font-medium">
                            {new Date(log.time_in).toLocaleTimeString()}
                          </td>

                          <td className="p-6 text-slate-600 font-medium">
                            {log.time_out
                              ? new Date(log.time_out).toLocaleTimeString()
                              : "—"}
                          </td>

                          <td className="p-6">

                            <span
                              className={`
                                px-4 py-2 rounded-full
                                text-xs font-bold

                                ${
                                  late
                                    ? "bg-red-100 text-red-600"
                                    : "bg-emerald-100 text-emerald-700"
                                }
                              `}
                            >
                              {late ? "Late" : "On Time"}
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

            </div>

          </motion.div>

        </div>

      </div>

    </div>
  );
}