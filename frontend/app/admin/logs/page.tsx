"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Clock3,
  CalendarDays,
  Activity,
  Search,
} from "lucide-react";

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchLogs = async () => {
    try {
      const data = await api.getLogs();
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();

    const interval = setInterval(fetchLogs, 5000);

    return () => clearInterval(interval);
  }, []);

  const filteredLogs = logs.filter((log) =>
    log.name
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const activeLogs = logs.filter((log) => !log.time_out);

  return (
    <div className="min-h-screen bg-[#f4f7f5] overflow-x-hidden">

      {/* BACKGROUND GLOW */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-140px] left-[-120px] w-[320px] h-[320px] rounded-full bg-green-200/30 blur-3xl" />
        <div className="absolute bottom-[-140px] right-[-120px] w-[320px] h-[320px] rounded-full bg-emerald-200/30 blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* TOP HEADER */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="
            bg-white/90
            backdrop-blur-2xl
            border border-white
            rounded-[34px]
            shadow-[0_12px_40px_rgba(0,0,0,0.08)]
            p-5 sm:p-7
          "
        >

          <div className="flex flex-col lg:flex-row gap-6 lg:items-center lg:justify-between">

            {/* LEFT */}
            <div>

              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-green-100 flex items-center justify-center">
                  <Clock3 className="text-green-700" size={18} />
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-gray-400">
                    Admin Panel
                  </p>

                  <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
                    Attendance Logs
                  </h1>
                </div>

              </div>

              <p className="text-gray-500 text-sm sm:text-base">
                Monitor and review employee attendance records in real time.
              </p>

            </div>

            {/* RIGHT */}
            <div className="flex flex-col sm:flex-row gap-4">

              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => (window.location.href = "/admin")}
                className="
                  flex items-center justify-center gap-2

                  px-5 py-3

                  rounded-2xl

                  bg-white
                  border border-gray-200

                  text-gray-700
                  font-semibold

                  hover:shadow-lg
                  transition-all
                "
              >
                <ArrowLeft size={18} />
                Dashboard
              </motion.button>

            </div>

          </div>

        </motion.div>

        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">

          <motion.div
            whileHover={{ y: -4 }}
            className="
              bg-white/95
              rounded-[30px]
              border border-white
              shadow-[0_10px_40px_rgba(0,0,0,0.06)]
              p-6
            "
          >

            <div className="flex items-center justify-between">

              <div>
                <p className="text-sm text-gray-500 font-medium">
                  Total Records
                </p>

                <h2 className="text-4xl font-black text-gray-900 mt-2">
                  {logs.length}
                </h2>
              </div>

              <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center">
                <CalendarDays className="text-green-700" size={24} />
              </div>

            </div>

          </motion.div>

          <motion.div
            whileHover={{ y: -4 }}
            className="
              bg-white/95
              rounded-[30px]
              border border-white
              shadow-[0_10px_40px_rgba(0,0,0,0.06)]
              p-6
            "
          >

            <div className="flex items-center justify-between">

              <div>
                <p className="text-sm text-gray-500 font-medium">
                  Active Employees
                </p>

                <h2 className="text-4xl font-black text-green-700 mt-2">
                  {activeLogs.length}
                </h2>
              </div>

              <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <Activity className="text-emerald-700" size={24} />
              </div>

            </div>

          </motion.div>

          <motion.div
            whileHover={{ y: -4 }}
            className="
              bg-gradient-to-br
              from-green-600
              to-emerald-600

              rounded-[30px]

              shadow-[0_15px_40px_rgba(34,197,94,0.28)]

              p-6

              text-white
            "
          >

            <p className="text-sm text-white/80 font-medium">
              System Status
            </p>

            <h2 className="text-3xl font-black mt-2">
              Operational
            </h2>

            <p className="mt-3 text-sm text-white/80 leading-relaxed">
              Attendance tracking and monitoring services are active.
            </p>

          </motion.div>

        </div>

        {/* TABLE SECTION */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="
            mt-8

            bg-white/95
            backdrop-blur-2xl

            rounded-[34px]

            border border-white

            shadow-[0_12px_50px_rgba(0,0,0,0.08)]

            overflow-hidden
          "
        >

          {/* TABLE HEADER */}
          <div
            className="
              flex flex-col lg:flex-row
              gap-5
              lg:items-center
              lg:justify-between

              p-6 sm:p-7

              border-b border-gray-100
            "
          >

            <div>

              <p className="text-xs uppercase tracking-[0.22em] text-gray-400 mb-2">
                Attendance Records
              </p>

              <h2 className="text-2xl font-black text-gray-900">
                Employee Logs
              </h2>

            </div>

            {/* SEARCH */}
            <div
              className="
                flex items-center gap-3

                bg-gray-100/80

                px-4 py-3

                rounded-2xl

                border border-gray-200

                w-full lg:w-[320px]
              "
            >
              <Search size={18} className="text-gray-500" />

              <input
                type="text"
                placeholder="Search employee ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="
                  bg-transparent
                  outline-none
                  text-sm
                  text-gray-700
                  placeholder:text-gray-400
                  w-full
                "
              />
            </div>

          </div>

          {/* TABLE */}
          <div className="overflow-x-auto">

            <table className="w-full min-w-[760px]">

              <thead>
                <tr className="border-b border-gray-100">

                  <th className="px-6 py-5 text-left text-xs uppercase tracking-[0.2em] text-gray-400 font-semibold">
                    Employee ID
                  </th>

                  <th className="px-6 py-5 text-left text-xs uppercase tracking-[0.2em] text-gray-400 font-semibold">
                    Time In
                  </th>

                  <th className="px-6 py-5 text-left text-xs uppercase tracking-[0.2em] text-gray-400 font-semibold">
                    Time Out
                  </th>

                  <th className="px-6 py-5 text-left text-xs uppercase tracking-[0.2em] text-gray-400 font-semibold">
                    Status
                  </th>

                </tr>
              </thead>

              <tbody>

                {loading ? (

                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-12 text-center text-gray-500 font-medium"
                    >
                      Loading attendance logs...
                    </td>
                  </tr>

                ) : filteredLogs.length > 0 ? (

                  filteredLogs.map((log, i) => {

                    const isActive = !log.time_out;

                    return (
                      <tr
                        key={i}
                        className="
                          border-b border-gray-100/80
                          hover:bg-green-50/40
                          transition-all
                        "
                      >

                        <td className="px-6 py-5">
                          <div className="font-bold text-gray-900">
                            {log.name}
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

                          <span
                            className={`
                              inline-flex items-center gap-2

                              px-4 py-2

                              rounded-full

                              text-xs font-bold uppercase tracking-[0.12em]

                              ${
                                isActive
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-100 text-gray-600"
                              }
                            `}
                          >

                            <span
                              className={`
                                w-2 h-2 rounded-full

                                ${
                                  isActive
                                    ? "bg-green-500 animate-pulse"
                                    : "bg-gray-400"
                                }
                              `}
                            />

                            {isActive ? "Active" : "Offline"}

                          </span>

                        </td>

                      </tr>
                    );
                  })

                ) : (

                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-12 text-center text-gray-400 font-medium"
                    >
                      No attendance logs found
                    </td>
                  </tr>

                )}

              </tbody>

            </table>

          </div>

        </motion.div>

      </div>

    </div>
  );
}