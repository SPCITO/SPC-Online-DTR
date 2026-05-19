"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { LockKeyhole, User, ArrowLeft } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
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

    // fetch real user from backend
    const me = await api.me();

    if (me.role === "admin") {
      router.replace("/admin");
    } else {
      router.replace("/dashboard");
    }

    } catch (err: any) {
      console.error(err);

      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7f5] overflow-hidden flex items-center justify-center px-4">

      {/* BACKGROUND */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-120px] left-[-120px] w-[320px] h-[320px] bg-emerald-300/20 blur-3xl rounded-full" />
        <div className="absolute bottom-[-120px] right-[-120px] w-[340px] h-[340px] bg-green-300/20 blur-3xl rounded-full" />
      </div>

      {/* BACK BUTTON */}
      <button
        onClick={() => (window.location.href = "/")}
        className="
          absolute top-6 left-6 z-20

          flex items-center gap-2

          px-4 py-3

          rounded-2xl

          bg-white/80
          backdrop-blur-xl

          border border-white

          text-slate-700
          font-semibold

          shadow-[0_10px_30px_rgba(0,0,0,0.08)]

          hover:scale-[1.02]

          transition-all duration-300
        "
      >
        <ArrowLeft size={18} />
        Back
      </button>

      {/* LOGIN CARD */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45 }}
        className="
          relative overflow-hidden

          w-full max-w-md

          rounded-[36px]

          bg-white/80
          backdrop-blur-2xl

          border border-white

          p-7 sm:p-8

          shadow-[0_20px_60px_rgba(0,0,0,0.12)]
        "
      >

        {/* TOP GLOW */}
        <div className="absolute inset-x-0 top-0 h-[1px] bg-white/80" />

        {/* LOGO */}
        <div className="text-center">

          <div
            className="
              mx-auto

              w-20 h-20

              rounded-[26px]


              flex items-center justify-center

              mb-5
            "
          >
            <img
              src="/spc logo.png"
              alt="SPC Logo"
              className="w-12 h-12 object-contain"
            />
          </div>

          <p className="text-xs uppercase tracking-[0.22em] text-emerald-700 font-semibold mb-2">
            Employee Portal
          </p>

          <h1 className="text-3xl font-black text-slate-900">
            Welcome Back
          </h1>

          <p className="text-slate-500 mt-2">
            Sign in to continue to your dashboard
          </p>

        </div>

        {/* ERROR */}
        {error && (
          <div
            className="
              mt-6

              rounded-2xl

              border border-red-200

              bg-red-50

              px-4 py-3

              text-sm
              text-red-600
              font-medium
            "
          >
            {error}
          </div>
        )}

        {/* FORM */}
        <div className="mt-7 space-y-5">

          {/* EMPLOYEE ID */}
          <div>

            <label className="text-sm font-semibold text-slate-700 mb-2 block">
              Employee ID
            </label>

            <div
              className="
                flex items-center gap-3

                bg-white

                border border-slate-200

                rounded-2xl

                px-4
                h-[58px]

                shadow-sm

                focus-within:ring-2
                focus-within:ring-emerald-500/20
                focus-within:border-emerald-500

                transition-all
              "
            >
              <User size={18} className="text-slate-400" />

              <input
                type="text"
                placeholder="Enter employee ID"
                value={employee_id}
                onChange={(e) => setId(e.target.value)}
                className="
                  w-full

                  bg-transparent

                  outline-none

                  text-slate-800
                  placeholder:text-slate-400
                "
              />
            </div>

          </div>

          {/* PASSWORD */}
          <div>

            <label className="text-sm font-semibold text-slate-700 mb-2 block">
              Password
            </label>

            <div
              className="
                flex items-center gap-3

                bg-white

                border border-slate-200

                rounded-2xl

                px-4
                h-[58px]

                shadow-sm

                focus-within:ring-2
                focus-within:ring-emerald-500/20
                focus-within:border-emerald-500

                transition-all
              "
            >
              <LockKeyhole
                size={18}
                className="text-slate-400"
              />

              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="
                  w-full

                  bg-transparent

                  outline-none

                  text-slate-800
                  placeholder:text-slate-400
                "
              />
            </div>

          </div>

        </div>

        {/* LOGIN BUTTON */}
        <motion.button
          whileHover={{ scale: loading ? 1 : 1.02 }}
          whileTap={{ scale: loading ? 1 : 0.98 }}
          onClick={handleLogin}
          disabled={loading}
          className={`
            mt-7

            w-full
            h-[58px]

            rounded-2xl

            text-white
            font-bold

            shadow-[0_15px_40px_rgba(15,23,42,0.22)]

            transition-all duration-300

            ${
              loading
                ? "bg-slate-400 cursor-not-allowed"
                : `
                  bg-gradient-to-r
                  from-emerald-600
                  to-green-700

                  hover:shadow-[0_20px_50px_rgba(34,197,94,0.35)]
                `
            }
          `}
        >
          {loading ? "Signing In..." : "Login"}
        </motion.button>

      </motion.div>

    </div>
  );
}