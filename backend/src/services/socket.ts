// backend/src/services/socket.ts
import type { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";
import { env } from "../config/env";

type JwtPayload = { userId: number; role?: string };

// =====================
// STEP 3 — PRESENZA (ONLINE / IDLE / OFFLINE)
// =====================
type PresenceStatus = "ONLINE" | "IDLE" | "OFFLINE";
type PresenceStatePayload = { userId: number; status: PresenceStatus };

const socketsByUserId = new Map<number, Set<string>>();
// Salviamo solo ONLINE/IDLE. OFFLINE viene rappresentato dall'assenza in mappa.
const statusByUserId = new Map<number, Exclude<PresenceStatus, "OFFLINE">>();

const idleTimers = new Map<number, NodeJS.Timeout>();
const offlineGraceTimers = new Map<number, NodeJS.Timeout>();

function toRoomKey(roomId: number) {
  return `room:${roomId}`;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

type SdpLike = {
  type: "offer" | "answer";
  sdp?: string;
};

type IceLike = RTCIceCandidateInit;

function isSdpLike(x: unknown): x is SdpLike {
  if (!isRecord(x)) return false;
  const t = x.type;
  return t === "offer" || t === "answer";
}

function isIceLike(x: unknown): x is IceLike {
  return isRecord(x); // permissivo: basta oggetto
}

function emitToUser(
  io: Server,
  userId: number,
  event: string,
  payload: unknown
) {
  const set = socketsByUserId.get(userId);
  if (!set || set.size === 0) return 0;
  for (const sid of set) io.to(sid).emit(event, payload);
  return set.size;
}

function clearIdleTimer(userId: number) {
  const t = idleTimers.get(userId);
  if (t) clearTimeout(t);
  idleTimers.delete(userId);
}

function cancelOfflineGrace(userId: number) {
  const t = offlineGraceTimers.get(userId);
  if (t) clearTimeout(t);
  offlineGraceTimers.delete(userId);
}

function buildPresenceSnapshot(): PresenceStatePayload[] {
  const out: PresenceStatePayload[] = [];
  for (const [userId, status] of statusByUserId.entries()) {
    out.push({ userId, status });
  }
  return out;
}

function setPresence(io: Server, userId: number, status: PresenceStatus) {
  if (status === "OFFLINE") {
    io.emit("presence:state", {
      userId,
      status,
    } satisfies PresenceStatePayload);
    statusByUserId.delete(userId);
    clearIdleTimer(userId);
    cancelOfflineGrace(userId);
    socketsByUserId.delete(userId);
    return;
  }

  const prev = statusByUserId.get(userId);
  if (prev === status) return;

  statusByUserId.set(userId, status);
  io.emit("presence:state", { userId, status } satisfies PresenceStatePayload);
}

function touch(io: Server, userId: number) {
  setPresence(io, userId, "ONLINE");
  clearIdleTimer(userId);

  const t = setTimeout(() => {
    setPresence(io, userId, "IDLE");
  }, 30_000);

  idleTimers.set(userId, t);
}

function scheduleOfflineWithGrace(io: Server, userId: number) {
  cancelOfflineGrace(userId);

  const t = setTimeout(() => {
    setPresence(io, userId, "OFFLINE");
  }, 2500);

  offlineGraceTimers.set(userId, t);
}

// =====================
// WebRTC payload types
// =====================
type OfferIn = { roomId: number; sdp: RTCSessionDescriptionInit };
type OfferOut = {
  roomId: number;
  fromUserId: number;
  sdp: RTCSessionDescriptionInit;
};

type AnswerIn = { roomId: number; sdp: RTCSessionDescriptionInit };
type AnswerOut = {
  roomId: number;
  fromUserId: number;
  sdp: RTCSessionDescriptionInit;
};

type IceIn = { roomId: number; candidate: RTCIceCandidateInit };
type IceOut = {
  roomId: number;
  fromUserId: number;
  candidate: RTCIceCandidateInit;
};

type HangupIn = { roomId: number };
type HangupOut = { roomId: number; fromUserId: number };

function parseRoomId(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

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
    const userId = socket.data.userId as number;

    // Presence register
    {
      let set = socketsByUserId.get(userId);
      if (!set) {
        set = new Set<string>();
        socketsByUserId.set(userId, set);
      }
      set.add(socket.id);
      cancelOfflineGrace(userId);
      touch(io, userId);
      socket.emit("presence:sync", buildPresenceSnapshot());
      // eslint-disable-next-line no-console
      console.log(`[socket] connect user=${userId} socket=${socket.id}`);
    }

    socket.on(
      "presence:sync:request",
      (ack?: (snapshot: PresenceStatePayload[]) => void) => {
        ack?.(buildPresenceSnapshot());
      }
    );

    socket.on("presence:ping", () => {
      touch(io, userId);
    });

    // JOIN ROOM
    const joinRoomHandler = async (
      roomIdRaw: unknown,
      ack?: (res: { ok: boolean; message?: string }) => void
    ) => {
      try {
        touch(io, userId);

        const roomId = parseRoomId(roomIdRaw);
        if (!roomId) return ack?.({ ok: false, message: "roomId required" });

        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room) return ack?.({ ok: false, message: "Room not found" });

        const isMember = room.user1Id === userId || room.user2Id === userId;
        if (!isMember) return ack?.({ ok: false, message: "Forbidden" });

        const key = toRoomKey(roomId);
        socket.join(key);

        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false, message: "Internal error" });
      }
    };

    socket.on("joinRoom", joinRoomHandler);
    socket.on(
      "room:join",
      (payload: unknown, ack?: (res: { ok: boolean }) => void) => {
        if (!isRecord(payload)) return ack?.({ ok: false });
        void joinRoomHandler(payload.roomId, (res) => ack?.({ ok: res.ok }));
      }
    );

    // =====================
    // MESSAGGI (realtime + persist)
    // =====================
    const sendMessageHandler = async (
      payload: unknown,
      ack?: (res: { ok: boolean; error?: string; message?: unknown }) => void
    ) => {
      try {
        touch(io, userId);

        if (!isRecord(payload))
          return ack?.({ ok: false, error: "Invalid payload" });

        const roomId = parseRoomId(payload.roomId);
        const content =
          typeof payload.content === "string" ? payload.content.trim() : "";

        if (!roomId) return ack?.({ ok: false, error: "roomId required" });
        if (!content) return ack?.({ ok: false, error: "content required" });

        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room) return ack?.({ ok: false, error: "Room not found" });

        const isMember = room.user1Id === userId || room.user2Id === userId;
        if (!isMember) return ack?.({ ok: false, error: "Forbidden" });

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
        io.to(key).emit("newMessage", saved);
        io.to(key).emit("message:new", saved);

        ack?.({ ok: true, message: saved });
      } catch {
        ack?.({ ok: false, error: "Internal error" });
      }
    };

    socket.on("sendMessage", sendMessageHandler);
    socket.on("message:send", sendMessageHandler);

    // =====================
    // WEBRTC: offer/answer/ice/hangup
    // =====================
    socket.on(
      "webrtc:offer",
      async (
        payload: unknown,
        ack?: (res: { ok: boolean; error?: string; delivered?: number }) => void
      ) => {
        try {
          touch(io, userId);

          if (!isRecord(payload))
            return ack?.({ ok: false, error: "Invalid payload" });
          const p = payload as OfferIn;

          const roomId = parseRoomId(p.roomId);
          if (!roomId) return ack?.({ ok: false, error: "roomId required" });
          if (!isSdpLike(p.sdp))
            return ack?.({ ok: false, error: "Invalid SDP" });

          const room = await prisma.room.findUnique({ where: { id: roomId } });
          if (!room) return ack?.({ ok: false, error: "Room not found" });

          const isMember = room.user1Id === userId || room.user2Id === userId;
          if (!isMember) return ack?.({ ok: false, error: "Forbidden" });

          const otherUserId =
            room.user1Id === userId ? room.user2Id : room.user1Id;

          const out: OfferOut = { roomId, fromUserId: userId, sdp: p.sdp };

          // NO DUPLICATI (prima c'era anche socket.to(room).emit)
          const delivered = emitToUser(io, otherUserId, "webrtc:offer", out);

          // eslint-disable-next-line no-console
          console.log(
            `[webrtc] offer room=${roomId} from=${userId} to=${otherUserId} delivered=${delivered}`
          );

          ack?.({ ok: true, delivered });
        } catch {
          ack?.({ ok: false, error: "Internal error" });
        }
      }
    );

    socket.on(
      "webrtc:answer",
      async (
        payload: unknown,
        ack?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          touch(io, userId);

          if (!isRecord(payload))
            return ack?.({ ok: false, error: "Invalid payload" });
          const p = payload as AnswerIn;

          const roomId = parseRoomId(p.roomId);
          if (!roomId) return ack?.({ ok: false, error: "roomId required" });
          if (!isSdpLike(p.sdp))
            return ack?.({ ok: false, error: "Invalid SDP" });

          const room = await prisma.room.findUnique({ where: { id: roomId } });
          if (!room) return ack?.({ ok: false, error: "Room not found" });

          const isMember = room.user1Id === userId || room.user2Id === userId;
          if (!isMember) return ack?.({ ok: false, error: "Forbidden" });

          const otherUserId =
            room.user1Id === userId ? room.user2Id : room.user1Id;

          const out: AnswerOut = { roomId, fromUserId: userId, sdp: p.sdp };

          // FIX: NO DUPLICATI
          emitToUser(io, otherUserId, "webrtc:answer", out);

          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false, error: "Internal error" });
        }
      }
    );

    socket.on(
      "webrtc:ice",
      async (
        payload: unknown,
        ack?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          touch(io, userId);

          if (!isRecord(payload))
            return ack?.({ ok: false, error: "Invalid payload" });
          const p = payload as IceIn;

          const roomId = parseRoomId(p.roomId);
          if (!roomId) return ack?.({ ok: false, error: "roomId required" });
          if (!isIceLike(p.candidate))
            return ack?.({ ok: false, error: "Invalid candidate" });

          const room = await prisma.room.findUnique({ where: { id: roomId } });
          if (!room) return ack?.({ ok: false, error: "Room not found" });

          const isMember = room.user1Id === userId || room.user2Id === userId;
          if (!isMember) return ack?.({ ok: false, error: "Forbidden" });

          const otherUserId =
            room.user1Id === userId ? room.user2Id : room.user1Id;

          const out: IceOut = {
            roomId,
            fromUserId: userId,
            candidate: p.candidate,
          };

          // FIX: NO DUPLICATI
          emitToUser(io, otherUserId, "webrtc:ice", out);

          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false, error: "Internal error" });
        }
      }
    );

    socket.on(
      "webrtc:hangup",
      async (
        payload: unknown,
        ack?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          touch(io, userId);

          if (!isRecord(payload))
            return ack?.({ ok: false, error: "Invalid payload" });
          const p = payload as HangupIn;

          const roomId = parseRoomId(p.roomId);
          if (!roomId) return ack?.({ ok: false, error: "roomId required" });

          const room = await prisma.room.findUnique({ where: { id: roomId } });
          if (!room) return ack?.({ ok: false, error: "Room not found" });

          const isMember = room.user1Id === userId || room.user2Id === userId;
          if (!isMember) return ack?.({ ok: false, error: "Forbidden" });

          const otherUserId =
            room.user1Id === userId ? room.user2Id : room.user1Id;

          const out: HangupOut = { roomId, fromUserId: userId };

          // FIX: NO DUPLICATI
          emitToUser(io, otherUserId, "webrtc:hangup", out);

          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false, error: "Internal error" });
        }
      }
    );

    // disconnect cleanup
    socket.on("disconnect", () => {
      const set = socketsByUserId.get(userId);
      if (!set) {
        scheduleOfflineWithGrace(io, userId);
        return;
      }

      set.delete(socket.id);
      if (set.size > 0) return;

      scheduleOfflineWithGrace(io, userId);
      // eslint-disable-next-line no-console
      console.log(`[socket] disconnect user=${userId} socket=${socket.id}`);
    });
  });
}
