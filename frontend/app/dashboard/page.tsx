"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { logout } from "@/lib/auth";
import { LogOut, Clock, Activity } from "lucide-react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [status, setStatus] = useState<"IN" | "OUT">("OUT");
  const [timeIn, setTimeIn] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState("");
  const [workDuration, setWorkDuration] = useState("00:00:00");
  const [loading, setLoading] = useState(false);

  // LOAD USER
  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
  }, []);

  // REAL-TIME CLOCK (SMOOTH)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await api.getTime();
        setCurrentTime(new Date(res.time).toLocaleTimeString());
      } catch {}
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // REAL-TIME STATUS (FAST REFRESH)
  const checkStatus = async () => {
    if (!user) return;

    try {
      const res = await api.getStatus(user.employee_id);
      setStatus(res.status);
      setTimeIn(res.time_in);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (user) {
      checkStatus();

      const interval = setInterval(checkStatus, 3000); // 🔥 faster refresh
      return () => clearInterval(interval);
    }
  }, [user]);

  // LIVE WORK TIMER
  useEffect(() => {
    if (!timeIn) return;

    const interval = setInterval(() => {
      const diff = new Date().getTime() - new Date(timeIn).getTime();

      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);

      setWorkDuration(
        `${String(hrs).padStart(2, "0")}:${String(mins).padStart(
          2,
          "0"
        )}:${String(secs).padStart(2, "0")}`
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [timeIn]);

  // ACTIONS WITH LOADING
  const handleTimeIn = async () => {
    setLoading(true);
    await api.timeIn(user.employee_id);
    await checkStatus();
    setLoading(false);
  };

  const handleTimeOut = async () => {
    setLoading(true);
    await api.timeOut(user.employee_id);
    await checkStatus();
    setLoading(false);
  };

  if (!user) return null;



  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* 🟢 HEADER */}
      <div className="bg-gradient-to-r from-green-900 via-green-800 to-green-700 pt-12 pb-44 px-6 shadow-xl relative">

        <div className="max-w-5xl mx-auto">

          {/* GLASS HEADER */}
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-lg flex justify-between items-center">

            <div>
              <h1 className="text-3xl font-bold text-white">
                Welcome, {user.name}
              </h1>
              <p className="text-green-200 text-sm">
                {user.employee_id}
              </p>
            </div>

            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2 rounded-xl 
                        bg-white/10 hover:bg-red-500/20 
                        border border-white/20 text-white transition"
            >
              <LogOut size={16} />
              Logout
            </motion.button>

          </div>

         <div className="relative mt-10">

        <div
          className="
            absolute left-1/2 -translate-x-1/2 translate-y-1/2
            w-full max-w-4xl
            bg-white/15 backdrop-blur-2xl
            border border-white/20
            rounded-3xl shadow-2xl
            px-8 py-6
            flex flex-wrap justify-between items-center gap-6 
          "
        >

          {/* CURRENT TIME */}
          <div>
            <p className="text-green-200 text-sm">Current Time</p>
            <h2 className="text-2xl font-bold text-white">
              {currentTime}
            </h2>
          </div>

          {/* STATUS */}
          <div className="flex items-center gap-3">
            <span
              className={`w-3 h-3 rounded-full animate-pulse ${
                status === "IN" ? "bg-green-400" : "bg-red-400"
              }`}
            />
            <div>
              <p className="text-green-200 text-sm">Status</p>
              <h2 className="text-2xl font-bold text-white">
                {status}
              </h2>
            </div>
          </div>

          {/* WORK TIMER */}
          {status === "IN" && (
            <div>
              <p className="text-green-200 text-sm">Working</p>
              <h2 className="text-2xl font-bold text-white">
                {workDuration}
              </h2>
            </div>
          )}

        </div>

      </div>
        </div>
      </div>

      <div className="h-12"></div>

      {/* 🧩 MAIN */}
      <div className="flex-1 flex justify-center px-6 -mt-5 pb-24">

        <div className="w-full max-w-5xl space-y-8">

          {/* 🟩 ACTION CARD */}
          <div className="bg-white rounded-3xl shadow-2xl p-8 transition border border-gray-100 hover:shadow-2xl">

            <h3 className="text-lg font-semibold text-gray-700 mb-6">
              Attendance Actions
            </h3>

            <div className="grid grid-cols-2 gap-6">

              {/* TIME IN */}
              <motion.button
                whileHover={{ scale: status !== "IN" ? 1.03 : 1 }}
                whileTap={{ scale: status !== "IN" ? 0.95 : 1 }}
                onClick={async () => {
                  try {
                    setLoading(true);
                    await handleTimeIn();
                    toast.success("Time In recorded!");
                  } catch {
                    toast.error("Failed to Time In");
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={status === "IN" || loading}
                className={`
                  py-5 rounded-2xl font-semibold text-lg transition-all
                  shadow-lg border backdrop-blur-md
                  ${
                    status === "IN"
                      ? "bg-gray-200 text-gray-500 cursor-not-allowed border-gray-300"
                      : "bg-gradient-to-br from-green-500 to-green-600 text-white border-green-400 hover:shadow-xl"
                  }
                `}
              >
                {loading ? "Processing..." : status === "IN" ? "Already Timed In" : "Time In"}
              </motion.button>

              {/* TIME OUT */}
              <motion.button
                whileHover={{ scale: status !== "OUT" ? 1.03 : 1 }}
                whileTap={{ scale: status !== "OUT" ? 0.95 : 1 }}
                onClick={async () => {
                  try {
                    setLoading(true);
                    await handleTimeOut();
                    toast.success("Time Out recorded!");
                  } catch {
                    toast.error("Failed to Time Out");
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={status === "OUT" || loading}
                className={`
                  py-5 rounded-2xl font-semibold text-lg transition-all
                  shadow-lg border backdrop-blur-md
                  ${
                    status === "OUT"
                      ? "bg-gray-200 text-gray-500 cursor-not-allowed border-gray-300"
                      : "bg-gradient-to-br from-red-500 to-red-600 text-white border-red-400 hover:shadow-xl"
                  }
                `}
              >
                {loading ? "Processing..." : status === "OUT" ? "Not Timed In" : "Time Out"}
              </motion.button>

            </div>
          </div>

          {/* 🧭 NAVIGATION */}
          <div className="grid md:grid-cols-2 gap-6">

            {/* LOGS */}
            <motion.div
              whileHover={{ y: -6 }}
              className="bg-white p-6 rounded-2xl shadow-lg border cursor-pointer hover:shadow-xl transition"
              onClick={() => (window.location.href = "/dashboard/logs")}
            >
              <p className="text-sm text-gray-500">
                Attendance Records
              </p>
              <h3 className="text-lg font-semibold text-green-800">
                View My Logs →
              </h3>
            </motion.div>

            {/* MONTHLY */}
            <motion.div
              whileHover={{ y: -6 }}
              className="bg-white p-6 rounded-2xl shadow-lg border cursor-pointer hover:shadow-xl transition"
              onClick={() =>
                (window.location.href = "/dashboard/monthly")
              }
            >
              <p className="text-sm text-gray-500">
                Performance Overview
              </p>
              <h3 className="text-lg font-semibold text-green-800">
                Monthly Summary →
              </h3>
            </motion.div>

          </div>

        </div>
      </div>
    </div>
  );
}