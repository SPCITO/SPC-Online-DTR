// NEXT_PUBLIC_API_URL is set explicitly in every supported build path
// (deploy-dtr.sh build-arg, frontend/.env.local, production image). Fall
// back to same-origin. M.28 cleanup: legacy Render fallback removed.
import type { SourceMode, SummaryResponse } from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api`;

// One-time cleanup: remove old localStorage auth data from pre-cookie migration
if (typeof window !== "undefined") {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("user");
}

// CSRF token stored in memory only — never in localStorage
let csrfToken: string | null = null;

export const setCsrfToken = (token: string) => {
  csrfToken = token;
};

const getCsrfToken = (): string | null => {
  return csrfToken;
};

const request = async (endpoint: string, options: any = {}) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  // Add CSRF token for state-changing requests
  const method = (options.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const token = getCsrfToken();
    if (token) {
      headers["X-CSRF-Token"] = token;
    }
  }

  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: "include", // Send cookies cross-origin
    });

    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    // Handle login response — store CSRF token from response
    if (endpoint === "/login" && res.ok && data?.csrfToken) {
      setCsrfToken(data.csrfToken);
    }

    // Handle CSRF refresh response
    if (endpoint === "/auth/csrf" && res.ok && data?.csrfToken) {
      setCsrfToken(data.csrfToken);
    }

    if (!res.ok) {
      if (endpoint === "/logout") {
        csrfToken = null;
        return { success: true };
      }

      if (res.status === 401) {
        csrfToken = null;
        // Don't auto-redirect for auth-check endpoints — let AuthProvider handle gracefully
        const isAuthCheck = endpoint === "/auth/csrf" || endpoint === "/me";
        // Failed login must surface the server message (e.g. "Invalid
        // credentials") on the login form — not redirect/reload it.
        if (endpoint === "/login") {
          throw new Error(data?.message || "Invalid credentials");
        }
        // M.45f: /change-password must surface its own errors (e.g. "Current
        // password is incorrect", "Session expired") instead of the generic
        // redirect-to-login path, which made the page fake a success toast and
        // stranded users in a password-change loop.
        if (endpoint === "/change-password") {
          throw new Error(data?.message || "Password change failed");
        }
        if (!isAuthCheck && typeof window !== "undefined") {
          // Full-page redirect — respect sub-path deploys (e.g. /dtr)
          window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/login`;
        }
        return null;
      }

      // Preserve the response payload (e.g. DTR identity candidates on 409)
      // so callers can render resolution choices, not just a message.
      const enriched: any = new Error(data?.message || "Request failed");
      enriched.status = res.status;
      enriched.data = data;
      throw enriched;
    }

    return data;
  } catch (err: any) {
    if (endpoint === "/logout") {
      csrfToken = null;
      return { success: true };
    }
    throw err;
  }
};

