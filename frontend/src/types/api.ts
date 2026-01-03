export interface User {
  id: number;
  email: string;
  username?: string | null;
  role: string;
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
};

export type ApiError = {
  message: string;
};
