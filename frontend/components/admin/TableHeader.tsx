"use client";

import { Search } from "lucide-react";

interface TableHeaderProps {
  title: string;
  subtitle?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  searchValue?: string;
  recordCount?: number;
}

export default function TableHeader({
  title,
  subtitle,
  searchPlaceholder = "Search...",
  onSearchChange,
  searchValue,
  recordCount,
}: TableHeaderProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-center lg:justify-between p-6 sm:p-7 border-b border-gray-100">
      <div>
        {subtitle && (
          <p className="text-xs uppercase tracking-[0.22em] text-gray-400 mb-2">
            {subtitle}
          </p>
        )}
        <h2 className="text-2xl font-black text-gray-900">{title}</h2>
      </div>

      <div className="flex items-center gap-3 bg-gray-100/80 px-4 py-3 rounded-2xl border border-gray-200 w-full lg:w-[320px]">
        <Search size={18} className="text-gray-500" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange?.(e.target.value)}
          className="bg-transparent outline-none text-sm text-gray-700 placeholder:text-gray-400 w-full"
        />
      </div>

      {recordCount !== undefined && (
        <div className="hidden lg:block text-sm text-gray-400">
          {recordCount} records
        </div>
      )}
    </div>
  );
}
