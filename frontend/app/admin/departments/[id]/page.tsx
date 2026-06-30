"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";

import {
  ArrowLeft,
  Users,
  Activity,
  TriangleAlert,
  Clock3,
} from "lucide-react";

const DEPARTMENT_NAMES: Record<number, string> = {
  1: "Basic Ed",
  2: "Collegiate",
  3: "Administrative/Personnel",
  4: "Student Assistant",
};

type TabType =
  | "today"
  | "week"
  | "month"
  | "analytics";

export default function DepartmentPage() {
  const params = useParams();
  const router = useRouter();

  const deptId = Number(params.id);

  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] =
    useState<TabType>("today");

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const data =
          await api.getDepartmentLogsByDepartment(
            deptId
          );

        setLogs(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (deptId) {
      fetchLogs();
    }
  }, [deptId]);

  const getStatus = (log: any) => {
    if (!log.time_out) {
      return "ACTIVE";
    }

    const timeIn = new Date(log.time_in);

    const totalMinutes =
      timeIn.getHours() * 60 +
      timeIn.getMinutes();

    if (totalMinutes > 510) {
      return "LATE";
    }

    return "OFFLINE";
  };

  const filteredLogs = useMemo(() => {
    const now = new Date();

    return logs.filter((log) => {
      const timeIn = new Date(log.time_in);

      if (tab === "today") {
        return (
          timeIn.toDateString() ===
          now.toDateString()
        );
      }

      if (tab === "week") {
        const diff =
          now.getTime() - timeIn.getTime();

        return (
          diff <=
          7 * 24 * 60 * 60 * 1000
        );
      }

      if (tab === "month") {
        return (
          timeIn.getMonth() ===
            now.getMonth() &&
          timeIn.getFullYear() ===
            now.getFullYear()
        );
      }

      return true;
    });
  }, [logs, tab]);

  const activeCount =
    filteredLogs.filter(
      (l) => !l.time_out
    ).length;

  const lateCount =
    filteredLogs.filter(
      (l) =>
        getStatus(l) === "LATE"
    ).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f7f5] flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7f5] p-6">

      <div className="max-w-7xl mx-auto">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-8">

          <div>

            <button
              onClick={() =>
                router.push("/admin/departments")
              }
              className="
                mb-4

                flex items-center gap-2

                text-gray-500

                hover:text-gray-900

                transition
              "
            >
              <ArrowLeft size={16} />
              Back
            </button>

            <h1 className="text-5xl font-black text-gray-900">
              {DEPARTMENT_NAMES[deptId]}
            </h1>

            <p className="text-gray-500 mt-2">
              Department monitoring dashboard
            </p>

          </div>

        </div>

        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">

          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">

              <div>
                <p className="text-gray-400 text-sm">
                  Total Records
                </p>

                <h2 className="text-4xl font-black text-gray-900 mt-2">
                  {filteredLogs.length}
                </h2>
              </div>

              <Users className="text-emerald-600" />
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">

              <div>
                <p className="text-gray-400 text-sm">
                  Active Employees
                </p>

                <h2 className="text-4xl font-black text-gray-900 mt-2">
                  {activeCount}
                </h2>
              </div>

              <Activity className="text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">

              <div>
                <p className="text-gray-400 text-sm">
                  Late Employees
                </p>

                <h2 className="text-4xl font-black text-gray-900 mt-2">
                  {lateCount}
                </h2>
              </div>

              <TriangleAlert className="text-yellow-600" />
            </div>
          </div>

        </div>

        {/* TABS */}
        <div className="flex gap-3 flex-wrap mb-6">

          {(
            [
              "today",
              "week",
              "month",
              "analytics",
            ] as TabType[]
          ).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`
                px-5 py-3 rounded-2xl font-semibold transition
                ${
                  tab === t
                    ? "bg-emerald-500 text-white"
                    : "bg-white border border-gray-200 text-gray-600"
                }
              `}
            >
              {t.toUpperCase()}
            </button>
          ))}

        </div>

        {/* ANALYTICS */}
        {tab === "analytics" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
              <h2 className="text-xl font-black text-gray-900 mb-4">
                Attendance Overview
              </h2>

              <div className="space-y-4">

                <div className="flex justify-between">
                  <span className="text-black">Total Logs</span>
                  <span className="font-bold text-black">
                    {logs.length}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-black">Late Employees</span>
                  <span className="font-bold text-yellow-600">
                    {lateCount}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-black">Currently Active</span>
                  <span className="font-bold text-emerald-600">
                    {activeCount}
                  </span>
                </div>

              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
              <h2 className="text-xl font-black text-gray-900 mb-4">
                Department Insights
              </h2>

              <div className="space-y-4">

                <div className="flex justify-between">
                  <span className="text-black">On-Time Rate</span>

                  <span className="font-bold text-emerald-600">
                    {logs.length
                      ? Math.round(
                          ((logs.length -
                            lateCount) /
                            logs.length) *
                            100
                        )
                      : 0}
                    %
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-black">Late Rate</span>

                  <span className="font-bold text-yellow-600">
                    {logs.length
                      ? Math.round(
                          (lateCount /
                            logs.length) *
                            100
                        )
                      : 0}
                    %
                  </span>
                </div>

              </div>
            </div>

          </div>
        ) : (
          <div
            className="
              bg-white/90
              backdrop-blur-xl

              rounded-[36px]

              border border-white

              shadow-[0_14px_50px_rgba(0,0,0,0.06)]

              overflow-hidden
            "
          >

            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">

              <div className="flex items-center gap-2 text-gray-700 font-semibold">
                <Clock3 size={18} />
                Employee Logs
              </div>

              <div className="text-sm text-gray-400">
                {filteredLogs.length} records
              </div>

            </div>

            <div className="overflow-x-auto">

              <table className="w-full min-w-[900px]">

                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.2em] text-gray-400 border-b">
                    <th className="p-5">Employee</th>
                    <th className="p-5">Time In</th>
                    <th className="p-5">Time Out</th>
                    <th className="p-5">Status</th>
                  </tr>
                </thead>

                <tbody>

                  {filteredLogs.map((log, i) => {

                    const status =
                      getStatus(log);

                    return (
                      <tr
                        key={i}
                        className="border-b border-gray-100 hover:bg-emerald-50/40 transition"
                      >

                        <td className="p-5 font-semibold text-gray-900">
                          {log.name ||
                            log.employee_db_id}
                        </td>

                        <td className="p-5 text-gray-600">
                          {log.time_in
                            ? new Date(
                                log.time_in
                              ).toLocaleString()
                            : "—"}
                        </td>

                        <td className="p-5 text-gray-600">
                          {log.time_out
                            ? new Date(
                                log.time_out
                              ).toLocaleString()
                            : "—"}
                        </td>

                        <td className="p-5">

                          {status ===
                            "ACTIVE" && (
                            <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                              Active
                            </span>
                          )}

                          {status ===
                            "OFFLINE" && (
                            <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">
                              Offline
                            </span>
                          )}

                          {status ===
                            "LATE" && (
                            <span className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-bold">
                              Late
                            </span>
                          )}

                        </td>

                      </tr>
                    );
                  })}

                </tbody>

              </table>

            </div>

          </div>
        )}

      </div>

    </div>
  );
}