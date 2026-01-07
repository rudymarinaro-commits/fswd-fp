import type { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

type JwtPayload = { userId: number; role?: string };

export function setupSocket(io: Server) {
  io.use((socket, next) => {
    try {
      const raw = socket.handshake.auth?.token as string | undefined;
      const token = raw?.startsWith("Bearer ") ? raw.slice(7) : raw;

      if (!token) return next(new Error("Unauthorized"));

      const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
      if (!payload?.userId) return next(new Error("Unauthorized"));

      socket.data.userId = payload.userId;
      socket.data.role = payload.role ?? "USER";

      next();
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    console.log("✅ socket connected userId=", socket.data.userId);

    socket.on("disconnect", () => {
      console.log("🔌 socket disconnected userId=", socket.data.userId);
    });
  });
}
