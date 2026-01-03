import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

interface JwtPayload {
  userId: number;
  role: string;
}

type PresenceStatus = "online" | "offline";

const onlineUsers = new Map<number, number>();

export function setupSocket(io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Unauthorized"));

    try {
      const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
      socket.data.userId = payload.userId;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as number;

    // Presence online
    const count = (onlineUsers.get(userId) ?? 0) + 1;
    onlineUsers.set(userId, count);
    io.emit("presence:update", { userId, status: "online" as PresenceStatus });

    // Join room
    socket.on("joinRoom", (roomId: number) => {
      socket.join(`room:${roomId}`);
    });

    // Send message
    socket.on("sendMessage", (message) => {
      io.to(`room:${message.roomId}`).emit("newMessage", message);
    });

    // WebRTC signaling
    socket.on("webrtc:offer", (payload) => {
      socket.to(payload.target).emit("webrtc:offer", payload);
    });

    socket.on("webrtc:answer", (payload) => {
      socket.to(payload.target).emit("webrtc:answer", payload);
    });

    socket.on("webrtc:ice", (payload) => {
      socket.to(payload.target).emit("webrtc:ice", payload);
    });

    socket.on("disconnect", () => {
      const c = (onlineUsers.get(userId) ?? 1) - 1;
      if (c <= 0) {
        onlineUsers.delete(userId);
        io.emit("presence:update", {
          userId,
          status: "offline" as PresenceStatus,
        });
      } else {
        onlineUsers.set(userId, c);
      }
    });
  });
}
