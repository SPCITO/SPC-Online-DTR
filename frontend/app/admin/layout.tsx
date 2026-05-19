"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

  const nav = [
    { name: "Dashboard", href: "/admin" },
    { name: "Logs", href: "/admin/logs" },
    { name: "Employees", href: "/admin/employees" },
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
      <aside className="w-64 p-5 bg-white/10 backdrop-blur-xl border-r border-white/10 flex flex-col">

        <h1 className="text-xl font-bold mb-8">SPC Admin</h1>

        <nav className="flex flex-col gap-2">
          {nav.map((item) => (
            <Link key={item.href} href={item.href}>
              <div
                className={`p-3 rounded-xl transition cursor-pointer ${
                  path === item.href
                    ? "bg-white/20"
                    : "hover:bg-white/10"
                }`}
              >
                {item.name}
              </div>
            </Link>
          ))}
        </nav>

        {/* USER */}
        {user && (
          <div className="mt-auto bg-white/10 p-3 rounded-xl">
            <p className="font-semibold">{user.name}</p>
            <p className="text-sm text-white/70">{user.role}</p>
          </div>
        )}

        <button
          onClick={logout}
          className="mt-4 bg-red-500 hover:bg-red-600 p-2 rounded-xl"
        >
          Logout
        </button>
      </aside>

      {/* MAIN */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}