"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import ExcelJS from "exceljs";

import {
  Search,
  Download,
  Users,
  Clock3,
  TriangleAlert,
  Activity,
  ChevronRight,
  Loader2,
  FileSpreadsheet,
} from "lucide-react";

// --- CONFIGURATION ---
const DEPARTMENT_NAMES: Record<number, string> = {
  1: "Basic Ed",
  2: "Collegiate",
  3: "Admin-Personnel",
  4: "Student Assistant",
};

const DEPARTMENT_CODES: Record<number, string> = {
  1: "BE",
  2: "COL",
  3: "ADMIN",
  4: "SA",
};

type FilterType = "today" | "week" | "month";

export default function AdminDashboardPage() {
  const router = useRouter();

  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false); // New state for export loading

  const [filter, setFilter] = useState<FilterType>("today");
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
        log.name?.toLowerCase().includes(search.toLowerCase()) ||
        log.employee_db_id?.toString().includes(search);

      if (!matchesSearch) return false;

      const timeIn = new Date(log.time_in);

      if (filter === "today") {
        return timeIn.toDateString() === now.toDateString();
      }
      if (filter === "week") {
        const diff = now.getTime() - timeIn.getTime();
        return diff <= 7 * 24 * 60 * 60 * 1000;
      }
      if (filter === "month") {
        return (
          timeIn.getMonth() === now.getMonth() &&
          timeIn.getFullYear() === now.getFullYear()
        );
      }
      return true;
    });
  }, [logs, filter, search]);

  // HELPERS
  const getStatus = (log: any) => {
    if (!log.time_out) return "ACTIVE";
    const timeIn = new Date(log.time_in);
    const totalMinutes = timeIn.getHours() * 60 + timeIn.getMinutes();
    if (totalMinutes > 510) return "LATE"; // After 8:30 AM
    return "OFFLINE";
  };

  const getWorkHours = (log: any) => {
    if (!log.time_out) return "--";
    const diff = new Date(log.time_out).getTime() - new Date(log.time_in).getTime();
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hrs}h ${mins}m`;
  };

  const getDepartmentStats = useMemo(() => {
    return Object.entries(DEPARTMENT_NAMES).map(([id, name]) => {
      const deptLogs = filteredLogs.filter((log) => Number(log.department_id) === Number(id));
      return {
        id: Number(id),
        name,
        total: deptLogs.length,
        active: deptLogs.filter((l) => !l.time_out).length,
        late: deptLogs.filter((l) => getStatus(l) === "LATE").length,
      };
    });
  }, [filteredLogs]);

  // --- ADVANCED EXPORT LOGIC (EXCELJS) ---

  const generateFilename = (prefix: string) => {
    const dateStr = new Date().toISOString().split("T")[0];
    return `${prefix}_${filter.toUpperCase()}_${dateStr}.xlsx`;
  };

  const setupWorksheet = (worksheet: ExcelJS.Worksheet, title: string) => {
    worksheet.properties.defaultRowHeight = 20;
    
    // Header Row
    const headerRow = worksheet.addRow([
      "Employee ID", "Name", "Department", "Role", 
      "Time In", "Time Out", "Status", "Work Hours"
    ]);
    
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF10B981" }, // Emerald 500
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 25;

    // Column Widths
    worksheet.columns = [
      { width: 15 }, { width: 25 }, { width: 20 }, { width: 15 },
      { width: 22 }, { width: 22 }, { width: 12 }, { width: 12 }
    ];
  };

  const addLogData = (worksheet: ExcelJS.Worksheet, data: any[]) => {
    data.forEach((log) => {
      const status = getStatus(log);
      let statusColor = "FF9CA3AF"; // Gray
      if (status === "ACTIVE") statusColor = "FF10B981"; // Green
      if (status === "LATE") statusColor = "FFF59E0B"; // Yellow

      const row = worksheet.addRow([
        log.employee_db_id,
        log.name,
        DEPARTMENT_NAMES[log.department_id] || "Unknown",
        log.role || "N/A",
        log.time_in ? new Date(log.time_in).toLocaleString() : "",
        log.time_out ? new Date(log.time_out).toLocaleString() : "",
        status,
        getWorkHours(log),
      ]);

      // Style Status Cell
      const statusCell = row.getCell(7);
      statusCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: statusColor },
      };
      statusCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      statusCell.alignment = { horizontal: "center" };
    });
  };

  const handleExportAll = async () => {
    setExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "SPC DTR System";
      workbook.lastModifiedBy = "Admin";
      workbook.created = new Date();

      // 1. Executive Summary Sheet
      const summarySheet = workbook.addWorksheet("Executive Summary");
      summarySheet.mergeCells("A1:H1");
      const titleCell = summarySheet.getCell("A1");
      titleCell.value = `Attendance Overview (${filter.toUpperCase()})`;
      titleCell.font = { bold: true, size: 18, color: { argb: "FF111827" } };
      titleCell.alignment = { horizontal: "center" };
      
      // Summary Stats Table
      const statsHeaders = ["Department", "Total Logs", "Active Now", "Late Arrivals", "Attendance Rate"];
      const statsRow = summarySheet.addRow(statsHeaders);
      statsRow.font = { bold: true };
      statsRow.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } }; });

      getDepartmentStats.forEach(dept => {
        const rate = dept.total > 0 ? `${Math.round(((dept.total - dept.late) / dept.total) * 100)}%` : "100%";
        summarySheet.addRow([dept.name, dept.total, dept.active, dept.late, rate]);
      });
      summarySheet.columns.forEach(col => col.width = 20);

      // 2. Individual Department Sheets
      Object.entries(DEPARTMENT_NAMES).forEach(([id, name]) => {
        const deptLogs = filteredLogs.filter(l => Number(l.department_id) === Number(id));
        if (deptLogs.length === 0) return;

        const sheet = workbook.addWorksheet(name.substring(0, 31));
        setupWorksheet(sheet, name);
        
        // Sort logs: Latest first
        const sorted = [...deptLogs].sort((a, b) => new Date(b.time_in).getTime() - new Date(a.time_in).getTime());
        addLogData(sheet, sorted);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = generateFilename("ALL_DEPARTMENTS_REPORT");
      link.click();
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to generate report.");
    } finally {
      setExporting(false);
    }
  };

  const handleExportDepartment = async (deptId: number, deptName: string) => {
    setExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const deptLogs = filteredLogs.filter(l => Number(l.department_id) === deptId);

      if (deptLogs.length === 0) {
        alert("No data to export for this department.");
        setExporting(false);
        return;
      }

      // 1. Monthly/Period Overview Sheet
      const overviewSheet = workbook.addWorksheet("Period Overview");
      setupWorksheet(overviewSheet, `${deptName} Overview`);
      
      const sortedAll = [...deptLogs].sort((a, b) => new Date(b.time_in).getTime() - new Date(a.time_in).getTime());
      addLogData(overviewSheet, sortedAll);

      // 2. Daily Breakdown Sheets (Group by Date)
      const logsByDay: Record<string, any[]> = {};
      deptLogs.forEach(log => {
        const dateKey = new Date(log.time_in).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        if (!logsByDay[dateKey]) logsByDay[dateKey] = [];
        logsByDay[dateKey].push(log);
      });

      Object.entries(logsByDay).forEach(([date, dayLogs]) => {
        const safeName = `${date} ${deptName.substring(0, 15)}`.substring(0, 31);
        const daySheet = workbook.addWorksheet(safeName);
        setupWorksheet(daySheet, `Logs for ${date}`);
        
        const sortedDay = [...dayLogs].sort((a, b) => new Date(b.time_in).getTime() - new Date(a.time_in).getTime());
        addLogData(daySheet, sortedDay);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = generateFilename(`${deptName.replace(/\s+/g, '_')}_REPORT`);
      link.click();
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to generate report.");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f7f5] text-gray-500">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7f5] p-6">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tight">Department Overview</h1>
            <p className="text-gray-500 mt-2 text-lg">Real-time attendance analytics and reporting.</p>
          </div>
          
          <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-gray-100">
             <span className={`w-2 h-2 rounded-full ${exporting ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
             <span className="text-sm font-medium text-gray-600">{exporting ? 'Generating Report...' : 'System Ready'}</span>
          </div>
        </div>

        {/* TOP STATS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { label: "Total Logs", value: filteredLogs.length, icon: Users, color: "bg-emerald-100 text-emerald-600" },
            { label: "Active Now", value: filteredLogs.filter(l => !l.time_out).length, icon: Activity, color: "bg-blue-100 text-blue-600" },
            { label: "Late Arrivals", value: filteredLogs.filter(l => getStatus(l) === "LATE").length, icon: TriangleAlert, color: "bg-yellow-100 text-yellow-600" },
          ].map((stat, i) => (
            <div key={i} className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm font-bold uppercase tracking-wider">{stat.label}</p>
                  <h2 className="text-4xl font-black text-gray-900 mt-2">{stat.value}</h2>
                </div>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${stat.color}`}>
                  <stat.icon size={28} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* DEPARTMENT CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {getDepartmentStats.map((dept) => (
            <div
              key={dept.id}
              onClick={() => router.push(`/admin/departments/${dept.id}`)}
              className="group cursor-pointer bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 group-hover:bg-emerald-100 transition-colors flex items-center justify-center text-emerald-600">
                  <Users size={24} />
                </div>
                <ChevronRight className="text-gray-300 group-hover:text-emerald-500 transition-colors" size={20} />
              </div>

              <h2 className="text-xl font-black text-gray-900">{dept.name}</h2>

              <div className="mt-6 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Records</span>
                  <span className="font-bold text-gray-900">{dept.total}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Active</span>
                  <span className="font-bold text-emerald-600">{dept.active}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Late</span>
                  <span className="font-bold text-yellow-600">{dept.late}</span>
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleExportDepartment(dept.id, dept.name);
                }}
                disabled={exporting}
                className="mt-6 w-full py-3 rounded-2xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                Export Report
              </button>
            </div>
          ))}
        </div>

        {/* CONTROLS & TABLE */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
            
            <div className="relative w-full lg:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search employee..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
              />
            </div>

            <div className="flex gap-3 flex-wrap items-center">
              {(["today", "week", "month"] as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                    filter === f
                      ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200"
                      : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}

              <div className="h-8 w-px bg-gray-200 mx-1 hidden lg:block" />

              <button
                onClick={handleExportAll}
                disabled={exporting}
                className="px-5 py-2.5 rounded-xl bg-gray-900 text-white font-bold text-sm flex items-center gap-2 hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-gray-200"
              >
                {exporting ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                Export All Data
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead className="bg-gray-50/50">
                <tr className="text-xs uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
                  <th className="p-5 text-left">Employee</th>
                  <th className="p-5 text-left">Department</th>
                  <th className="p-5 text-left">Time In</th>
                  <th className="p-5 text-left">Time Out</th>
                  <th className="p-5 text-left">Work Hours</th>
                  <th className="p-5 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log, i) => {
                    const status = getStatus(log);
                    return (
                      <tr key={i} className="hover:bg-emerald-50/30 transition-colors">
                        <td className="p-5 font-semibold text-gray-900">{log.name || "Unknown"}</td>
                        <td className="p-5 text-gray-600">{DEPARTMENT_NAMES[log.department_id] || "Unknown"}</td>
                        <td className="p-5 text-gray-600 font-mono text-sm">{new Date(log.time_in).toLocaleString()}</td>
                        <td className="p-5 text-gray-600 font-mono text-sm">{log.time_out ? new Date(log.time_out).toLocaleString() : "--"}</td>
                        <td className="p-5 text-gray-700 font-medium">{getWorkHours(log)}</td>
                        <td className="p-5">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            status === "ACTIVE" ? "bg-green-100 text-green-700" :
                            status === "LATE" ? "bg-yellow-100 text-yellow-700" :
                            "bg-gray-100 text-gray-700"
                          }`}>
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-gray-400">
                      No records found for this period.
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