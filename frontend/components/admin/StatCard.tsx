"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  bgColor?: string;
  subtitle?: string;
  gradient?: boolean;
  delay?: number;
}

export default function StatCard({
  title,
  value,
  icon: Icon,
  iconColor = "text-emerald-700",
  bgColor = "bg-emerald-100",
  subtitle,
  gradient = false,
  delay = 0,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      whileHover={{ y: -4 }}
      className={`
        relative overflow-hidden
        rounded-[30px]
        border border-white
        shadow-[0_10px_40px_rgba(0,0,0,0.06)]
        p-6
        ${
          gradient
            ? "bg-gradient-to-br from-green-600 to-emerald-600 text-white"
            : "bg-white/95 backdrop-blur-xl"
        }
      `}
    >
      {/* Decorative glow */}
      {!gradient && (
        <div className="absolute top-[-40px] right-[-40px] w-32 h-32 bg-emerald-100/40 rounded-full blur-3xl" />
      )}

      <div className="relative z-10 flex items-center justify-between">
        <div>
          <p
            className={`text-sm font-medium ${
              gradient ? "text-white/80" : "text-gray-500"
            }`}
          >
            {title}
          </p>

          <h2
            className={`mt-2 text-4xl font-black tracking-tight ${
              gradient ? "text-white" : "text-gray-900"
            }`}
          >
            {value}
          </h2>

          {subtitle && (
            <p
              className={`mt-2 text-sm leading-relaxed ${
                gradient ? "text-white/80" : "text-gray-500"
              }`}
            >
              {subtitle}
            </p>
          )}
        </div>

        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
            gradient ? "bg-white/15" : bgColor
          }`}
        >
          <Icon
            size={24}
            className={gradient ? "text-white" : iconColor}
          />
        </div>
      </div>
    </motion.div>
  );
}
