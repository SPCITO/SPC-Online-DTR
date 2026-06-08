"use client";

import { motion } from "framer-motion";

interface BentoGridProps {
  children: React.ReactNode;
  className?: string;
}

export default function BentoGrid({ children, className = "" }: BentoGridProps) {
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${className}`}
    >
      {children}
    </div>
  );
}

interface BentoCardProps {
  children: React.ReactNode;
  size?: "small" | "medium" | "large" | "wide";
  className?: string;
  onClick?: () => void;
}

export function BentoCard({
  children,
  size = "small",
  className = "",
  onClick,
}: BentoCardProps) {
  const sizeClasses = {
    small: "md:col-span-1",
    medium: "md:col-span-1 lg:col-span-1",
    large: "md:col-span-2 lg:col-span-2",
    wide: "md:col-span-2 lg:col-span-3",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      whileHover={onClick ? { y: -4, scale: 1.01 } : {}}
      onClick={onClick}
      className={`
        relative overflow-hidden
        bg-white/95 backdrop-blur-xl
        rounded-[34px]
        border border-white
        shadow-[0_12px_50px_rgba(0,0,0,0.08)]
        p-6 sm:p-7
        ${sizeClasses[size]}
        ${onClick ? "cursor-pointer hover:shadow-[0_20px_60px_rgba(0,0,0,0.12)]" : ""}
        transition-all duration-300
        ${className}
      `}
    >
      {children}
    </motion.div>
  );
}
