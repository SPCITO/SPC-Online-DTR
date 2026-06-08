"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { motion } from "framer-motion";
import { Clock3, CalendarDays, Activity, Users } from "lucide-react";
import {
  PageHeader,
  StatCard,
  TableHeader,
  LogTable,
  ExportButton,
} from "@/components/admin";

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
    log.name.toLowerCase().includes(search.toLowerCase())
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
        {/* HEADER */}
        <PageHeader
          title="Attendance Logs"
          description="Monitor and review employee attendance records in real time."
          icon={<Clock3 className="text-green-700" size={22} />}
          showBackButton
          backHref="/admin"
        />

        {/* STATS - Using Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <StatCard
            title="Total Records"
            value={logs.length}
            icon={CalendarDays}
            delay={0.1}
          />

          <StatCard
            title="Active Employees"
            value={activeLogs.length}
            icon={Activity}
            iconColor="text-emerald-700"
            bgColor="bg-emerald-100"
            delay={0.2}
          />

          <StatCard
            title="System Status"
            value="Operational"
            icon={Users}
            gradient
            subtitle="Attendance tracking and monitoring services are active."
            delay={0.3}
          />
        </div>

        {/* TABLE SECTION */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mt-8 bg-white/95 backdrop-blur-2xl rounded-[34px] border border-white shadow-[0_12px_50px_rgba(0,0,0,0.08)] overflow-hidden"
        >
          <TableHeader
            title="Employee Logs"
            subtitle="Attendance Records"
            searchPlaceholder="Search employee ID..."
            searchValue={search}
            onSearchChange={setSearch}
            recordCount={filteredLogs.length}
          />

          <LogTable logs={filteredLogs} loading={loading} />
        </motion.div>
      </div>
    </div>
  );
}