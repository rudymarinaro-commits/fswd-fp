import type { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";
import { env } from "../config/env";

type JwtPayload = { userId: number; role?: string };

function toRoomKey(roomId: number) {
  return `room:${roomId}`;
}

function parseRoomId(input: unknown): number | null {
  const n = Number(input);
  if (!n || Number.isNaN(n)) return null;
  return n;
}

export function setupSocket(io: Server) {
  // ✅ Auth middleware: token in handshake.auth.token (supporta anche "Bearer ...")
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
    const userId = socket.data.userId as number;

    // ---- JOIN ROOM (compat: joinRoom + alias room:join)
    const joinRoomHandler = async (
      roomIdRaw: unknown,
      ack?: (res: { ok: boolean; message?: string }) => void
    ) => {
      const roomId = parseRoomId(roomIdRaw);
      if (!roomId) return ack?.({ ok: false, message: "roomId required" });

      const room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room) return ack?.({ ok: false, message: "Room not found" });

      const isMember = room.user1Id === userId || room.user2Id === userId;
      if (!isMember) return ack?.({ ok: false, message: "Forbidden" });

      socket.join(toRoomKey(roomId));
      ack?.({ ok: true });
    };

    socket.on("joinRoom", joinRoomHandler);
    socket.on("room:join", joinRoomHandler);

    // ---- SEND MESSAGE (compat: sendMessage + alias message:send)
    const sendMessageHandler = async (
      payload: unknown,
      ack?: (res: { ok: boolean; message?: any; error?: string }) => void
    ) => {
      const p = payload as { roomId?: unknown; content?: unknown };

      const roomId = parseRoomId(p?.roomId);
      const content = typeof p?.content === "string" ? p.content.trim() : "";

      if (!roomId) return ack?.({ ok: false, error: "roomId required" });
      if (!content) return ack?.({ ok: false, error: "content required" });

      const room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room) return ack?.({ ok: false, error: "Room not found" });

      const isMember = room.user1Id === userId || room.user2Id === userId;
      if (!isMember) return ack?.({ ok: false, error: "Forbidden" });

      // ✅ salva su DB
      const saved = await prisma.message.create({
        data: { roomId, userId, content },
        select: {
          id: true,
          content: true,
          createdAt: true,
          userId: true,
          roomId: true,
        },
      });

      const key = toRoomKey(roomId);

      // Broadcast a tutti nella stanza
      io.to(key).emit("newMessage", saved);
      io.to(key).emit("message:new", saved);

      ack?.({ ok: true, message: saved });
    };

    socket.on("sendMessage", sendMessageHandler);
    socket.on("message:send", sendMessageHandler);
  });
}
