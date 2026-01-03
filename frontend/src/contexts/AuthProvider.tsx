import { useEffect, useState } from "react";
import { AuthContext } from "./AuthContext";
import type { User } from "../types";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("token")
  );
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function login(email: string, password: string) {
    const r = await fetch("http://localhost:3000/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!r.ok) return false;

    const data = await r.json();
    localStorage.setItem("token", data.token);
    setToken(data.token);

    // 🔹 Carichiamo subito il profilo
    try {
      const meRes = await fetch("http://localhost:3000/auth/me", {
        headers: { Authorization: `Bearer ${data.token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        setUser(me);
      }
    } catch {
      // Se fallisce, lasciamo che useEffect gestisca il logout
    }

    return true;
  }

  function logout() {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  }

  useEffect(() => {
    async function loadMe() {
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const r = await fetch("http://localhost:3000/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) {
          logout();
          setLoading(false);
          return;
        }
        const me = await r.json();
        setUser(me);
      } catch {
        logout();
      } finally {
        setLoading(false);
      }
    }

    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
