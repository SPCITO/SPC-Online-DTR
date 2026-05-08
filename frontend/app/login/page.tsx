"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";

export default function LoginPage() {
  const [employee_id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!employee_id || !password) {
      setError("Please fill in all fields");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const data = await api.login({
        employee_id,
        password,
      });

      // store token
      document.cookie = `token=${data.token}; path=/`;

      // store user
      localStorage.setItem("user", JSON.stringify(data.user));

      window.location.href = "/dashboard";
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-800 via-green-700 to-green-600 px-4">
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="bg-white/95 backdrop-blur-xl p-8 rounded-3xl shadow-2xl w-full max-w-md border border-white/40"
      >
        <div className="text-center mb-6">
          <img src="/spc logo.png" className="w-14 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-green-800">
            Employee Login
          </h1>
          <p className="text-sm text-gray-500">San Pablo Colleges</p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-100 p-2 rounded-lg">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Employee ID"
            value={employee_id}
            className="w-full p-3 rounded-xl border border-gray-300 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
            onChange={(e) => setId(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            className="w-full p-3 rounded-xl border border-gray-300 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          className={`w-full mt-6 p-3 rounded-xl font-semibold text-white transition shadow-lg
            ${
              loading
                ? "bg-green-400 cursor-not-allowed"
                : "bg-green-700 hover:bg-green-800 hover:shadow-xl active:scale-95"
            }`}
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </motion.div>
    </div>
  );
}