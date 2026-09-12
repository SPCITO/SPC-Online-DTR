"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ShieldX, ArrowLeft, Home } from "lucide-react";

export default function ForbiddenPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#f4f7f5] overflow-x-hidden flex items-center justify-center p-4 sm:p-6">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] bg-red-200/20 blur-3xl rounded-full" />
        <div className="absolute bottom-[-100px] right-[-100px] w-[500px] h-[500px] bg-orange-200/20 blur-3xl rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="
          relative
          w-full max-w-md
          rounded-[36px]
          bg-white/80
          backdrop-blur-2xl
          border border-white/70
          shadow-[0_15px_50px_rgba(0,0,0,0.08)]
          p-8 sm:p-12
          text-center
        "
      >
        {/* Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="
            mx-auto mb-6
            w-20 h-20
            rounded-full
            bg-red-50
            border-2 border-red-100
            flex items-center justify-center
          "
        >
          <ShieldX className="w-10 h-10 text-red-500" />
        </motion.div>

        {/* Error Code */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-7xl sm:text-8xl font-black text-slate-900 tracking-tight mb-2"
        >
          403
        </motion.p>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-2xl sm:text-3xl font-bold text-slate-800 mb-3"
        >
          Access Denied
        </motion.h1>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-slate-500 text-sm sm:text-base mb-8 leading-relaxed"
        >
          You don&apos;t have permission to access this page.
          <br />
          Please contact your administrator if you believe this is an error.
        </motion.p>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <button
            onClick={() => router.back()}
            className="
              flex-1 flex items-center justify-center gap-2
              px-6 py-3.5
              rounded-2xl
              bg-slate-100 hover:bg-slate-200
              text-slate-700
              font-semibold text-sm
              transition-colors
            "
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>

          <button
            onClick={() => router.replace("/dashboard")}
            className="
              flex-1 flex items-center justify-center gap-2
              px-6 py-3.5
              rounded-2xl
              bg-[#0f172a] hover:bg-[#1e293b]
              text-white
              font-semibold text-sm
              transition-colors
            "
          >
            <Home className="w-4 h-4" />
            Dashboard
          </button>
        </motion.div>

        {/* SPC Branding */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-8 text-xs text-slate-400 tracking-wide"
        >
          SPC Online DTR System
        </motion.p>
      </motion.div>
    </div>
  );
}
