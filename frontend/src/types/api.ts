export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
}

export interface MessageDTO {
  id: number;
  content: string;
  userId: number;
  roomId: number;
  createdAt: string;
}