export const api = {
  // Session restoration — called by AuthProvider
  refreshCsrf: () => request("/auth/csrf"),
  restoreSession: async () => {
    await request("/auth/csrf");
    return request("/me");
  },

  login: (data: any) =>
    request("/login", { method: "POST", body: JSON.stringify(data) }),

  logout: () => request("/logout", { method: "POST" }),

  me: () => request("/me"),

  // `abandonOpen` acknowledges abandoning an open record from a previous
  // day (forgotten Time Out) so today's Time In can proceed — the old
  // record stays blank "No Time Out" and needs a DTR Correction Form.
  timeIn: (employee_db_id: number, opts?: { abandonOpen?: boolean }) =>
    request("/dtr/time-in", {
      method: "POST",
      body: JSON.stringify({ employee_db_id, abandon_open: !!opts?.abandonOpen }),
    }),

  timeOut: (employee_db_id: number) =>
    request("/dtr/time-out", {
      method: "POST",
      body: JSON.stringify({ employee_db_id }),
    }),

  // Admin-only: correct the Time Out of one attendance record.
  // Audited (attendance_corrections + security_logs); time_out is bound
  // to the record's own attendance day.
  correctAttendanceTimeOut: (attendanceId: number, timeOut: string) =>
    request(`/attendance/${attendanceId}/time-out`, {
      method: "PUT",
      body: JSON.stringify({ time_out: timeOut }),
    }),

  // Admin-only: read the correction audit trail of one attendance record.
  getAttendanceCorrections: (attendanceId: number) =>
    request(`/attendance/${attendanceId}/corrections`),

  getStatus: (employee_db_id: number) =>
    request(`/time/status/${employee_db_id}`),

  getLogs: (
    page = 1,
    limit = 50,
    search = "",
    range?: { dateRange?: string; from?: string; to?: string },
    source?: SourceMode
  ) => {
    const queryParams = new URLSearchParams();
    queryParams.append("page", page.toString());
    queryParams.append("limit", limit.toString());
    if (search) queryParams.append("search", search);
    if (range?.dateRange) queryParams.append("dateRange", range.dateRange);
    if (range?.from) queryParams.append("from", range.from);
    if (range?.to) queryParams.append("to", range.to);
    // M.69: source selector — omitted/`online` keeps existing behavior
    if (source && source !== "online") queryParams.append("source", source);
    return request(`/logs?${queryParams.toString()}`);
  },

  getAdminStats: () => request("/admin/stats"),

  getMyLogs: (
    employee_db_id: number,
    opts?: { source?: SourceMode; page?: number; limit?: number }
  ) => {
    const queryParams = new URLSearchParams();
    if (opts?.source && opts.source !== "online") queryParams.append("source", opts.source);
    if (opts?.page) queryParams.append("page", String(opts.page));
    if (opts?.limit) queryParams.append("limit", String(opts.limit));
    const qs = queryParams.toString();
    return request(`/logs/me/${employee_db_id}${qs ? `?${qs}` : ""}`);
  },

  getMonthlyLogs: (
    employee_db_id: number,
    year: number,
    month: number,
    source?: SourceMode
  ) =>
    request(
      `/monthly/${employee_db_id}/${year}/${month}${
        source && source !== "online" ? `?source=${source}` : ""
      }`
    ),

  // M.69: Both/Summary — employee-day groups with source sessions and a
  // computed reconciliation state. Group-level pagination server-side.
  getAttendanceSummary: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    dateRange?: string;
    from?: string;
    to?: string;
    employee_db_id?: number;
    deptId?: number;
  }): Promise<SummaryResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append("page", String(params.page));
    if (params?.limit) queryParams.append("limit", String(params.limit));
    if (params?.search) queryParams.append("search", params.search);
    if (params?.dateRange) queryParams.append("dateRange", params.dateRange);
    if (params?.from) queryParams.append("from", params.from);
    if (params?.to) queryParams.append("to", params.to);
    if (params?.employee_db_id) queryParams.append("employee_db_id", String(params.employee_db_id));
    if (params?.deptId) queryParams.append("deptId", String(params.deptId));
    const qs = queryParams.toString();
    return request(`/attendance/summary${qs ? `?${qs}` : ""}`);
  },

  getEmployees: (params?: {
    page?: number;
    limit?: number;
    search?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append("page", params.page.toString());
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    if (params?.search) queryParams.append("search", params.search);
    const query = queryParams.toString();
    return request(`/employees${query ? `?${query}` : ""}`);
  },

  addEmployee: (data: any) =>
    request("/employees", { method: "POST", body: JSON.stringify(data) }),

  updateEmployee: (id: number | string, data: any) =>
    request(`/employees/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteEmployee: (id: number | string) =>
    request(`/employees/${id}`, { method: "DELETE" }),

  resetEmployeePassword: (id: number | string, newPassword?: string) =>
    request(`/employees/${id}/reset-password`, {
      method: "PUT",
      body: JSON.stringify(newPassword ? { newPassword } : {}),
    }),

  getDepartments: () => request("/departments"),

  getNotifications: (params?: {
    page?: number;
    limit?: number;
    date?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append("page", params.page.toString());
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    if (params?.date) queryParams.append("date", params.date);
    const query = queryParams.toString();
    return request(`/notifications${query ? `?${query}` : ""}`);
  },
  getDepartmentLogsByDepartment: (
    deptId: number,
    params?: {
      page?: number;
      limit?: number;
      dateRange?: string;
      from?: string;
      to?: string;
      source?: SourceMode;
    }
  ) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append("page", params.page.toString());
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    if (params?.dateRange) queryParams.append("dateRange", params.dateRange);
    if (params?.from) queryParams.append("from", params.from);
    if (params?.to) queryParams.append("to", params.to);
    if (params?.source && params.source !== "online") queryParams.append("source", params.source);
    const query = queryParams.toString();
    return request(
      `/departments/${deptId}/logs${query ? `?${query}` : ""}`
    );
  },
  getDepartmentSummary: () => request("/departments/summary"),
  // Server-side Excel export (complete data for the requested window —
  // payroll-safe; never limited by what the table has loaded).
  exportDepartmentLogs: async (opts: {
    deptId?: number;
    dateRange?: string;
    from?: string;
    to?: string;
    label?: string;
    source?: SourceMode;
  } = {}) => {
    const params = new URLSearchParams();
    params.append("type", opts.deptId ? "department" : "all");
    if (opts.deptId) params.append("deptId", opts.deptId.toString());
    if (opts.dateRange) params.append("dateRange", opts.dateRange);
    if (opts.from) params.append("from", opts.from);
    if (opts.to) params.append("to", opts.to);
    if (opts.source && opts.source !== "online") params.append("source", opts.source);
    const res = await fetch(
      `${API_URL}/departments/export?${params.toString()}`,
      { credentials: "include" }
    );
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const sourceTag = opts.source && opts.source !== "online" ? `${opts.source}_` : "";
    link.download =
      opts.label || `DTR_Report_${sourceTag}${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  },

  changePassword: (data: {
    currentPassword: string;
    newPassword: string;
  }) =>
    request("/change-password", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getTime: () => request("/time"),
};