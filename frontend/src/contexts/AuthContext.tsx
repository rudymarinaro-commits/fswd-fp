import { createContext } from "react";
import type { User } from "../types";

export type AuthContextType = {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextType | null>(null);
