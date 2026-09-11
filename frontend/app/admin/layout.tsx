"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  Building2,
  LogOut,
  ShieldCheck,
  Home,
  Menu,
  X,
} from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute requireAdmin>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </ProtectedRoute>
  );
}

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const nav = [
    { name: "My Dashboard", href: "/dashboard", icon: Home },
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
    setSidebarOpen(false);
    router.replace("/login");
  };

  const closeSidebar = () => setSidebarOpen(false);

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [path]);

  const sidebarContent = (
    <>
      <div>
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-900/20">
            <ShieldCheck size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-wide">SPC Admin</h1>
        </div>

        <nav className="flex flex-col gap-2" role="navigation" aria-label="Admin navigation">
          {nav.map((item) => {
            const Icon = item.icon;
            const isActive = path === item.href;

            return (
              <Link key={item.href} href={item.href} onClick={closeSidebar}>
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
                  <Icon
                    size={20}
                    className={
                      isActive
                        ? "text-emerald-300"
                        : "group-hover:text-emerald-300 transition-colors"
                    }
                  />
                  {item.name}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-4">
        {user && (
          <div className="bg-white/10 p-4 rounded-xl border border-white/5">
            <p className="font-semibold text-sm">{user.name}</p>
            <p className="text-xs text-white/60 uppercase tracking-wider mt-1">
              {user.role}
            </p>
          </div>
        )}

        <button
          onClick={logout}
          aria-label="Logout"
          className="w-full flex items-center justify-center gap-2 bg-red-500/90 hover:bg-red-600 text-white p-3 rounded-xl transition-all shadow-lg shadow-red-900/20 hover:shadow-red-900/40"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-green-950 via-green-900 to-green-800 text-white">
      {/* MOBILE: Hamburger button */}
      <button
        onClick={() => setSidebarOpen(true)}
        aria-label="Open navigation menu"
        className="lg:hidden fixed top-4 left-4 z-50 w-11 h-11 rounded-xl bg-white/15 backdrop-blur-sm border border-white/10 flex items-center justify-center hover:bg-white/25 transition-colors"
      >
        <Menu size={22} />
      </button>

      {/* MOBILE: Dark backdrop overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* SIDEBAR — mobile: slide-in overlay; desktop: always visible */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-72 p-4 lg:p-6
          bg-white/10 backdrop-blur-xl border-r border-white/10
          flex flex-col justify-between
          transform transition-transform duration-300 ease-in-out
          lg:relative lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        role="complementary"
        aria-label="Admin sidebar"
      >
        {/* MOBILE: Close button inside sidebar */}
        <div className="lg:hidden flex justify-end mb-2">
          <button
            onClick={closeSidebar}
            aria-label="Close navigation menu"
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {sidebarContent}
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto pt-16 lg:pt-0">
        {children}
      </main>
    </div>
  );
}