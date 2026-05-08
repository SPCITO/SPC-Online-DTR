const API_URL = "http://localhost:5000/api";

// 🔑 Get token from cookies
const getToken = () => {
  if (typeof document === "undefined") return null;

  const cookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith("token="));

  return cookie ? cookie.split("=")[1] : null;
};

// 🔧 Generic request helper (IMPROVED)
const request = async (endpoint: string, options: any = {}) => {
  const token = getToken();

  // 🚨 Prevent requests without token (except login)
  if (!token && endpoint !== "/login") {
    console.warn("⚠️ No token found. Blocking request:", endpoint);
    throw new Error("Not authenticated");
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await res.text();

  console.log(`📡 API [${endpoint}] →`, text);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    console.error("❌ API ERROR:", data);

    // 🚨 Handle invalid token globally
    if (data?.message === "Invalid token" || data?.message === "No token provided") {
      console.warn("🔐 Token expired or invalid → logging out");

      localStorage.clear();
      document.cookie = "token=; Max-Age=0; path=/";

      window.location.href = "/login";
    }

    throw new Error(data?.message || "Something went wrong");
  }

  return data;
};

export const api = {
  // 🔐 AUTH
  login: (data: any) =>
    request("/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ⏱️ DTR
  timeIn: (employee_id: string) =>
    request("/time/in", {
      method: "POST",
      body: JSON.stringify({ employee_id }),
    }),

  timeOut: (employee_id: string) =>
    request("/time/out", {
      method: "POST",
      body: JSON.stringify({ employee_id }),
    }),

  // ⏱ STATUS
  getStatus: (employee_id: string) =>
    request(`/time/status/${employee_id}`),

  // 📊 ALL LOGS
  getLogs: (page = 1) =>
    request(`/logs?page=${page}&limit=10`),

  // 👤 USER LOGS
  getMyLogs: (employee_id: string) =>
    request(`/logs/me/${employee_id}`),

  // 📅 MONTHLY LOGS
  getMonthlyLogs: (employee_id: string, year: number, month: number) =>
    request(`/monthly/${employee_id}/${year}/${month}`),

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

  // ⏰ SERVER TIME
  getTime: () => request("/time"),
};