import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./AuthContext";
import { apiFetch } from "../services/api";
import type { LoginResponse, User } from "../types/api";

const TOKEN_KEY = "token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(!!token);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!token) return;
    const me = await apiFetch<User>("/auth/me", {}, token);
    setUser(me);
  }, [token]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const me = await apiFetch<User>("/auth/me", {}, token);
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) logout();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const data = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setUser(data.user);
      return true;
    } catch {
      return false;
    }
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, logout, refreshMe }),
    [user, token, loading, login, logout, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
