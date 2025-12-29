import { useState } from "react";
import { AuthContext, AuthContextType } from "./AuthContext";

type Props = {
  children: React.ReactNode;
};

export function AuthProvider({ children }: Props) {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("token")
  );

  async function login(email: string, password: string): Promise<boolean> {
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
  }

  function logout() {
    setToken(null);
    localStorage.removeItem("token");
  }

  const value: AuthContextType = { token, login, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
