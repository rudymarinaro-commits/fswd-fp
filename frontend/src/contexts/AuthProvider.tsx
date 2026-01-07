import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext, AuthUser } from "./AuthContext";
import { apiFetch } from "../services/api";

const TOKEN_KEY = "token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY) || null
  );
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
  }, []);

  const fetchMe = useCallback(async (t: string) => {
    const me = await apiFetch<AuthUser>("/auth/me", {}, t);
    setUser(me);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!token) return;
    await fetchMe(token);
  }, [token, fetchMe]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!token) {
          if (!cancelled) {
            setUser(null);
            setLoading(false);
          }
          return;
        }

        if (!cancelled) setLoading(true);
        await fetchMe(token);
        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) {
          logout();
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, fetchMe, logout]);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const data = await apiFetch<{ token: string }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });

        localStorage.setItem(TOKEN_KEY, data.token);
        setToken(data.token);

        await fetchMe(data.token);
        return true;
      } catch {
        return false;
      }
    },
    [fetchMe]
  );

  const value = useMemo(
    () => ({ user, token, loading, login, logout, refreshMe }),
    [user, token, loading, login, logout, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
