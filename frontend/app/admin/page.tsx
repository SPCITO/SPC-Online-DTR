"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Activity,
  Users,
  Clock3,
  ArrowRight,
} from "lucide-react";

export default function AdminDashboard() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ 1. ROLE GUARD (CLIENT SIDE SAFETY ONLY)
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.replace("/login");
        return;
      }

      if (user.role !== "admin") {
        router.replace("/403");
        return;
      }
    }
  }, [user, authLoading, router]);

  // ✅ 2. FETCH DATA (NO TOKEN CHECK HERE)
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const data = await api.getLogs();
        setLogs(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to fetch logs:", err);
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [router]);

  const today = new Date().toDateString();

  const todayLogs = logs.filter(
    (l) => new Date(l.time_in).toDateString() === today
  );

  const activeUsers = todayLogs.filter((l) => !l.time_out);

  // ✅ 3. LOADING STATE (AUTH + DATA)
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading dashboard...
      </div>
    );
  }
    
  return (
    <div className="min-h-screen bg-[#f4f7f5] overflow-x-hidden">

      {/* BACKGROUND */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-120px] left-[-120px] w-[320px] h-[320px] bg-emerald-200/40 blur-3xl rounded-full" />
        <div className="absolute bottom-[-120px] right-[-120px] w-[320px] h-[320px] bg-green-200/40 blur-3xl rounded-full" />
      </div>

      <div className="relative px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        <div className="max-w-7xl mx-auto">

          {/* HEADER */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="
              relative overflow-hidden

              rounded-[38px]

              bg-white/85
              backdrop-blur-2xl

              border border-white/80

              shadow-[0_20px_60px_rgba(0,0,0,0.08)]

              p-6 sm:p-8 lg:p-10
            "
          >

            {/* HEADER GLOW */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/80 via-white to-green-50/80" />

            <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">

              {/* LEFT */}
              <div>

                <div
                  className="
                    inline-flex items-center gap-2

                    px-4 py-2

                    rounded-full

                    bg-emerald-100/80

                    border border-emerald-200

                    text-emerald-800
                    text-xs
                    font-bold
                    tracking-[0.24em]
                    uppercase

                    mb-5
                  "
                >
                  <ShieldCheck size={14} />
                  Admin Control Center
                </div>

                <h1
                  className="
                    text-[34px]
                    sm:text-5xl

                    font-black

                    text-gray-900

                    tracking-[-0.05em]
                    leading-tight
                  "
                >
                  Admin Dashboard
                </h1>

                <p className="mt-3 text-gray-500 text-base sm:text-lg max-w-2xl">
                  Monitor attendance activity, employee status,
                  and real-time workforce analytics.
                </p>

              </div>

              {/* RIGHT PANEL */}
              <div
                className="
                  rounded-[30px]

                  bg-white/95
                  backdrop-blur-2xl

                  border border-white

                  p-6

                  min-w-[280px]

                  shadow-[0_12px_40px_rgba(0,0,0,0.08)]
                "
              >

                <div className="flex items-center gap-2 text-gray-500 uppercase tracking-[0.22em] text-xs font-bold mb-5">
                  <Activity size={14} className="text-green-600" />
                  System Overview
                </div>

                <div className="space-y-5">

                  {/* ACTIVE EMPLOYEES */}
                  <div
                    className="
                      rounded-2xl

                      bg-gray-50/80

                      border border-gray-100

                      p-4
                    "
                  >

                    <div className="flex items-center justify-between">

                      <div>

                        <p className="text-gray-500 text-sm font-medium">
                          Active Employees
                        </p>

                        <h2 className="mt-2 text-4xl font-black text-gray-900 tracking-tight">
                          {activeUsers.length}
                        </h2>

                      </div>

                      <div className="relative flex items-center justify-center">

                        <div className="absolute w-12 h-12 rounded-full bg-green-400/20 animate-ping" />

                        <div className="relative w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center">
                          <Users
                            size={22}
                            className="text-green-700"
                          />
                        </div>

                      </div>

                    </div>

                  </div>

                  {/* TODAY LOGS */}
                  <div
                    className="
                      rounded-2xl

                      bg-gray-50/80

                      border border-gray-100

                      p-4
                    "
                  >

                    <div className="flex items-center justify-between">

                      <div>

                        <p className="text-gray-500 text-sm font-medium">
                          Today's Logs
                        </p>

                        <h2 className="mt-2 text-4xl font-black text-gray-900 tracking-tight">
                          {todayLogs.length}
                        </h2>

                      </div>

                      <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
                        <Activity
                          size={22}
                          className="text-emerald-700"
                        />
                      </div>

                    </div>

                  </div>

                  {/* SYSTEM STATUS */}
                  <div
                    className="
                      rounded-2xl

                      bg-gradient-to-r
                      from-green-50
                      to-emerald-50

                      border border-green-100

                      p-4
                    "
                  >

                    <p className="text-xs uppercase tracking-[0.2em] text-green-700 font-bold mb-2">
                      System Status
                    </p>

                    <p className="text-sm text-gray-600 leading-relaxed">
                      Attendance tracking and employee monitoring
                      services are operating normally.
                    </p>

                  </div>

                </div>

              </div>

            </div>

          </motion.div>

          {/* STATS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">

            {/* TOTAL LOGS */}
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ duration: 0.25 }}
              className="
                relative overflow-hidden

                rounded-[32px]

                bg-white/90
                backdrop-blur-xl

                border border-white

                shadow-[0_14px_50px_rgba(0,0,0,0.06)]

                p-6 sm:p-7
              "
            >

              <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-100/40 blur-3xl rounded-full" />

              <div className="relative">

                <div
                  className="
                    w-14 h-14

                    rounded-2xl

                    bg-emerald-100

                    flex items-center justify-center

                    mb-5
                  "
                >
                  <Clock3
                    size={26}
                    className="text-emerald-700"
                  />
                </div>

                <p className="text-sm uppercase tracking-[0.2em] text-gray-400 font-semibold">
                  Total Logs
                </p>

                <h2 className="mt-3 text-5xl font-black text-gray-900 tracking-tight">
                  {logs.length}
                </h2>

              </div>

            </motion.div>

            {/* TODAY LOGS */}
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ duration: 0.25 }}
              className="
                relative overflow-hidden

                rounded-[32px]

                bg-white/90
                backdrop-blur-xl

                border border-white

                shadow-[0_14px_50px_rgba(0,0,0,0.06)]

                p-6 sm:p-7
              "
            >

              <div className="absolute top-0 right-0 w-40 h-40 bg-blue-100/40 blur-3xl rounded-full" />

              <div className="relative">

                <div
                  className="
                    w-14 h-14

                    rounded-2xl

                    bg-blue-100

                    flex items-center justify-center

                    mb-5
                  "
                >
                  <Activity
                    size={26}
                    className="text-blue-700"
                  />
                </div>

                <p className="text-sm uppercase tracking-[0.2em] text-gray-400 font-semibold">
                  Today's Logs
                </p>

                <h2 className="mt-3 text-5xl font-black text-gray-900 tracking-tight">
                  {todayLogs.length}
                </h2>

              </div>

            </motion.div>

            {/* ACTIVE USERS */}
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ duration: 0.25 }}
              className="
                relative overflow-hidden

                rounded-[32px]

                bg-white/95
                backdrop-blur-2xl

                border border-white

                shadow-[0_12px_40px_rgba(0,0,0,0.08)]

                p-6 sm:p-7
              "
            >

              {/* SOFT GLOW */}
              <div className="absolute top-[-40px] right-[-40px] w-40 h-40 bg-green-100/60 rounded-full blur-3xl" />

              <div className="relative">

                <div
                  className="
                    relative

                    w-14 h-14

                    rounded-2xl

                    bg-green-100

                    flex items-center justify-center

                    mb-5
                  "
                >

                  <div className="absolute w-14 h-14 rounded-full bg-green-400/20 animate-ping" />

                  <Users
                    size={26}
                    className="relative text-green-700"
                  />

                </div>

                <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-semibold">
                  Currently Active
                </p>

                <h2 className="mt-3 text-5xl font-black text-gray-900 tracking-tight">
                  {activeUsers.length}
                </h2>

                <p className="mt-3 text-sm text-gray-500">
                  Employees currently timed in
                </p>

              </div>

            </motion.div>

          </div>

          {/* TABLE */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="
              mt-8

              bg-white/90
              backdrop-blur-xl

              rounded-[36px]

              border border-white

              shadow-[0_14px_50px_rgba(0,0,0,0.06)]

              overflow-hidden
            "
          >

            {/* TOP */}
            <div
              className="
                flex flex-col sm:flex-row
                sm:items-center
                justify-between

                gap-4

                px-6 sm:px-8
                py-6

                border-b border-gray-100
              "
            >

              <div>

                <p className="text-xs uppercase tracking-[0.22em] text-gray-400 mb-2">
                  Attendance Monitoring
                </p>

                <h2 className="text-2xl sm:text-3xl font-black text-gray-900">
                  Recent Attendance Activity
                </h2>

              </div>

              <div
                className="
                  flex items-center gap-2

                  text-emerald-700
                  font-semibold
                "
              >
                View Full Logs
                <ArrowRight size={18} />
              </div>

            </div>

            {/* TABLE */}
            <div className="overflow-x-auto">

              <table className="w-full min-w-[760px]">

                <thead>

                  <tr className="border-b border-gray-100">

                    <th className="px-8 py-5 text-left text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">
                      Employee ID
                    </th>

                    <th className="px-6 py-5 text-left text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">
                      Time In
                    </th>

                    <th className="px-6 py-5 text-left text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">
                      Time Out
                    </th>

                    <th className="px-6 py-5 text-left text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">
                      Status
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {logs.slice(0, 10).map((log, i) => (

                    <tr
                      key={i}
                      className="
                        border-b border-gray-100/80

                        hover:bg-emerald-50/40

                        transition-all duration-300
                      "
                    >

                      <td className="px-8 py-5">

                        <div
                          className="
                            inline-flex items-center

                            px-4 py-2

                            rounded-2xl

                            bg-gray-100

                            text-gray-900
                            font-bold
                          "
                        >
                          {log.id}
                        </div>

                      </td>

                      <td className="px-6 py-5 text-gray-700 font-medium">
                        {new Date(log.time_in).toLocaleString()}
                      </td>

                      <td className="px-6 py-5 text-gray-700 font-medium">
                        {log.time_out
                          ? new Date(log.time_out).toLocaleString()
                          : "—"}
                      </td>

                      <td className="px-6 py-5">

                        {log.time_out ? (

                          <span
                            className="
                              inline-flex items-center

                              px-4 py-2

                              rounded-full

                              bg-gray-100

                              text-gray-700
                              text-sm
                              font-bold
                            "
                          >
                            Offline
                          </span>

                        ) : (

                          <span
                            className="
                              inline-flex items-center gap-2

                              px-4 py-2

                              rounded-full

                              bg-emerald-100

                              text-emerald-700
                              text-sm
                              font-bold
                            "
                          >
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Active
                          </span>

                        )}

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          </motion.div>

        </div>

      </div>

    </div>
  );
}