import { useState, ReactNode } from "react";
import { AuthContext } from "./AuthContext";

type Props = {
  children: ReactNode;
};

export function AuthProvider({ children }: Props) {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("token")
  );

  async function login(email: string, password: string): Promise<boolean> {
    try {
      const res = await fetch("http://localhost:3000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) return false;

      const data = await res.json();

      setToken(data.token);
      localStorage.setItem("token", data.token);
      return true;
    } catch {
      return false;
    }
  }

  function logout() {
    setToken(null);
    localStorage.removeItem("token");
  }

  return (
    <AuthContext.Provider value={{ token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
