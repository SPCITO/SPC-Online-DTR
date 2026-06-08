const API_URL = "http://localhost:5000/api";

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

    // ❗ Only throw for real errors (NOT logout edge cases)
    if (!res.ok) {
      // allow logout to fail silently
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

    // ❗ IMPORTANT: DO NOT throw for logout
    if (endpoint === "/logout") {
      return { success: true };
    }

    throw new Error("Backend is unreachable");
  }
};

export const api = {
  // 🔐 AUTH
  login: (data: any) =>
    request("/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  logout: () =>
    request("/logout", {
      method: "POST",
    }),

  me: () => request("/me"),
    
  // ⏱️ DTR
  timeIn: async (employee_db_id: number) =>
    request("/dtr/time-in", {
      method: "POST",
      body: JSON.stringify({ employee_db_id }),
    }),

  timeOut: async (employee_db_id: number) =>
    request("/dtr/time-out", {
      method: "POST",
      body: JSON.stringify({ employee_db_id }),
    }),

  // ⏱ STATUS
  getStatus: (employee_db_id: number) =>
    request(`/time/status/${employee_db_id}`),

  // 📊 ALL LOGS
  getLogs: (page = 1) =>
    request(`/logs?page=${page}&limit=10`),

  // 👤 USER LOGS
  getMyLogs: (employee_db_id: number) =>
    request(`/logs/me/${employee_db_id}`),

  // 📅 MONTHLY LOGS
  getMonthlyLogs: (
    employee_db_id: number,
    year: number,
    month: number
  ) =>
    request(`/monthly/${employee_db_id}/${year}/${month}`),

  // 👤 EMPLOYEES
  getEmployees: () => request("/employees"),

  addEmployee: (data: any) =>
    request("/employees", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteEmployee: (id: number) =>
    request(`/employees/${id}`, {
      method: "DELETE",
    }),

  // DEPARTMENTS
  getDepartments: () =>
    request("/departments"),

  getDepartmentLogsByDepartment: (deptId: number) =>
   request(`/departments/${deptId}/logs`),

  getDepartmentSummary: () =>
    request("/departments/summary"),

  // EXPORT
  exportDepartmentLogs: (deptId?: number, dateRange?: string) => {
    const params = new URLSearchParams();
    if (deptId) params.append("deptId", deptId.toString());
    if (dateRange) params.append("dateRange", dateRange);
    return request(`/departments/export${params.toString() ? `?${params.toString()}` : ""}`);
  },

  //CHANGE PASSWORD
  changePassword: (data: {
    newPassword: string;
  }) =>
    request("/change-password", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ⏰ SERVER TIME
  getTime: () => request("/time"),

};