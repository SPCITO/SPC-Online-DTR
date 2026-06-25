const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://spc-dtr-backend.onrender.com/api";

// Helper to get token from localStorage
const getToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('auth_token');
  }
  return null;
};

// Helper to save token
const saveToken = (token: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('auth_token', token);
  }
};

// Helper to remove token
const removeToken = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
  }
};

const request = async (endpoint: string, options: any = {}) => {
  const token = getToken();
  
  // ✅ Add Authorization header if token exists
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  console.log(`API Request: ${endpoint}`, `${API_URL}${endpoint}`);
  
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
      // credentials: "include", // No longer needed for cookies
    });

    console.log(`API Response status: ${res.status}`);

    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    console.log(`API Response data:`, data);

    // ✅ SAVE TOKEN IF LOGIN SUCCESSFUL
    if (endpoint === "/login" && res.ok && data?.token) {
      saveToken(data.token);
      if (data.user) {
        localStorage.setItem('user', JSON.stringify(data.user));
      }
      // Return data without token exposed to components if desired, or keep it
      const { token, ...rest } = data;
      return rest;
    }

    if (!res.ok) {
      if (endpoint === "/logout") {
        removeToken();
        return { success: true };
      }

      if (res.status === 401) {
        removeToken();
        if (typeof window !== 'undefined') {
          window.location.href = "/login";
        }
        return;
      }

      throw new Error(data?.message || "Request failed");
    }

    return data;
  } catch (err: any) {
    console.error("Backend unreachable:", err);
    if (endpoint === "/logout") {
      removeToken();
      return { success: true };
    }
    throw new Error("Backend is unreachable");
  }
};

export const api = {
  login: (data: any) =>
    request("/login", { method: "POST", body: JSON.stringify(data) }),
  
  logout: () => request("/logout", { method: "POST" }),
  
  me: () => request("/me"),
  
  timeIn: (employee_db_id: number) =>
    request("/dtr/time-in", { method: "POST", body: JSON.stringify({ employee_db_id }) }),

  timeOut: (employee_db_id: number) =>
    request("/dtr/time-out", { method: "POST", body: JSON.stringify({ employee_db_id }) }),

  getStatus: (employee_db_id: number) => request(`/time/status/${employee_db_id}`),

  getLogs: (page = 1, limit = 10, search = "") => {
    const queryParams = new URLSearchParams();
    queryParams.append('page', page.toString());
    queryParams.append('limit', limit.toString());
    if (search) queryParams.append('search', search);
    return request(`/logs?${queryParams.toString()}`);
  },
  
  getMyLogs: (employee_db_id: number) => request(`/logs/me/${employee_db_id}`),
  
  getMonthlyLogs: (employee_db_id: number, year: number, month: number) =>
    request(`/monthly/${employee_db_id}/${year}/${month}`),

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

  updateEmployee: (id: number | string, data: any) =>
    request(`/employees/${id}`, { 
      method: "PUT", 
      body: JSON.stringify(data) 
    }),

  deleteEmployee: (id: number | string) =>
    request(`/employees/${id}`, { method: "DELETE" }),

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

  changePassword: (data: { newPassword: string }) =>
    request("/change-password", { method: "POST", body: JSON.stringify(data) }),

  getTime: () => request("/time"),
};