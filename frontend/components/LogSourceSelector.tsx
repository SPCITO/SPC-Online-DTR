"use client";

import { SourceMode } from "@/lib/types";

const OPTIONS: { value: SourceMode; label: string }[] = [
  { value: "online", label: "Online DTR" },
  { value: "biometrics", label: "Biometrics" },
  { value: "both", label: "Both / Summary" },
];

// M.69 — Log Source selector: Online DTR (default) / Biometrics / Both.
// Desktop: segmented control. Mobile: native select. Additive — pages
// keep their existing structure around it.
export default function LogSourceSelector({
  value,
  onChange,
  className = "",
}: {
  value: SourceMode;
  onChange: (next: SourceMode) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
        Log Source
      </span>

      <div className="hidden sm:flex items-center bg-white border border-gray-200 rounded-xl p-1 gap-1">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
              value === o.value
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-200"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <select
        className="sm:hidden px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-900"
        value={value}
        onChange={(e) => onChange(e.target.value as SourceMode)}
        aria-label="Log Source"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
