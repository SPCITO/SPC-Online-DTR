const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://spc-dtr-backend.onrender.com/api";

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
        if (!isAuthCheck && typeof window !== "undefined") {
          window.location.href = "/login";
        }
        return null;
      }

      throw new Error(data?.message || "Request failed");
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

  timeIn: (employee_db_id: number) =>
    request("/dtr/time-in", {
      method: "POST",
      body: JSON.stringify({ employee_db_id }),
    }),

  timeOut: (employee_db_id: number) =>
    request("/dtr/time-out", {
      method: "POST",
      body: JSON.stringify({ employee_db_id }),
    }),

  getStatus: (employee_db_id: number) =>
    request(`/time/status/${employee_db_id}`),

  getLogs: (page = 1, limit = 50, search = "") => {
    const queryParams = new URLSearchParams();
    queryParams.append("page", page.toString());
    queryParams.append("limit", limit.toString());
    if (search) queryParams.append("search", search);
    return request(`/logs?${queryParams.toString()}`);
  },

  getAdminStats: () => request("/admin/stats"),

  getMyLogs: (employee_db_id: number) =>
    request(`/logs/me/${employee_db_id}`),

  getMonthlyLogs: (
    employee_db_id: number,
    year: number,
    month: number
  ) => request(`/monthly/${employee_db_id}/${year}/${month}`),

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
  getDepartmentLogsByDepartment: (deptId: number) =>
    request(`/departments/${deptId}/logs`),
  getDepartmentSummary: () => request("/departments/summary"),
  exportDepartmentLogs: (deptId?: number, dateRange?: string) => {
    const params = new URLSearchParams();
    if (deptId) params.append("deptId", deptId.toString());
    if (dateRange) params.append("dateRange", dateRange);
    return request(
      `/departments/export${params.toString() ? `?${params.toString()}` : ""}`
    );
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