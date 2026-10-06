"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import AttendanceCorrectionModal from "@/components/AttendanceCorrectionModal";

import {
  ArrowLeft,
  Users,
  Activity,
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

  // M.39: admin Time Out correction control (AUTO / PENDING records)
  const [correctionLog, setCorrectionLog] = useState<any | null>(null);

  const [tab, setTab] =
    useState<TabType>("today");

  // Payroll-grade log loading: the DATABASE filters by date window and
  // paginates — every historical day (e.g. launch day Oct 1) is retrievable.
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const PAGE_SIZE = 200;

  const rangeParams = () =>
    from || to
      ? { from: from || undefined, to: to || undefined }
      : { dateRange: tab === "analytics" ? "month" : tab };

  const fetchLogs = async (nextPage: number, append: boolean) => {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);
      const data: any = await api.getDepartmentLogsByDepartment(deptId, {
        page: nextPage,
        limit: PAGE_SIZE,
        ...rangeParams(),
      });
      const logList = Array.isArray(data) ? data : (data?.logs || []);
      setLogs((prev) => (append ? [...prev, ...logList] : logList));
      setTotal(data?.total ?? logList.length);
      setHasMore(Boolean(data?.hasMore));
      setPage(nextPage);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (deptId) {
      fetchLogs(1, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptId, tab, from, to]);

  // Closure source label — USER / AUTO / ADMIN-CORRECTED / NO TIME-OUT
  const closureLabel = (log: any) => {
    if (!log.time_out) return log.no_time_out ? "NO TIME-OUT" : "OPEN";
    if (log.status === "AUTO") return log.pending ? "AUTO / PENDING CORRECTION" : "AUTO";
    return log.status || "USER";
  };

  const handleCorrected = (updated: any) => {
    setLogs((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)));
  };

  // Attendance completion state (M.61): ACTIVE = open record, COMPLETED =
  // timed out. Punctuality ("Late") is no longer classified in the UX.
  const getStatus = (log: any) => {
    if (!log.time_out) {
      return "ACTIVE";
    }

    return "COMPLETED";
  };

  // The server already applies the date window — display what was loaded.
  const filteredLogs = logs;

  const activeCount =
    filteredLogs.filter(
      (l) => !l.time_out
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

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900">
              {DEPARTMENT_NAMES[deptId]}
            </h1>

            <p className="text-gray-500 mt-2">
              Department monitoring dashboard
            </p>

          </div>

        </div>

        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">

          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">

              <div>
                <p className="text-gray-400 text-sm">
                  Total Records
                </p>

                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900 mt-2">
                  {total}
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

                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900 mt-2">
                  {activeCount}
                </h2>
              </div>

              <Activity className="text-blue-600" />
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

        {/* PAYROLL DATE WINDOW (overrides the tab when set) */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <label className="text-xs font-bold text-gray-500 uppercase">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900"
          />
          <label className="text-xs font-bold text-gray-500 uppercase">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900"
          />
          {(from || to) && (
            <button
              onClick={() => { setFrom(""); setTo(""); }}
              className="px-3 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-bold"
            >
              Clear
            </button>
          )}
          <span className="text-sm text-gray-400">
            Showing {logs.length} of {total} records
          </span>
        </div>

        {/* ANALYTICS */}
        {tab === "analytics" ? (
          <div className="grid grid-cols-1 gap-5">

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
                  <span className="text-black">Currently Active</span>
                  <span className="font-bold text-emerald-600">
                    {activeCount}
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
                    <th className="p-3 sm:p-5">Employee</th>
                    <th className="p-3 sm:p-5">Time In</th>
                    <th className="p-3 sm:p-5">Time Out</th>
                    <th className="p-3 sm:p-5">Status</th>
                    <th className="p-3 sm:p-5">Closure</th>
                    <th className="p-3 sm:p-5">Action</th>
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

                        <td className="p-3 sm:p-5 font-semibold text-gray-900">
                          {log.name ||
                            log.employee_db_id}
                        </td>

                        <td className="p-3 sm:p-5 text-gray-600">
                          {log.time_in
                            ? new Date(
                                log.time_in
                              ).toLocaleString()
                            : "—"}
                        </td>

                        <td className="p-3 sm:p-5 text-gray-600">
                          {log.time_out
                            ? new Date(
                                log.time_out
                              ).toLocaleString()
                            : "—"}
                        </td>

                        <td className="p-3 sm:p-5">

                          {status ===
                            "ACTIVE" && (
                            <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                              Active
                            </span>
                          )}

                          {status ===
                            "COMPLETED" && (
                            <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">
                              Completed
                            </span>
                          )}

                        </td>

                        <td className="p-3 sm:p-5">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            log.no_time_out
                              ? "bg-rose-100 text-rose-700"
                              : log.status === "AUTO"
                              ? log.pending
                                ? "bg-orange-100 text-orange-700"
                                : "bg-orange-50 text-orange-600"
                              : log.status === "ADMIN-CORRECTED"
                              ? "bg-emerald-100 text-emerald-700"
                              : log.time_out
                              ? "bg-gray-100 text-gray-600"
                              : "bg-green-50 text-green-600"
                          }`}>
                            {closureLabel(log)}
                          </span>
                        </td>

                        <td className="p-3 sm:p-5">
                          {log.time_out || log.no_time_out ? (
                            <button
                              onClick={() => setCorrectionLog(log)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                                log.status === "AUTO" || log.no_time_out
                                  ? "bg-amber-500 text-white hover:bg-amber-600"
                                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                              }`}
                            >
                              {log.status === "AUTO" || log.no_time_out ? "Correct" : "Review"}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>

                      </tr>
                    );
                  })}

                </tbody>

              </table>

            </div>

            {hasMore && (
              <div className="p-6 border-t border-gray-100 flex justify-center">
                <button
                  onClick={() => fetchLogs(page + 1, true)}
                  disabled={loadingMore}
                  className="px-8 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-200"
                >
                  {loadingMore
                    ? "Loading..."
                    : `Load More (${logs.length} of ${total})`}
                </button>
              </div>
            )}

          </div>
        )}

      </div>

      {/* M.39: ADMIN TIME OUT CORRECTION */}
      {correctionLog && (
        <AttendanceCorrectionModal
          log={correctionLog}
          onClose={() => setCorrectionLog(null)}
          onCorrected={handleCorrected}
        />
      )}

    </div>
  );
}