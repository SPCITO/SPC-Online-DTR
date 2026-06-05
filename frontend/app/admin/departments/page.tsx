"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

import * as XLSX from "xlsx";

import {
  Search,
  Download,
  Users,
  Clock3,
  TriangleAlert,
  Activity,
  ChevronRight,
} from "lucide-react";

const DEPARTMENT_NAMES: Record<number, string> = {
  1: "Basic Ed",
  2: "Collegiate",
  3: "Admin-Personnel",
  4: "Student Assistant",
};

type FilterType = "today" | "week" | "month";

export default function AdminDashboardPage() {
  const router = useRouter();

  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] =
    useState<FilterType>("today");

  const [search, setSearch] = useState("");

  // FETCH LOGS
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const data = await api.getLogs();

        setLogs(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, []);

  // FILTERED LOGS
  const filteredLogs = useMemo(() => {
    const now = new Date();

    return logs.filter((log) => {
      const matchesSearch =
        log.name
          ?.toLowerCase()
          .includes(search.toLowerCase()) ||
        log.employee_db_id
          ?.toString()
          .includes(search);

      if (!matchesSearch) return false;

      const timeIn = new Date(log.time_in);

      if (filter === "today") {
        return (
          timeIn.toDateString() ===
          now.toDateString()
        );
      }

      if (filter === "week") {
        const diff =
          now.getTime() - timeIn.getTime();

        return (
          diff <=
          7 * 24 * 60 * 60 * 1000
        );
      }

      if (filter === "month") {
        return (
          timeIn.getMonth() ===
            now.getMonth() &&
          timeIn.getFullYear() ===
            now.getFullYear()
        );
      }

      return true;
    });
  }, [logs, filter, search]);

  // STATUS
  const getStatus = (log: any) => {
    if (!log.time_out) {
      return "ACTIVE";
    }

    const timeIn = new Date(log.time_in);

    const totalMinutes =
      timeIn.getHours() * 60 +
      timeIn.getMinutes();

    // LATE AFTER 8:30 AM
    if (totalMinutes > 510) {
      return "LATE";
    }

    return "OFFLINE";
  };

  // WORK HOURS
  const getWorkHours = (log: any) => {
    if (!log.time_out) return "--";

    const diff =
      new Date(log.time_out).getTime() -
      new Date(log.time_in).getTime();

    const hrs = Math.floor(diff / 3600000);

    const mins = Math.floor(
      (diff % 3600000) / 60000
    );

    return `${hrs}h ${mins}m`;
  };

  // DEPARTMENT STATS
  const departmentStats = useMemo(() => {
    return Object.entries(DEPARTMENT_NAMES).map(
      ([id, name]) => {
        const deptLogs = filteredLogs.filter(
          (log) =>
            Number(log.department_id) === Number(id)
        );

        const activeCount = deptLogs.filter(
          (log) => !log.time_out
        ).length;

        const lateCount = deptLogs.filter(
          (log) => getStatus(log) === "LATE"
        ).length;

        return {
          id,
          name,
          total: deptLogs.length,
          active: activeCount,
          late: lateCount,
        };
      }
    );
  }, [filteredLogs]);

  // EXPORT
  const exportExcel = () => {
    const worksheet =
      XLSX.utils.json_to_sheet(
        filteredLogs.map((log) => ({
          Employee: log.name,
          Department:
            DEPARTMENT_NAMES[
              log.department_id
            ],
          TimeIn: log.time_in,
          TimeOut: log.time_out,
          Status: getStatus(log),
          WorkHours: getWorkHours(log),
        }))
      );

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Department Logs"
    );

    XLSX.writeFile(
      workbook,
      "department-logs.xlsx"
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f7f5] text-gray-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7f5] p-6">
      <div className="max-w-7xl mx-auto">

        {/* HEADER */}
        <div className="mb-8">
          <h1 className="text-5xl font-black text-gray-900">
            Online DTR Dashboard
          </h1>

          <p className="text-gray-500 mt-2">
            Monitor attendance across all departments
          </p>
        </div>

        {/* TOP STATS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">

          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">
                  Total Logs
                </p>

                <h2 className="text-4xl font-black text-gray-900 mt-2">
                  {filteredLogs.length}
                </h2>
              </div>

              <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <Users className="text-emerald-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">
                  Active Employees
                </p>

                <h2 className="text-4xl font-black text-gray-900 mt-2">
                  {
                    filteredLogs.filter(
                      (l) => !l.time_out
                    ).length
                  }
                </h2>
              </div>

              <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">
                <Activity className="text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">
                  Late Employees
                </p>

                <h2 className="text-4xl font-black text-gray-900 mt-2">
                  {
                    filteredLogs.filter(
                      (l) =>
                        getStatus(l) === "LATE"
                    ).length
                  }
                </h2>
              </div>

              <div className="w-14 h-14 rounded-2xl bg-yellow-100 flex items-center justify-center">
                <TriangleAlert className="text-yellow-600" />
              </div>
            </div>
          </div>

        </div>

        {/* DEPARTMENT CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">

          {departmentStats.map((dept) => (
            <div
              key={dept.id}
              onClick={() =>
                router.push(
                  `/admin/departments/${dept.id}`
                )
              }
              className="
                cursor-pointer

                bg-white

                rounded-3xl

                border border-gray-100

                p-6

                shadow-sm

                hover:shadow-xl
                hover:-translate-y-1

                transition-all duration-300
              "
            >

              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
                  <Users
                    className="text-emerald-600"
                    size={20}
                  />
                </div>

                <ChevronRight
                  className="text-gray-400"
                  size={18}
                />
              </div>

              <h2 className="mt-5 text-xl font-black text-gray-900">
                {dept.name}
              </h2>

              <div className="mt-5 space-y-3">

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    Records
                  </span>

                  <span className="font-bold text-gray-900">
                    {dept.total}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    Active
                  </span>

                  <span className="font-bold text-emerald-600">
                    {dept.active}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    Late
                  </span>

                  <span className="font-bold text-yellow-600">
                    {dept.late}
                  </span>
                </div>

              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();

                  const deptLogs =
                    filteredLogs.filter(
                      (log) =>
                        Number(
                          log.department_id
                        ) === Number(dept.id)
                    );

                  const worksheet =
                    XLSX.utils.json_to_sheet(
                      deptLogs.map((log) => ({
                        Employee: log.name,
                        TimeIn: log.time_in,
                        TimeOut: log.time_out,
                        Status: getStatus(log),
                        WorkHours:
                          getWorkHours(log),
                      }))
                    );

                  const workbook =
                    XLSX.utils.book_new();

                  XLSX.utils.book_append_sheet(
                    workbook,
                    worksheet,
                    dept.name
                  );

                  XLSX.writeFile(
                    workbook,
                    `${dept.name}.xlsx`
                  );
                }}
                className="
                  mt-6

                  w-full

                  py-3

                  rounded-2xl

                  bg-gray-900
                  text-white

                  text-sm
                  font-semibold

                  hover:opacity-90

                  transition
                "
              >
                Export Department
              </button>

            </div>
          ))}

        </div>

        {/* CONTROLS */}
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center justify-between mb-6">

          {/* SEARCH */}
          <div className="relative w-full lg:w-[380px]">

            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />

            <input
              type="text"
              placeholder="Search employee..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              className="
                w-full

                pl-12 pr-4 py-3

                rounded-2xl

                border border-gray-200

                bg-white

                outline-none

                focus:ring-2
                focus:ring-emerald-400
              "
            />

          </div>

          {/* FILTERS */}
          <div className="flex gap-3 flex-wrap">

            {(
              [
                "today",
                "week",
                "month",
              ] as FilterType[]
            ).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`
                  px-5 py-3 rounded-2xl font-semibold transition
                  ${
                    filter === f
                      ? "bg-emerald-500 text-white"
                      : "bg-white border border-gray-200 text-gray-600"
                  }
                `}
              >
                {f.toUpperCase()}
              </button>
            ))}

            <button
              onClick={exportExcel}
              className="
                px-5 py-3

                rounded-2xl

                bg-gray-900
                text-white

                flex items-center gap-2

                font-semibold
              "
            >
              <Download size={16} />
              Export All
            </button>

          </div>

        </div>

        {/* TABLE */}
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

            <div className="flex items-center gap-2 font-semibold text-gray-700">
              <Clock3 size={18} />
              Attendance Logs
            </div>

            <div className="text-sm text-gray-400">
              {filteredLogs.length} records
            </div>

          </div>

          <div className="overflow-x-auto">

            <table className="w-full min-w-[1100px]">

              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-[0.2em] text-gray-400">
                  <th className="p-5 text-left">
                    Employee
                  </th>

                  <th className="p-5 text-left">
                    Department
                  </th>

                  <th className="p-5 text-left">
                    Time In
                  </th>

                  <th className="p-5 text-left">
                    Time Out
                  </th>

                  <th className="p-5 text-left">
                    Work Hours
                  </th>

                  <th className="p-5 text-left">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody>

                {filteredLogs.map((log, i) => {

                  const status =
                    getStatus(log);

                  return (
                    <tr
                      key={i}
                      className="
                        border-b border-gray-100
                        hover:bg-emerald-50/40
                        transition
                      "
                    >

                      <td className="p-5 font-semibold text-gray-900">
                        {log.name || "Unknown"}
                      </td>

                      <td className="p-5 text-gray-600">
                        {
                          DEPARTMENT_NAMES[
                            log.department_id
                          ]
                        }
                      </td>

                      <td className="p-5 text-gray-600">
                        {new Date(
                          log.time_in
                        ).toLocaleString()}
                      </td>

                      <td className="p-5 text-gray-600">
                        {log.time_out
                          ? new Date(
                              log.time_out
                            ).toLocaleString()
                          : "--"}
                      </td>

                      <td className="p-5 text-gray-700 font-medium">
                        {getWorkHours(log)}
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
                          <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-bold">
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

      </div>
    </div>
  );
}