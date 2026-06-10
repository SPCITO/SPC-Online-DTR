"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  LogOut, 
  ShieldCheck 
} from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const data = await api.me();
        setUser(data);
      } catch {
        router.replace("/login");
      }
    };

    loadUser();
  }, [router]);

  // ✅ Removed "Logs" from navigation
  const nav = [
    { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
    { name: "Employees", href: "/admin/employees", icon: Users },
    { name: "Departments", href: "/admin/departments", icon: Building2 },
  ];

  const logout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.warn("Logout request failed");
    }

    router.replace("/login");
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-green-950 via-green-900 to-green-800 text-white">

      {/* SIDEBAR */}
      <aside className="w-72 p-6 bg-white/10 backdrop-blur-xl border-r border-white/10 flex flex-col justify-between">

        <div>
          <div className="flex items-center gap-3 mb-10 px-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-900/20">
              <ShieldCheck size={24} className="text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-wide">SPC Admin</h1>
          </div>

          <nav className="flex flex-col gap-2">
            {nav.map((item) => {
              const Icon = item.icon;
              const isActive = path === item.href;
              
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={`
                      group flex items-center gap-3 px-4 py-3.5 
                      rounded-xl transition-all duration-200
                      ${
                        isActive
                          ? "bg-white/25 shadow-lg shadow-black/10 text-white font-semibold"
                          : "text-white/70 hover:bg-white/10 hover:text-white"
                      }
                    `}
                  >
                    <Icon size={20} className={isActive ? "text-emerald-300" : "group-hover:text-emerald-300 transition-colors"} />
                    {item.name}
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* USER & LOGOUT */}
        <div className="space-y-4">
          {user && (
            <div className="bg-white/10 p-4 rounded-xl border border-white/5">
              <p className="font-semibold text-sm">{user.name}</p>
              <p className="text-xs text-white/60 uppercase tracking-wider mt-1">{user.role}</p>
            </div>
          )}

          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 bg-red-500/90 hover:bg-red-600 text-white p-3 rounded-xl transition-all shadow-lg shadow-red-900/20 hover:shadow-red-900/40"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>

      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}