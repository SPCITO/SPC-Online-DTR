"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Activity,
  Users,
  Clock3,
  ArrowRight,
  Building2,
  FileSpreadsheet,
  UserPlus
} from "lucide-react";

export default function AdminDashboard() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ 1. ROLE GUARD
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.replace("/login");
        return;
      }
      if (user.role !== "admin") {
        router.replace("/403");
        return;
      }
    }
  }, [user, authLoading, router]);

  // ✅ 2. FETCH DATA (For Stats Only)
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const data = await api.getLogs();
        setLogs(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to fetch logs:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [router]);

  const today = new Date().toDateString();
  const todayLogs = logs.filter(
    (l) => new Date(l.time_in).toDateString() === today
  );
  const activeUsers = todayLogs.filter((l) => !l.time_out);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 bg-[#f4f7f5]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          <p className="text-sm font-medium animate-pulse">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7f5] overflow-x-hidden">
      {/* BACKGROUND GLOWS */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-100px] left-[-100px] w-[400px] h-[400px] bg-emerald-200/30 blur-3xl rounded-full" />
        <div className="absolute bottom-[-100px] right-[-100px] w-[400px] h-[400px] bg-blue-200/30 blur-3xl rounded-full" />
      </div>

      <div className="relative px-6 lg:px-8 py-8 lg:py-12">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* HEADER SECTION */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row md:items-end justify-between gap-6"
          >
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-4">
                <ShieldCheck size={14} />
                Admin Control Center
              </div>
              <h1 className="text-4xl lg:text-5xl font-black text-gray-900 tracking-tight">
                Overview
              </h1>
              <p className="mt-2 text-gray-500 text-lg">
                Real-time workforce analytics and system status.
              </p>
            </div>

            <div className="flex items-center gap-3 text-sm text-gray-400 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              System Operational
            </div>
          </motion.div>

          {/* STATS GRID (Bento Style) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Active Users Card */}
            <motion.div
              whileHover={{ y: -4 }}
              className="relative overflow-hidden rounded-3xl bg-white p-6 shadow-xl shadow-gray-200/50 border border-white"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-green-100/50 blur-2xl rounded-full -mr-10 -mt-10" />
              <div className="relative flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Active Now</p>
                  <h2 className="mt-2 text-5xl font-black text-gray-900">{activeUsers.length}</h2>
                  <p className="mt-2 text-sm text-green-600 font-medium flex items-center gap-1">
                    <Users size={14} /> Currently clocked in
                  </p>
                </div>
                <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center text-green-600">
                  <Users size={32} />
                </div>
              </div>
            </motion.div>

            {/* Today's Logs Card */}
            <motion.div
              whileHover={{ y: -4 }}
              className="relative overflow-hidden rounded-3xl bg-white p-6 shadow-xl shadow-gray-200/50 border border-white"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-100/50 blur-2xl rounded-full -mr-10 -mt-10" />
              <div className="relative flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Today's Activity</p>
                  <h2 className="mt-2 text-5xl font-black text-gray-900">{todayLogs.length}</h2>
                  <p className="mt-2 text-sm text-blue-600 font-medium flex items-center gap-1">
                    <Activity size={14} /> Total scans
                  </p>
                </div>
                <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600">
                  <Clock3 size={32} />
                </div>
              </div>
            </motion.div>

            {/* Total Database Card */}
            <motion.div
              whileHover={{ y: -4 }}
              className="relative overflow-hidden rounded-3xl bg-white p-6 shadow-xl shadow-gray-200/50 border border-white"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-100/50 blur-2xl rounded-full -mr-10 -mt-10" />
              <div className="relative flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Records</p>
                  <h2 className="mt-2 text-5xl font-black text-gray-900">{logs.length}</h2>
                  <p className="mt-2 text-sm text-purple-600 font-medium flex items-center gap-1">
                    <FileSpreadsheet size={14} /> Lifetime logs
                  </p>
                </div>
                <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-600">
                  <Activity size={32} />
                </div>
              </div>
            </motion.div>
          </div>

          {/* QUICK ACTIONS BENTO GRID */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-8"
          >
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              Quick Actions
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              {/* View Department Logs (Primary Action) */}
              <div 
                onClick={() => router.push('/admin/departments')}
                className="group cursor-pointer relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 p-8 shadow-xl shadow-emerald-900/20 hover:shadow-emerald-900/30 transition-all duration-300"
              >
                <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 blur-2xl rounded-full -mr-10 -mt-10 group-hover:scale-110 transition-transform duration-500" />
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Building2 size={24} className="text-white" />
                  </div>
                  <h4 className="text-xl font-bold text-white mb-2">View Department Logs</h4>
                  <p className="text-emerald-100 text-sm mb-6 max-w-[200px]">
                    Analyze attendance by specific department with detailed filtering.
                  </p>
                  <div className="inline-flex items-center gap-2 text-white font-semibold text-sm group-hover:gap-3 transition-all">
                    Go to Departments <ArrowRight size={16} />
                  </div>
                </div>
              </div>

              {/* Manage Employees */}
              <div 
                onClick={() => router.push('/admin/employees')}
                className="group cursor-pointer relative overflow-hidden rounded-3xl bg-white p-8 shadow-lg shadow-gray-200/50 border border-gray-100 hover:border-emerald-200 hover:shadow-emerald-100/50 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <UserPlus size={24} className="text-emerald-600" />
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-2">Manage Employees</h4>
                <p className="text-gray-500 text-sm mb-6">
                  Add new staff, edit details, or manage department assignments.
                </p>
                <div className="inline-flex items-center gap-2 text-emerald-700 font-semibold text-sm group-hover:gap-3 transition-all">
                  Open Manager <ArrowRight size={16} />
                </div>
              </div>

              {/* System Status / Placeholder */}
              <div className="relative overflow-hidden rounded-3xl bg-gray-50 p-8 border border-dashed border-gray-300 flex flex-col justify-center items-center text-center">
                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center mb-4">
                  <ShieldCheck size={20} className="text-gray-400" />
                </div>
                <h4 className="text-lg font-bold text-gray-700">System Healthy</h4>
                <p className="text-gray-500 text-sm mt-1">All services running normally</p>
              </div>

            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}