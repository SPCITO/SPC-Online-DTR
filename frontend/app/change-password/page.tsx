"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Lock, ShieldCheck, Eye, EyeOff } from "lucide-react";

export default function ChangePasswordPage() {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // fetch user session
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const me = await api.me();
        setUser(me);
      } catch {
        router.replace("/login");
      }
    };

    fetchUser();
  }, [router]);

  const passwordStrength = (pwd: string) => {
    let score = 0;
    if (pwd.length >= 6) score++;
    if (pwd.length >= 10) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return score;
  };

  const getStrengthLabel = (score: number) => {
    if (score <= 1) return "Weak";
    if (score <= 3) return "Medium";
    return "Strong";
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword || !currentPassword) {
      toast.error("Please fill in all fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    try {
      setLoading(true);

      await api.changePassword({
        newPassword,
      });

      toast.success("Password updated successfully");

      router.replace("/login");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070b14] text-gray-400">
        Loading secure session...
      </div>
    );
  }

  const strength = passwordStrength(newPassword);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#050814] via-[#0b1220] to-[#050814] text-white px-4">

      {/* CARD */}
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl p-8">

        {/* HEADER */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-400/20">
              <ShieldCheck className="text-emerald-400" size={28} />
            </div>
          </div>

          <h1 className="text-2xl font-bold">Secure Your Account</h1>
          <p className="text-sm text-gray-400 mt-1">
            You must update your password before continuing
          </p>
        </div>

        {/* FORM */}
        <div className="space-y-4">

          {/* CURRENT PASSWORD */}
          <div className="relative">
            <Lock className="absolute left-3 top-3.5 text-gray-500" size={18} />

            <input
              type={showCurrent ? "text" : "password"}
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full pl-10 pr-10 py-3 rounded-xl bg-black/30 border border-white/10 focus:border-emerald-400 outline-none"
            />

            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-3 top-3.5 text-gray-400"
            >
              {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* NEW PASSWORD */}
          <div className="relative">
            <Lock className="absolute left-3 top-3.5 text-gray-500" size={18} />

            <input
              type={showNew ? "text" : "password"}
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full pl-10 pr-10 py-3 rounded-xl bg-black/30 border border-white/10 focus:border-emerald-400 outline-none"
            />

            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-3.5 text-gray-400"
            >
              {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* STRENGTH BAR */}
          {newPassword && (
            <div className="text-xs text-gray-400">
              Strength:{" "}
              <span
                className={
                  strength <= 1
                    ? "text-red-400"
                    : strength <= 3
                    ? "text-yellow-400"
                    : "text-emerald-400"
                }
              >
                {getStrengthLabel(strength)}
              </span>

              <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all"
                  style={{ width: `${(strength / 5) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* CONFIRM PASSWORD */}
          <div className="relative">
            <Lock className="absolute left-3 top-3.5 text-gray-500" size={18} />

            <input
              type={showConfirm ? "text" : "password"}
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full pl-10 pr-10 py-3 rounded-xl bg-black/30 border border-white/10 focus:border-emerald-400 outline-none"
            />

            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-3.5 text-gray-400"
            >
              {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* BUTTON */}
          <button
            onClick={handleChangePassword}
            disabled={loading}
            className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 text-black font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update Password"}
          </button>

        </div>
      </div>
    </div>
  );
}