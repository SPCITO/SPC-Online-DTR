"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { motion } from "framer-motion";

export default function AdminDashboard() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    api.getLogs().then((data) => {
      setLogs(Array.isArray(data) ? data : []);
    });
  }, []);

  const today = new Date().toDateString();

  const todayLogs = logs.filter(
    (l) => new Date(l.time_in).toDateString() === today
  );

  const activeUsers = todayLogs.filter((l) => !l.time_out);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* HEADER */}
      <div className="bg-gradient-to-r from-green-900 via-green-800 to-green-700 pt-12 pb-32 px-6 shadow-xl">

        <div className="max-w-7xl mx-auto">

          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-lg">

            <h1 className="text-4xl font-black text-white drop-shadow-md tracking-tight">
              Admin Dashboard
            </h1>

            <p className="text-green-50/90 mt-1 text-sm font-medium">
              Monitor employee attendance and activity
            </p>

          </div>

        </div>
      </div>

      {/* FLOATING CONTENT */}
      <div className="max-w-7xl mx-auto px-6 -mt-24 pb-16">

        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">

          <motion.div
            whileHover={{ y: -5 }}
            className="bg-white rounded-3xl shadow-xl p-6 border"
          >
            <p className="text-green-800 font-semibold">
              Total Logs
            </p>

            <h2 className="text-4xl font-black text-green-950 tracking-tight mt-2">
              {logs.length}
            </h2>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            className="bg-white rounded-3xl shadow-xl p-6 border"
          >
            <p className="text-green-800 font-semibold">
              Today's Logs
            </p>

            <h2 className="text-4xl font-black text-green-950 tracking-tight mt-2">
              {todayLogs.length}
            </h2>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            className="bg-white rounded-3xl shadow-xl p-6 border"
          >
            <p className="text-green-800 font-semibold">
              Currently Active
            </p>

            <h2 className="text-4xl font-black text-green-950 tracking-tight mt-2">
              {activeUsers.length}
            </h2>
          </motion.div>

        </div>

       {/* RECENT ACTIVITY */}
        <div className="bg-white rounded-3xl shadow-xl border overflow-hidden">

          <div className="p-6 border-b bg-gray-50">
            <h2 className="text-xl font-bold text-green-800">
              Recent Attendance Activity
            </h2>
          </div>

          <div className="overflow-x-auto">

            <table className="w-full text-left text-gray-800">

              <thead className="bg-green-50 text-green-900">
                <tr>
                  <th className="p-4 font-semibold">Employee ID</th>
                  <th className="font-semibold">Time In</th>
                  <th className="font-semibold">Time Out</th>
                  <th className="font-semibold">Status</th>
                </tr>
              </thead>

              <tbody>
                {logs.slice(0, 10).map((log, i) => (
                  <tr
                    key={i}
                    className="border-t hover:bg-green-50/50 transition"
                  >
                    <td className="p-4 font-medium text-gray-900">
                      {log.employee_id}
                    </td>

                    <td className="text-gray-800 font-medium">
                      {new Date(log.time_in).toLocaleString()}
                    </td>

                    <td className="text-gray-800 font-medium">
                      {log.time_out
                        ? new Date(log.time_out).toLocaleString()
                        : "—"}
                    </td>

                    <td>
                      {log.time_out ? (
                        <span className="text-gray-700 font-semibold">
                          Offline
                        </span>
                      ) : (
                        <span className="text-green-700 font-bold">
                          Active
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>

            </table>

          </div>
        </div>

      </div>
    </div>
  );
}