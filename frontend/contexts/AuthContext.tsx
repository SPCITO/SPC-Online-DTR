"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { api } from "@/lib/api";

interface AuthState {
  user: any | null;
  loading: boolean;
  authError: "unauthenticated" | "network" | null;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  authError: null,
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<
    "unauthenticated" | "network" | null
  >(null);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        // First get a fresh CSRF token (returns existing if cookie present)
        await api.refreshCsrf();

        // Then restore user session
        const userData = await api.me();

        if (!cancelled) {
          if (userData) {
            setUser(userData);
            setAuthError(null);
          } else {
            setUser(null);
            setAuthError("unauthenticated");
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          // Distinguish 401 (unauthenticated) from network errors
          const msg = err?.message || "";
          if (msg.includes("401") || msg.includes("Unauthorized")) {
            setAuthError("unauthenticated");
          } else {
            setAuthError("network");
          }
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-usable refresh for post-login or manual session check
  const refreshUser = useCallback(async () => {
    try {
      setLoading(true);
      await api.refreshCsrf();
      const userData = await api.me();
      if (userData) {
        setUser(userData);
        setAuthError(null);
      } else {
        setUser(null);
        setAuthError("unauthenticated");
      }
    } catch {
      setUser(null);
      setAuthError("unauthenticated");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, authError, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
