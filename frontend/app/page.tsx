"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-800 via-green-700 to-green-600 text-white flex flex-col">

      {/* HEADER */}
      <header className="flex justify-between items-center px-6 py-4 backdrop-blur-md bg-white/10 border-b border-white/20">
        <div className="flex items-center gap-3">
          <img src="/spc logo.png" className="w-10 h-10" />
          <h1 className="font-semibold text-lg tracking-wide">
            San Pablo Colleges
          </h1>
        </div>

        <button
          onClick={() => router.push("/login")}
          className="bg-white text-green-700 px-5 py-2 rounded-xl font-medium shadow hover:scale-105 transition"
        >
          Login
        </button>
      </header>

      {/* HERO */}
      <main className="flex-1 flex items-center justify-center px-6 relative">
        <div className="absolute inset-0 bg-black/20" />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative text-center max-w-2xl"
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            Employee Daily Time Record System
          </h1>

          <p className="text-lg opacity-90 mb-8">
            Secure, accurate, and reliable attendance tracking powered by server-based time logging.
          </p>

          <button
            onClick={() => router.push("/login")}
            className="bg-white text-green-700 px-8 py-3 rounded-2xl font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition"
          >
            Get Started
          </button>
        </motion.div>
      </main>

      {/* FEATURES */}
      <section className="bg-white text-gray-800 py-16 px-6 rounded-t-3xl">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">

          {[
            "Accurate Time Tracking",
            "Secure Login System",
            "Mobile Friendly"
          ].map((title, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -6 }}
              className="p-6 rounded-2xl shadow-md border border-green-100 hover:shadow-xl transition"
            >
              <h3 className="text-xl font-semibold mb-2 text-green-700">
                {title}
              </h3>
              <p className="text-gray-600">
                Designed for reliability and ease of use across all devices.
              </p>
            </motion.div>
          ))}

        </div>
      </section>

      <footer className="text-center py-4 text-sm opacity-80">
        © {new Date().getFullYear()} San Pablo Colleges
      </footer>
    </div>
  );
}