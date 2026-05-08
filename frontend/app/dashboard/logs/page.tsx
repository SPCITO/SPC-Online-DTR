"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { motion } from "framer-motion";

export default function UserLogsPage() {
  const [user, setUser] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ Get user
  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
  }, []);

  // ✅ Fetch logs
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
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* 🟢 HEADER */}
      <div className="bg-gradient-to-r from-green-900 via-green-800 to-green-700 pt-12 pb-36 px-6 shadow-xl">

        <div className="max-w-5xl mx-auto">

          {/* GLASS HEADER */}
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-lg flex justify-between items-center">

            <div>
              <h1 className="text-3xl font-bold text-white">
                My Attendance Logs
              </h1>
              <p className="text-green-200 text-sm">
                {user.name} • {user.employee_id}
              </p>
            </div>

            {/* BACK BUTTON */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => (window.location.href = "/dashboard")}
              className="px-4 py-2 rounded-xl 
                         bg-white/10 hover:bg-white/20 
                         border border-white/20 text-white transition"
            >
              ← Dashboard
            </motion.button>

          </div>

        </div>
      </div>

      {/* 🧩 MAIN */}
      <div className="flex-1 flex justify-center px-6 -mt-24 pb-20">

        <div className="w-full max-w-5xl space-y-6">

          {/* TABLE CARD */}
          <div className="bg-white rounded-3xl shadow-xl p-6 hover:shadow-2xl transition">

            <h3 className="text-lg font-semibold text-gray-700 mb-4">
              Attendance History
            </h3>

            <div className="overflow-x-auto">

              <table className="w-full text-left">

                <thead>
                  <tr className="border-b text-gray-500 text-sm">
                    <th className="p-3">Date</th>
                    <th>Time In</th>
                    <th>Time Out</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-gray-500">
                        Loading...
                      </td>
                    </tr>
                  ) : logs.length > 0 ? (
                    logs.map((log, i) => {
                      const late =
                        new Date(log.time_in).getHours() > 8;

                      return (
                        <tr
                          key={i}
                          className="border-b hover:bg-gray-50 transition"
                        >
                          <td className="p-3 font-medium text-gray-700">
                            {new Date(log.time_in).toLocaleDateString()}
                          </td>

                          <td className="text-gray-600">
                            {new Date(log.time_in).toLocaleTimeString()}
                          </td>

                          <td className="text-gray-600">
                            {log.time_out
                              ? new Date(log.time_out).toLocaleTimeString()
                              : "—"}
                          </td>

                          <td>
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-semibold
                                ${
                                  late
                                    ? "bg-red-100 text-red-600"
                                    : "bg-green-100 text-green-600"
                                }`}
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
                        className="p-6 text-center text-gray-400"
                      >
                        No logs yet
                      </td>
                    </tr>
                  )}
                </tbody>

              </table>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}