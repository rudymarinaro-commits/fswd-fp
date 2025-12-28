import { createContext } from "react";

export type AuthContextType = {
  token: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);
