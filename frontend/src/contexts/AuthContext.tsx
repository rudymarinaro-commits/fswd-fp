import { createContext } from "react";

export type Role = "USER" | "ADMIN";

export type AuthUser = {
  id: number;
  email: string;
  role: Role;
  createdAt?: string;
};

export type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
