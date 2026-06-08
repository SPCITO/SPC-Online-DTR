"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  icon?: React.ReactNode;
  showBackButton?: boolean;
  backHref?: string;
  actions?: React.ReactNode;
}

export default function PageHeader({
  title,
  subtitle = "Admin Management",
  description,
  icon,
  showBackButton = false,
  backHref,
  actions,
}: PageHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="
        bg-white/90
        backdrop-blur-2xl
        border border-white
        rounded-[34px]
        shadow-[0_12px_40px_rgba(0,0,0,0.08)]
        p-5 sm:p-7
      "
    >
      <div className="flex flex-col lg:flex-row gap-6 lg:items-center lg:justify-between">
        {/* LEFT */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            {icon && (
              <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center">
                {icon}
              </div>
            )}

            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-gray-400">
                {subtitle}
              </p>

              <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
                {title}
              </h1>
            </div>
          </div>

          {description && (
            <p className="text-gray-500 text-sm sm:text-base">{description}</p>
          )}
        </div>

        {/* RIGHT - ACTIONS */}
        <div className="flex flex-col sm:flex-row gap-4">
          {showBackButton && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={handleBack}
              className="
                flex items-center justify-center gap-2
                px-5 py-3
                rounded-2xl
                bg-white
                border border-gray-200
                text-gray-700
                font-semibold
                hover:shadow-lg
                transition-all
              "
            >
              <ArrowLeft size={18} />
              Back
            </motion.button>
          )}

          {actions}
        </div>
      </div>
    </motion.div>
  );
}
