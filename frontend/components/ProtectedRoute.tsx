"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export function ProtectedRoute({
  children,
  requireAdmin = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
}) {
  const { user, loading, authError } = useAuth();
  const router = useRouter();

  // Use useEffect for redirects — not during render
  useEffect(() => {
    if (loading) return; // Still restoring session — do nothing

    if (authError === "unauthenticated" || (!user && authError !== "network")) {
      router.replace("/login");
      return;
    }

    if (requireAdmin && user && user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [loading, user, authError, requireAdmin, router]);

  // While session is restoring, show loading — never redirect
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f7f5]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          <p className="text-sm font-medium text-gray-500 animate-pulse">
            Restoring session...
          </p>
        </div>
      </div>
    );
  }

  // Network error — don't redirect, show error state
  if (authError === "network") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f7f5]">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-lg font-semibold text-gray-700">
            Unable to connect to server
          </p>
          <p className="text-sm text-gray-500">
            Please check your connection and try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Unauthenticated — will redirect via useEffect, show nothing
  if (!user) {
    return null;
  }

  // Admin required but user is not admin — will redirect via useEffect
  if (requireAdmin && user.role !== "admin") {
    return null;
  }

  return <>{children}</>;
}
