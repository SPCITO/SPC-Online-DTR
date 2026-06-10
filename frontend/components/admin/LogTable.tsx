"use client";

import { Clock3 } from "lucide-react";

interface AttendanceLog {
  id?: string | number;
  employee_db_id?: string | number;
  name: string;
  time_in: string;
  time_out?: string | null;
  department_id?: number;
  role?: string;
}

interface LogTableProps {
  logs: AttendanceLog[];
  loading?: boolean;
  emptyMessage?: string;
  showDepartment?: boolean;
  getStatus?: (log: AttendanceLog) => string;
}

export default function LogTable({
  logs,
  loading = false,
  emptyMessage = "No attendance logs found",
  showDepartment = false,
  getStatus,
}: LogTableProps) {
  const defaultGetStatus = (log: AttendanceLog) => {
    if (!log.time_out) return "ACTIVE";

    const timeIn = new Date(log.time_in);
    const totalMinutes = timeIn.getHours() * 60 + timeIn.getMinutes();

    if (totalMinutes > 510) return "LATE";

    return "OFFLINE";
  };

  const statusFn = getStatus || defaultGetStatus;

  if (loading) {
    return (
      <div className="px-6 py-12 text-center text-gray-500 font-medium">
        Loading attendance logs...
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px]">
        <thead>
          <tr className="border-b border-gray-100">
            {showDepartment && (
              <th className="px-6 py-5 text-left text-xs uppercase tracking-[0.2em] text-gray-400 font-semibold">
                Department
              </th>
            )}
            <th className="px-6 py-5 text-left text-xs uppercase tracking-[0.2em] text-gray-400 font-semibold">
              Employee
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
          {logs.length > 0 ? (
            logs.map((log, i) => {
              const status = statusFn(log);
              const isActive = status === "ACTIVE";

              return (
                <tr
                  key={i}
                  className="border-b border-gray-100/80 hover:bg-green-50/40 transition-all"
                >
                  {showDepartment && (
                    <td className="px-6 py-5 text-sm text-gray-600">
                      {log.department_id || "—"}
                    </td>
                  )}
                  <td className="px-6 py-5">
                    <div className="font-bold text-gray-900">{log.name}</div>
                    {log.employee_db_id && (
                      <div className="text-xs text-gray-500 mt-1">
                        ID: {log.employee_db_id}
                      </div>
                    )}
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
                            : status === "LATE"
                            ? "bg-yellow-100 text-yellow-700"
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
                              : status === "LATE"
                              ? "bg-yellow-500"
                              : "bg-gray-400"
                          }
                        `}
                      />
                      {status.charAt(0) + status.slice(1).toLowerCase()}
                    </span>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td
                colSpan={showDepartment ? 5 : 4}
                className="px-6 py-12 text-center text-gray-400 font-medium"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
