"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Clock3,
  MonitorSmartphone,
  ArrowRight,
} from "lucide-react";

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#f4f7f5] overflow-hidden text-[#0f172a]">

      {/* BACKGROUND GLOW */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-120px] left-[-120px] w-[320px] h-[320px] bg-emerald-300/20 blur-3xl rounded-full" />
        <div className="absolute bottom-[-140px] right-[-140px] w-[360px] h-[360px] bg-green-300/20 blur-3xl rounded-full" />
      </div>

      {/* HEADER */}
      <header className="relative z-10 px-4 sm:px-6 lg:px-8 pt-6">

        <div
          className="
            max-w-7xl mx-auto

            bg-white/80
            backdrop-blur-2xl

            border border-white

            rounded-[34px]

            px-5 sm:px-7
            py-5

            flex items-center justify-between

            shadow-[0_12px_50px_rgba(0,0,0,0.08)]
          "
        >

          {/* LOGO */}
          <div className="flex items-center gap-4 min-w-0">

            <div
              className="
                w-14 h-14

                rounded-2xl

               
                flex items-center justify-center

                shadow-lg
              "
            >
              <img
                src="/spc logo.png"
                alt="SPC Logo"
                className="w-9 h-9 object-contain"
              />
            </div>

            <div className="min-w-0">
              <h1 className="font-black text-lg sm:text-xl text-slate-900">
                San Pablo Colleges
              </h1>

              <p className="text-sm text-slate-500">
                Employee Attendance System
              </p>
            </div>

          </div>

          {/* LOGIN BUTTON */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => router.push("/login")}
            className="
              px-5 sm:px-6
              py-3

              rounded-2xl

              bg-[#0f172a]
              hover:bg-slate-900

              text-white
              font-semibold

              shadow-[0_10px_30px_rgba(15,23,42,0.28)]

              transition-all duration-300
            "
          >
            Login
          </motion.button>

        </div>

      </header>

      {/* HERO */}
      <section
        className="
          relative z-10

          px-4 sm:px-6 lg:px-8

          pt-14 sm:pt-20
          pb-20
        "
      >

        <div className="max-w-7xl mx-auto">

          <div
            className="
              relative overflow-hidden

              rounded-[40px]

              bg-gradient-to-br
              from-[#071127]
              via-[#081a38]
              to-[#052e2b]

              p-8 sm:p-10 lg:p-14

              shadow-[0_25px_80px_rgba(0,0,0,0.18)]
            "
          >

            {/* GLOW */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.10),transparent_40%)]" />

            <div
              className="
                relative

                grid lg:grid-cols-[1.2fr_0.8fr]
                gap-10
                items-center
              "
            >

              {/* LEFT */}
              <div>

                <motion.div
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="
                    inline-flex items-center gap-2

                    px-4 py-2

                    rounded-full

                    bg-white/10
                    border border-white/10

                    text-emerald-100
                    text-sm
                    tracking-[0.18em]
                    uppercase

                    mb-7
                  "
                >
                  <Clock3 size={16} />
                  Smart Attendance Monitoring
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="
                    text-4xl
                    sm:text-5xl
                    lg:text-7xl

                    font-black

                    text-white

                    leading-[1]
                    tracking-[-0.04em]
                  "
                >
                  Modern Employee
                  <span className="block text-emerald-300">
                    Time Tracking
                  </span>
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                  className="
                    mt-7

                    max-w-2xl

                    text-base sm:text-lg

                    leading-relaxed

                    text-slate-300
                  "
                >
                  A premium real-time attendance monitoring system
                  built for accuracy, reliability, and seamless
                  employee management across all devices.
                </motion.p>

                {/* CTA */}
                <motion.div
                  initial={{ opacity: 0, y: 32 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7 }}
                  className="flex flex-col sm:flex-row gap-4 mt-10"
                >

                  <button
                    onClick={() => router.push("/login")}
                    className="
                      px-8 py-4

                      rounded-2xl

                      bg-white
                      hover:bg-slate-100

                      text-slate-900
                      font-bold

                      flex items-center justify-center gap-2

                      shadow-[0_12px_30px_rgba(255,255,255,0.12)]

                      transition-all duration-300
                    "
                  >
                    Get Started
                    <ArrowRight size={18} />
                  </button>

                  <button
                    className="
                      px-8 py-4

                      rounded-2xl

                      bg-white/10
                      hover:bg-white/15

                      border border-white/10

                      text-white
                      font-semibold

                      backdrop-blur-xl

                      transition-all duration-300
                    "
                  >
                    Learn More
                  </button>

                </motion.div>

              </div>

              {/* RIGHT */}
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6 }}
                className="
                  grid gap-5
                "
              >

                {[
                  {
                    icon: Clock3,
                    title: "Real-Time Attendance",
                    desc: "Track employee logs with accurate server-based synchronization.",
                  },
                  {
                    icon: ShieldCheck,
                    title: "Secure Authentication",
                    desc: "Protected employee login with role-based system access.",
                  },
                  {
                    icon: MonitorSmartphone,
                    title: "Responsive Experience",
                    desc: "Optimized UI for desktop, tablet, and mobile devices.",
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="
                      bg-white/10
                      backdrop-blur-2xl

                      border border-white/10

                      rounded-[30px]

                      p-6

                      shadow-[0_12px_40px_rgba(0,0,0,0.18)]
                    "
                  >

                    <div
                      className="
                        w-14 h-14

                        rounded-2xl

                        bg-white/10

                        flex items-center justify-center

                        mb-5
                      "
                    >
                      <item.icon
                        size={24}
                        className="text-emerald-300"
                      />
                    </div>

                    <h3 className="text-white font-black text-xl mb-2">
                      {item.title}
                    </h3>

                    <p className="text-slate-300 leading-relaxed text-sm">
                      {item.desc}
                    </p>

                  </div>
                ))}

              </motion.div>

            </div>

          </div>

        </div>

      </section>

      {/* FOOTER */}
      <footer
        className="
          relative z-10

          text-center

          pb-10

          text-sm
          text-slate-500
        "
      >
        © {new Date().getFullYear()} San Pablo Colleges •
        All Rights Reserved
      </footer>

    </div>
  );
}