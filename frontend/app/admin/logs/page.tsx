"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* HEADER */}
      <div className="bg-gradient-to-r from-green-900 via-green-800 to-green-700 pt-12 pb-32 px-6 shadow-xl">

        <div className="max-w-7xl mx-auto">

          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-lg">

            <h1 className="text-4xl font-black text-white drop-shadow-md tracking-tight">
              Attendance Logs
            </h1>

            <p className="text-green-50/90 mt-1 text-sm font-medium">
              View all employee attendance records
            </p>

          </div>

        </div>
      </div>

      {/* CONTENT */}
        <div className="max-w-7xl mx-auto px-6 -mt-24 pb-16">

          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border">

            <div className="overflow-x-auto">

              <table className="w-full text-left text-gray-800">

                <thead className="bg-green-100/80 text-green-950 font-semibold">
                  <tr>
                    <th className="p-4">Employee ID</th>
                    <th>Time In</th>
                    <th>Time Out</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="p-6 text-center text-gray-700 font-medium"
                      >
                        Loading...
                      </td>
                    </tr>
                  ) : logs.length > 0 ? (
                    logs.map((log, i) => (
                      <tr
                        key={i}
                        className="border-t hover:bg-green-50/50 transition"
                      >
                        <td className="p-4 font-semibold text-gray-900">
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
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={3}
                        className="text-center p-6 text-gray-600 font-medium"
                      >
                        No logs found
                      </td>
                    </tr>
                  )}
                </tbody>

              </table>

            </div>

          </div>
      </div>
    </div>
  );
}