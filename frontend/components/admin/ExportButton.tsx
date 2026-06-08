"use client";

import { Download, Users } from "lucide-react";
import * as XLSX from "xlsx";

interface ExportButtonProps {
  logs: any[];
  filename?: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}

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

const getStatus = (log: any) => {
  if (!log.time_out) return "ACTIVE";

  const timeIn = new Date(log.time_in);
  const totalMinutes = timeIn.getHours() * 60 + timeIn.getMinutes();

  if (totalMinutes > 510) return "LATE";

  return "OFFLINE";
};

const getWorkHours = (log: any) => {
  if (!log.time_out) return "--";

  const diff =
    new Date(log.time_out).getTime() - new Date(log.time_in).getTime();

  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);

  return `${hrs}h ${mins}m`;
};

export default function ExportButton({
  logs,
  filename,
  variant = "primary",
  disabled = false,
}: ExportButtonProps) {
  const handleExport = () => {
    if (!logs || logs.length === 0) return;

    const sortedLogs = [...logs].sort((a, b) => {
      if (a.department_id !== b.department_id) {
        return Number(a.department_id) - Number(b.department_id);
      }
      return new Date(b.time_in).getTime() - new Date(a.time_in).getTime();
    });

    const worksheet = XLSX.utils.json_to_sheet(
      sortedLogs.map((log) => ({
        Department_ID: log.department_id,
        Department: DEPARTMENT_NAMES[log.department_id] || "Unknown",
        Employee_ID: log.employee_db_id,
        Employee: log.name || "Unknown",
        Role: log.role || "N/A",
        TimeIn: log.time_in ? new Date(log.time_in).toISOString() : "",
        TimeOut: log.time_out ? new Date(log.time_out).toISOString() : "",
        Status: getStatus(log),
        WorkHours: getWorkHours(log),
      }))
    );

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");

    const exportFilename =
      filename ||
      `dtr-export-${new Date().toISOString().split("T")[0]}.xlsx`;

    XLSX.writeFile(workbook, exportFilename);
  };

  const baseStyles = `
    px-5 py-3
    rounded-2xl
    flex items-center gap-2
    font-semibold
    transition-all
    hover:shadow-lg
    disabled:opacity-50 disabled:cursor-not-allowed
  `;

  const variantStyles =
    variant === "primary"
      ? "bg-gray-900 text-white hover:opacity-90"
      : "bg-emerald-500 text-white hover:bg-emerald-600";

  return (
    <button onClick={handleExport} disabled={disabled} className={`${baseStyles} ${variantStyles}`}>
      <Download size={16} />
      Export {logs.length > 0 && `(${logs.length})`}
    </button>
  );
}

// Quick export for department-specific data
export function exportDepartmentLogs(
  logs: any[],
  departmentId: number,
  departmentName: string,
  dateRange?: string
) {
  if (!logs || logs.length === 0) return;

  const deptLogs = logs.filter(
    (log) => Number(log.department_id) === Number(departmentId)
  );

  const sortedDeptLogs = [...deptLogs].sort((a, b) => {
    return new Date(b.time_in).getTime() - new Date(a.time_in).getTime();
  });

  const worksheet = XLSX.utils.json_to_sheet(
    sortedDeptLogs.map((log) => ({
      Department_ID: log.department_id,
      Department: DEPARTMENT_NAMES[log.department_id],
      Employee_ID: log.employee_db_id,
      Employee: log.name || "Unknown",
      Role: log.role || "N/A",
      TimeIn: log.time_in ? new Date(log.time_in).toISOString() : "",
      TimeOut: log.time_out ? new Date(log.time_out).toISOString() : "",
      Status: getStatus(log),
      WorkHours: getWorkHours(log),
    }))
  );

  const workbook = XLSX.utils.book_new();
  const sheetName = departmentName.substring(0, 31);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const parts = ["dtr-export"];
  if (DEPARTMENT_CODES[departmentId]) {
    parts.push(DEPARTMENT_CODES[departmentId]);
  }
  if (dateRange) {
    parts.push(dateRange);
  }
  parts.push("department");
  parts.push(new Date().toISOString().split("T")[0]);

  const filename = `${parts.join("-")}.xlsx`;
  XLSX.writeFile(workbook, filename);
}
