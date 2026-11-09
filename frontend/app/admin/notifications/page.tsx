"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { Bell, Calendar, RefreshCw, Loader2, ChevronDown, X } from "lucide-react";

interface NotificationRow {
  id: number;
  notification_date: string;
  sent_at: string;
  employee_id: number;
  name: string | null;
  username: string | null;
  email: string | null;
}

export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth();

  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [hasMore, setHasMore] = useState(false);
  const [dateFilter, setDateFilter] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) setFetchingMore(true);
      else setLoading(true);
      setError("");
      try {
        const data: any = await api.getNotifications({
          page: pageNum,
          limit,
          date: dateFilter || undefined,
        });
        const newRows: NotificationRow[] = data?.rows || [];
        setTotal(data?.total || 0);
        setHasMore(!!data?.hasMore);
        setRows((prev) => (append ? [...prev, ...newRows] : newRows));
      } catch (err: any) {
        setError(err?.message || "Failed to load notifications");
      } finally {
        setLoading(false);
        setFetchingMore(false);
      }
    },
    [dateFilter, limit]
  );

  useEffect(() => {
    if (!authLoading && user) {
      setPage(1);
      load(1, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, dateFilter]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    load(next, true);
  };

  return (
    <div className="min-h-screen bg-[#f4f7f5] p-4 sm:p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-6xl mx-auto"
      >
        {/* HEADER */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-700">
                <Bell size={24} />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  Notification History
                </h1>
                <p className="text-gray-500 mt-1">
                  Every &quot;Missing Time-Out&quot; reminder sent — one row per person per day.
                </p>
              </div>
            </div>
          </div>

          {/* DATE FILTER */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Calendar
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="pl-9 pr-3 py-2.5 rounded-xl bg-white border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
            {dateFilter && (
              <button
                onClick={() => setDateFilter("")}
                className="p-2.5 rounded-xl bg-white border border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-200 transition-colors"
                title="Clear filter"
              >
                <X size={16} />
              </button>
            )}
            <button
              onClick={() => load(1, false)}
              className="p-2.5 rounded-xl bg-white border border-gray-200 text-gray-500 hover:text-emerald-600 hover:border-emerald-200 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* TABLE */}
        <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 sm:px-6 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-bold">
                    Date
                  </th>
                  <th className="px-4 sm:px-6 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-bold">
                    Time
                  </th>
                  <th className="px-4 sm:px-6 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-bold">
                    Employee
                  </th>
                  <th className="px-4 sm:px-6 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-bold">
                    Username
                  </th>
                  <th className="px-4 sm:px-6 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-bold">
                    Email
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center text-gray-400">
                      <Loader2 className="animate-spin inline mr-2" size={20} />
                      Loading notifications...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center text-gray-400">
                      <Bell className="mx-auto mb-3 text-gray-300" size={32} />
                      <p className="font-medium">No notifications yet</p>
                      <p className="text-sm mt-1">
                        Reminders appear here automatically when the 9:00 PM job sends them.
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-gray-50 hover:bg-emerald-50/30 transition-colors"
                    >
                      <td className="px-4 sm:px-6 py-4 text-sm font-medium text-gray-700 whitespace-nowrap">
                        {r.notification_date}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {r.sent_at?.split(" ")[1] || "—"}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm font-semibold text-gray-900">
                        {r.name || "—"}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-500">
                        {r.username || "—"}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-500">
                        {r.email || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* FOOTER / LOAD MORE */}
          {!loading && rows.length > 0 && (
            <div className="px-6 py-4 flex items-center justify-between border-t border-gray-50">
              <p className="text-sm text-gray-400">
                Showing {rows.length} of {total} notification{total === 1 ? "" : "s"}
              </p>
              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={fetchingMore}
                  className="flex items-center gap-2 px-5 py-2 rounded-full bg-white border border-gray-200 text-sm font-medium text-gray-600 hover:text-emerald-600 hover:border-emerald-200 transition-all disabled:opacity-50"
                >
                  {fetchingMore ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      Load More <ChevronDown size={16} />
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
