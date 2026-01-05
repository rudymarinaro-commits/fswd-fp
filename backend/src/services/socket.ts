import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";

type JwtPayload = { userId: number; role?: string };

export function setupSocket(io: Server) {
  // Auth middleware: prende token da handshake.auth.token
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("Unauthorized"));

      const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
      if (!payload?.userId) return next(new Error("Unauthorized"));

      // salvo userId sul socket
      (socket as any).userId = payload.userId;
      next();
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    // join room solo se l'utente è membro
    socket.on("joinRoom", async (roomId: number) => {
      const key = `room:${roomId}`;
      const userId: number = (socket as any).userId;

      const room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room) return;

      if (room.user1Id === userId || room.user2Id === userId) {
        socket.join(key);
      }
    });

    // riceve un "message" già salvato via REST e lo inoltra alla room
    socket.on("sendMessage", (message: any) => {
      if (!message?.roomId) return;
      const key = `room:${Number(message.roomId)}`;
      io.to(key).emit("newMessage", message);
    });
  });
}
