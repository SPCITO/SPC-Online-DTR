"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {
  LogOut,
  Clock3,
  Timer,
  CalendarDays,
  Activity,
} from "lucide-react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";

export default function Dashboard() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const { user } = useAuth();

  const router = useRouter();

  const [status, setStatus] = useState<"IN" | "OUT">("OUT");
  const [timeIn, setTimeIn] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState("");
  const [currentDate, setCurrentDate] = useState("");
  const [staleFrom, setStaleFrom] = useState<string | null>(null);
  // Open day of the current session (any), and whether it started on a
  // previous day (a forgotten Time Out — never blocks the next Time In).
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [previousDay, setPreviousDay] = useState(false);
  // Days with records that have no Time Out (need the DTR Correction Form).
  const [noTimeoutDays, setNoTimeoutDays] = useState<string[]>([]);
  const [workDuration, setWorkDuration] = useState("00:00:00");
  const [loading, setLoading] = useState(false);
  // True once the first status check has resolved — prevents the UI from
  // briefly showing the wrong attendance state on mount.
  const [statusReady, setStatusReady] = useState(false);

  // Ref to avoid stale closures in polling
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);


  //FIRST-LOGIN PASSWORD RESET CHECK 
  useEffect(() => {
    if (user) {
      if (user.mustChangePassword) {
        router.replace("/change-password");
      }
    }
  }, [user, router]);

  //LOGOUT FUNCTION
  const logout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.warn("Logout request failed");
    }

    // Full-page redirect resets auth context/CSRF state — avoids the login
    // page bouncing a stale user back to the dashboard (401 redirect loop).
    window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/login`;
  };

  // REAL-TIME CLOCK — sync with server once, then tick locally
  useEffect(() => {
    let serverOffset = 0;
    let tickInterval: ReturnType<typeof setInterval> | null = null;

    const syncAndTick = async () => {
      try {
        const res = await api.getTime();
        const serverTime = new Date(res.time).getTime();
        serverOffset = serverTime - Date.now();
      } catch {
        // If sync fails, use local time (offset = 0)
        serverOffset = 0;
      }

      const updateDisplay = () => {
        const now = new Date(Date.now() + serverOffset);
        setCurrentTime(
          now.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        );
        setCurrentDate(
          now.toLocaleDateString([], {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        );
      };

      // Update immediately, then every second locally (no network request)
      updateDisplay();
      tickInterval = setInterval(updateDisplay, 1000);
    };

    syncAndTick();

    return () => {
      if (tickInterval) clearInterval(tickInterval);
    };
  }, []);

  // STATUS CHECK
  const checkStatus = async () => {
    if (!user) return;

    try {
      const res = await api.getStatus(user.employee_db_id);
      setStatus(res.status);
      setTimeIn(res.time_in);
      setStaleFrom(res.status === "IN" && res.stale ? res.open_from : null);
      setOpenDay(res.status === "IN" ? res.open_from : null);
      setPreviousDay(res.status === "IN" && res.previous_day === true);
      setNoTimeoutDays(
        Array.isArray(res.no_timeout_days) ? res.no_timeout_days : []
      );
    } catch (err) {
      console.warn("Status check failed");
    } finally {
      setStatusReady(true);
    }
  };

  useEffect(() => {
    if (!user) return;

    let active = true;

    const poll = async () => {
      if (!active) return;
      await checkStatus();
      // Adaptive: poll every 30s when IN, every 60s when OUT
      const interval = statusRef.current === "IN" ? 30000 : 60000;
      if (active) {
        setTimeout(poll, interval);
      }
    };

    // Initial check immediately
    poll();

    return () => {
      active = false;
    };
  }, [user]);

  // LIVE WORK TIMER
  useEffect(() => {
    if (!timeIn) return;

    const interval = setInterval(() => {
      // Clamp at 0 — slight client/server clock skew must not render a
      // negative duration (e.g. "-1:-1:-1") for a just-created session.
      const diff = Math.max(
        0,
        new Date().getTime() - new Date(timeIn).getTime()
      );

      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);

      setWorkDuration(
        `${String(hrs).padStart(2, "0")}:${String(
          mins
        ).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [timeIn]);

  // ACTIONS
  const handleTimeIn = async () => {
    if (!user) return;

    try {
      setLoading(true);

      let res: any;
      try {
        res = await api.timeIn(user.employee_db_id);
      } catch (err: any) {
        if (!err?.data?.previous_day_pending) throw err;
        // Open record from a previous day, still within its 24-hour
        // window — could be a live overnight shift or a forgotten Time
        // Out. Only the employee knows which; ask before abandoning it.
        const go = confirm(
          `You have an open session from ${err.data.day} with no Time Out recorded.\n\n` +
            "• If you FORGOT to time out — press OK to start today's session. " +
            "That record stays blank \"No Time Out\" and must be corrected via a " +
            "DTR Correction Form with the Payroll Department.\n" +
            "• If your shift is still ongoing — press Cancel and use Time Out instead."
        );
        if (!go) return;
        res = await api.timeIn(user.employee_db_id, { abandonOpen: true });
      }

      if (res?.abandoned_previous_days?.length) {
        toast.success(
          "Time In recorded. Your earlier record(s) stay blank \"No Time Out\" — " +
            "please accomplish a DTR Correction Form with Payroll for those day(s).",
          { duration: 10000 }
        );
      } else {
        toast.success("Time In successful");
      }

      await checkStatus();
    } catch (err: any) {
      toast.error(err?.message || "Time In failed");
    } finally {
      setLoading(false);
    }
  };

  const handleTimeOut = async () => {
    if (!user) return;

    // A previous-day session still within its window may be a forgotten
    // Time Out rather than a real shift end — recording "now" would credit
    // hours nobody worked. Make sure before writing anything.
    if (status === "IN" && previousDay && !staleFrom) {
      const go = confirm(
        `You are about to record a Time Out for the session from ${openDay}.\n\n` +
          "• If your shift is still ongoing — press OK to record the Time Out now.\n" +
          "• If you FORGOT to time out that day — press Cancel and use \"Time In (New Day)\" " +
          "instead. That record stays blank \"No Time Out\" and must be corrected via a " +
          "DTR Correction Form with the Payroll Department."
      );
      if (!go) return;
    }

    try {
      setLoading(true);

      const res: any = await api.timeOut(user.employee_db_id);

      if (res?.auto_closed) {
        // Forgotten session from a previous day — closed at its day
        // boundary (not "now"), so no multi-day duration is manufactured.
        toast(res.message, { icon: "⚠️", duration: 8000 });
      } else {
        toast.success("Time Out successful");
      }

      await checkStatus();
    } catch (err: any) {
      toast.error(err?.message || "Time Out failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f7f4] overflow-x-hidden">

      {/* BACKGROUND EFFECTS */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-120px] left-[-120px] w-[320px] h-[320px] bg-green-300/20 blur-3xl rounded-full" />
        <div className="absolute bottom-[-120px] right-[-120px] w-[320px] h-[320px] bg-emerald-300/20 blur-3xl rounded-full" />
      </div>

      {/* HERO */}
        <div className="relative px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">

          <div className="max-w-6xl mx-auto">

            {/* TOP HEADER */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="
                relative overflow-hidden

                bg-white/85
                backdrop-blur-2xl

                border border-white/70

                rounded-[34px]

                px-5 sm:px-7
                py-5 sm:py-6

                flex flex-col sm:flex-row
                gap-5
                sm:items-center
                justify-between

                shadow-[0_12px_45px_rgba(0,0,0,0.08)]
              "
            >

              {/* LIGHT EFFECT */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/70 via-transparent to-green-100/40 pointer-events-none" />

              {/* USER */}
              <div className="relative min-w-0 z-10">

                <p className="text-xs tracking-[0.22em] uppercase text-green-700/70 mb-2 font-semibold">
                  Employee Dashboard
                </p>

                <h1
                  className="
                    text-[28px] sm:text-4xl
                    font-black
                    text-gray-900
                    leading-tight
                    break-words
                  "
                >
                  Welcome, {user.name}
                </h1>

                <p className="text-gray-500 mt-2 text-sm font-medium">
                  Employee ID: {user.employee_db_id}
                </p>

              </div>

              {/* ADMIN ACCESS */}
              {user.role === "admin" && (
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => router.push("/admin")}
                  className="
                    px-5 py-3
                    rounded-2xl
                    bg-emerald-500/20
                    border border-emerald-400/30
                    text-emerald-300
                    font-semibold
                    hover:bg-emerald-500/30
                    transition
                  "
                >
                  Open Admin Panel
                </motion.button>
              )}

              {/* LOGOUT */}
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={logout}
                className="
                  relative z-10

                  flex items-center justify-center gap-2

                  px-5 py-3

                  rounded-2xl

                  bg-gray-900
                  hover:bg-red-500

                  text-white
                  font-semibold

                  transition-all duration-300

                  shadow-lg

                  w-full sm:w-auto
                "
              >
                <LogOut size={16} />
                Logout
              </motion.button>

            </motion.div>

            {/* DIGITAL CLOCK CARD */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="mt-7"
            >

              <div
                className="
                  relative overflow-hidden

                  bg-gradient-to-br
                  from-[#0f172a]
                  via-[#111827]
                  to-[#052e16]

                  rounded-[38px]

                  border border-white/10

                  shadow-[0_20px_70px_rgba(0,0,0,0.18)]

                  p-5 sm:p-7 lg:p-8
                "
              >

                {/* GLOW */}
                <div className="absolute top-[-100px] right-[-100px] w-[220px] h-[220px] bg-green-400/20 blur-3xl rounded-full" />

                <div
                  className="
                    relative

                    grid lg:grid-cols-[1.35fr_0.85fr]
                    gap-6 lg:gap-8
                    items-center
                  "
                >

                  {/* CLOCK SIDE */}
                  <div className="flex flex-col items-center lg:items-start">

                    {/* LABEL */}
                    <div
                      className="
                        flex items-center gap-2

                        text-green-200/80
                        text-xs sm:text-sm
                        tracking-[0.24em]
                        uppercase

                        mb-5
                      "
                    >
                      <Clock3 size={16} />
                      Live Company Time
                    </div>

                    {/* DIGITAL CLOCK */}
                    <div className="flex items-center justify-center flex-wrap gap-2 sm:gap-3">

                      {currentTime.replace(" ", "").split("").map((char, index) => (

                        <div key={index}>

                          {char === ":" ? (

                            <div
                              className="
                                text-white/70
                                font-black

                                text-[34px]
                                sm:text-[44px]
                                md:text-[52px]

                                px-1
                              "
                            >
                              :
                            </div>

                          ) : (

                            <div
                              className="
                                relative

                                w-[48px]
                                sm:w-[62px]
                                md:w-[72px]

                                h-[68px]
                                sm:h-[84px]
                                md:h-[96px]

                                rounded-[20px]

                                bg-white/10
                                backdrop-blur-xl

                                border border-white/10

                                flex items-center justify-center

                                shadow-[0_10px_30px_rgba(0,0,0,0.25)]

                                overflow-hidden
                              "
                            >

                              {/* INNER LIGHT */}
                              <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />

                              <span
                                className="
                                  relative z-10

                                  text-white

                                  font-black

                                  text-[30px]
                                  sm:text-[40px]
                                  md:text-[48px]

                                  tracking-[-0.05em]
                                "
                                style={{
                                  fontVariantNumeric: "tabular-nums",
                                }}
                              >
                                {char}
                              </span>

                            </div>

                          )}

                        </div>

                      ))}

                    </div>

                    {/* DATE */}
                    <div
                      className="
                        mt-5

                        flex items-center gap-2

                        text-green-100/80
                        text-sm sm:text-base
                        font-medium

                        text-center lg:text-left
                      "
                    >
                      <CalendarDays size={18} />
                      {currentDate}
                    </div>

                  </div>

                  {/* STATUS SIDE */}
                  <div className="grid gap-4">

                    {/* STATUS */}
                    <div
                      className="
                        rounded-[28px]

                        bg-white/10
                        backdrop-blur-xl

                        border border-white/10

                        p-5
                      "
                    >

                      <div className="flex items-center gap-3">

                        <span
                          className={`w-3.5 h-3.5 rounded-full animate-pulse ${
                            status === "IN"
                              ? "bg-green-400"
                              : "bg-red-400"
                          }`}
                        />

                        <p className="text-white/60 text-xs uppercase tracking-[0.22em]">
                          Attendance Status
                        </p>

                      </div>

                      <h2
                        className={`
                          mt-3
                          text-4xl
                          font-black

                          ${
                            status === "IN"
                              ? "text-green-300"
                              : "text-red-300"
                          }
                        `}
                      >
                        {status}
                      </h2>

                      {status === "IN" && staleFrom && (
                        <p className="mt-2 text-xs text-amber-300/90 leading-relaxed">
                          Open since {staleFrom} — the 24-hour time-out period
                          has passed. This record is now marked "No Time Out"
                          and can no longer be timed out — but you can still
                          Time In for your new shift below. For the missed
                          record, please file a DTR Correction Form with the
                          Payroll Department.
                        </p>
                      )}

                      {status === "IN" && !staleFrom && previousDay && (
                        <p className="mt-2 text-xs text-amber-300/90 leading-relaxed">
                          Open since {openDay} — if you forgot to Time Out,
                          use "Time In (New Day)" below to start today's
                          session; the earlier record stays blank "No Time
                          Out" and must be corrected via a DTR Correction
                          Form with the Payroll Department. If your shift is
                          still ongoing, use Time Out instead.
                        </p>
                      )}

                      {noTimeoutDays.filter((d) => d !== openDay).length > 0 && (
                        <p className="mt-2 text-xs text-amber-200/80 leading-relaxed">
                          Record(s) with no Time Out:{" "}
                          {noTimeoutDays.filter((d) => d !== openDay).join(", ")} —
                          these show blank hours and need a DTR Correction Form
                          with the Payroll Department.
                        </p>
                      )}

                    </div>

                    {/* WORK TIMER */}
                    <div
                      className="
                        rounded-[28px]

                        bg-white/10
                        backdrop-blur-xl

                        border border-white/10

                        p-5
                      "
                    >

                      <div className="flex items-center gap-2 text-white/60 text-xs uppercase tracking-[0.22em]">
                        <Timer size={16} />
                        Working Duration
                      </div>

                      <h2
                        className="
                          mt-3

                          text-3xl sm:text-4xl
                          font-black
                          text-white

                          tracking-tight
                        "
                        style={{
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {status === "IN"
                          ? workDuration
                          : "00:00:00"}
                      </h2>

                    </div>

                    {/* SYSTEM */}
                    <div
                      className="
                        rounded-[28px]

                        bg-gradient-to-r
                        from-green-500/10
                        to-emerald-500/10

                        border border-green-300/10

                        p-5
                      "
                    >

                      <div className="flex items-center gap-2 text-green-100 text-xs uppercase tracking-[0.22em]">
                        <Activity size={16} />
                        System Activity
                      </div>

                      <p className="text-white/75 mt-3 leading-relaxed text-sm">
                        Your attendance is securely tracked in
                        real-time with automated server syncing.
                      </p>

                    </div>

                  </div>

                </div>

              </div>

            </motion.div>

          </div>

        </div>

        {/* SPACING */}
        <div className="h-10 sm:h-12" />

      {/* MAIN CONTENT */}
      <div className="relative px-4 sm:px-6 lg:px-8 pb-20">

        <div className="max-w-6xl mx-auto space-y-7">

          {/* ACTIONS */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="
              bg-white/95
              backdrop-blur-xl

              rounded-[32px]

              border border-white

              shadow-[0_12px_50px_rgba(0,0,0,0.08)]

              p-5 sm:p-7 lg:p-8
            "
          >

            <div className="mb-7">

              <p className="text-xs uppercase tracking-[0.22em] text-gray-400 mb-2">
                Quick Actions
              </p>

              <h2 className="text-2xl sm:text-3xl font-black text-gray-800">
                Attendance Actions
              </h2>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

              {/* TIME IN */}
              <motion.button
                whileHover={{
                  scale: status === "IN" && !previousDay ? 1 : 1.02,
                }}
                whileTap={{
                  scale: status === "IN" && !previousDay ? 1 : 0.98,
                }}
                onClick={async () => {
                  try {
                    setLoading(true);
                    await handleTimeIn();
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={
                  !statusReady || (status === "IN" && !previousDay) || loading
                }
                className={`
                  min-h-[90px]

                  rounded-[28px]

                  text-lg font-bold

                  border

                  transition-all duration-300

                  ${
                    status === "IN" && !previousDay
                      ? "bg-gray-200 text-gray-500 border-gray-300"
                      : `
                        bg-gradient-to-br from-green-500 to-green-600
                        text-white
                        border-green-400
                        shadow-[0_10px_30px_rgba(34,197,94,0.30)]
                        hover:shadow-[0_15px_40px_rgba(34,197,94,0.40)]
                      `
                  }
                `}
              >
                {loading
                  ? "Processing..."
                  : status === "IN"
                  ? previousDay
                    ? "Time In (New Day)"
                    : "Already Timed In"
                  : "Time In"}
              </motion.button>

              {/* TIME OUT */}
              <motion.button
                whileHover={{
                  scale: status !== "OUT" ? 1.02 : 1,
                }}
                whileTap={{
                  scale: status !== "OUT" ? 0.98 : 1,
                }}
                onClick={async () => {
                  try {
                    setLoading(true);
                    await handleTimeOut();
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={!statusReady || status === "OUT" || loading || !!staleFrom}
                className={`
                  min-h-[90px]

                  rounded-[28px]

                  text-lg font-bold

                  border

                  transition-all duration-300

                  ${
                    status === "OUT" || staleFrom
                      ? "bg-gray-200 text-gray-500 border-gray-300"
                      : `
                        bg-gradient-to-br from-red-500 to-red-600
                        text-white
                        border-red-400
                        shadow-[0_10px_30px_rgba(239,68,68,0.30)]
                        hover:shadow-[0_15px_40px_rgba(239,68,68,0.40)]
                      `
                  }
                `}
              >
                {loading
                  ? "Processing..."
                  : status === "OUT"
                  ? "Not Timed In"
                  : staleFrom
                  ? "No Time Out"
                  : "Time Out"}
              </motion.button>

            </div>

          </motion.div>

          {/* NAVIGATION */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* LOGS */}
            <motion.div
              whileHover={{ y: -5 }}
              className="
                group

                bg-white/95

                rounded-[32px]

                border border-white

                p-6 sm:p-7

                shadow-[0_10px_40px_rgba(0,0,0,0.06)]

                cursor-pointer

                hover:shadow-[0_16px_50px_rgba(0,0,0,0.10)]

                transition-all duration-300
              "
              onClick={() => router.push("/dashboard/logs")}
            >

              <p className="text-xs uppercase tracking-[0.2em] text-gray-400 mb-2">
                Attendance Records
              </p>

              <div className="flex items-center justify-between">

                <h3 className="text-2xl font-black text-green-900">
                  View My Logs
                </h3>

                <span className="text-green-700 text-2xl group-hover:translate-x-1 transition-transform">
                  →
                </span>

              </div>

            </motion.div>

            {/* MONTHLY */}
            <motion.div
              whileHover={{ y: -5 }}
              className="
                group

                bg-white/95

                rounded-[32px]

                border border-white

                p-6 sm:p-7

                shadow-[0_10px_40px_rgba(0,0,0,0.06)]

                cursor-pointer

                hover:shadow-[0_16px_50px_rgba(0,0,0,0.10)]

                transition-all duration-300
              "
              onClick={() => router.push("/dashboard/monthly")}
            >

              <p className="text-xs uppercase tracking-[0.2em] text-gray-400 mb-2">
                Performance Overview
              </p>

              <div className="flex items-center justify-between">

                <h3 className="text-2xl font-black text-green-900">
                  Monthly Summary
                </h3>

                <span className="text-green-700 text-2xl group-hover:translate-x-1 transition-transform">
                  →
                </span>

              </div>

            </motion.div>

          </div>

        </div>

      </div>
    </div>
  );
}