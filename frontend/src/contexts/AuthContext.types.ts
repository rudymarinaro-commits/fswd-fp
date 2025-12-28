export type User = {
  id: number;
  email: string;
  role: string;
};

export type AuthContextType = {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};
