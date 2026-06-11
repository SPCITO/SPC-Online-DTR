const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

// ✅ 1. DEFINE REQUEST HELPER FIRST
const request = async (endpoint: string, options: any = {}) => {
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      if (endpoint === "/logout") {
        return { success: true };
      }

      if (res.status === 401) {
        localStorage.removeItem("user");
        window.location.href = "/login";
        return;
      }

      throw new Error(data?.message || "Request failed");
    }

    return data;
  } catch (err: any) {
    console.error("Backend unreachable:", err);

    if (endpoint === "/logout") {
      return { success: true };
    }

    throw new Error("Backend is unreachable");
  }
};

// ✅ 2. DEFINE API OBJECT
export const api = {
  // 🔐 AUTH
  login: (data: any) =>
    request("/login", { method: "POST", body: JSON.stringify(data) }),

  logout: () => request("/logout", { method: "POST" }),

  me: () => request("/me"),

  // ⏱️ DTR
  timeIn: (employee_db_id: number) =>
    request("/dtr/time-in", { method: "POST", body: JSON.stringify({ employee_db_id }) }),

  timeOut: (employee_db_id: number) =>
    request("/dtr/time-out", { method: "POST", body: JSON.stringify({ employee_db_id }) }),

  getStatus: (employee_db_id: number) => request(`/time/status/${employee_db_id}`),

  // 📊 LOGS
  getLogs: (page = 1, limit = 10) => request(`/logs?page=${page}&limit=${limit}`),
  getMyLogs: (employee_db_id: number) => request(`/logs/me/${employee_db_id}`),
  getMonthlyLogs: (employee_db_id: number, year: number, month: number) =>
    request(`/monthly/${employee_db_id}/${year}/${month}`),

  // 👤 EMPLOYEES
  // Updated to handle pagination object
  getEmployees: (params?: { page?: number; limit?: number; search?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);
    const query = queryParams.toString();
    return request(`/employees${query ? `?${query}` : ''}`);
  },

  addEmployee: (data: any) =>
    request("/employees", { method: "POST", body: JSON.stringify(data) }),

  // ✅ NEW: Update Employee (Fixes the TS error)
  updateEmployee: (id: number | string, data: any) =>
    request(`/employees/${id}`, { 
      method: "PUT", 
      body: JSON.stringify(data) 
    }),

  // ✅ NEW: Delete Employee (Fixes the TS error)
  deleteEmployee: (id: number | string) =>
    request(`/employees/${id}`, { method: "DELETE" }),

  // 🏢 DEPARTMENTS
  getDepartments: () => request("/departments"),
  getDepartmentLogsByDepartment: (deptId: number) =>
    request(`/departments/${deptId}/logs`),
  getDepartmentSummary: () => request("/departments/summary"),
  exportDepartmentLogs: (deptId?: number, dateRange?: string) => {
    const params = new URLSearchParams();
    if (deptId) params.append("deptId", deptId.toString());
    if (dateRange) params.append("dateRange", dateRange);
    return request(`/departments/export${params.toString() ? `?${params.toString()}` : ""}`);
  },

  // 🔒 PASSWORD
  changePassword: (data: { newPassword: string }) =>
    request("/change-password", { method: "POST", body: JSON.stringify(data) }),

  // ⏰ SERVER TIME
  getTime: () => request("/time"),
};