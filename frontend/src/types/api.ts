export type Role = "USER" | "ADMIN";

export interface User {
  id: number;
  email: string;
  role: Role;
  createdAt?: string;

  // ✅ profilo esteso (traccia punto 4.1)
  firstName?: string;
  lastName?: string;
  username?: string;

  phone?: string | null;
  address?: string | null;
  avatarUrl?: string | null;
}

export type Room = {
  id: number;
  user1Id: number;
  user2Id: number;
  createdAt: string;
};

export type Message = {
  id: number;
  content: string;
  userId: number;
  roomId: number;
  createdAt: string;
};

export type LoginResponse = {
  token: string;
  user: User;
};

export type ApiError = {
  message: string;
};
