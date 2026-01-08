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

// Multi-tab: userId -> set di socket.id attivi (supporta più tab/browser per lo stesso utente)
const socketsByUserId = new Map<number, Set<string>>();

// Stato solo per utenti attualmente connessi (ONLINE o IDLE).
// OFFLINE non viene salvato: lato client "assenza nello snapshot" = OFFLINE.
const statusByUserId = new Map<number, Exclude<PresenceStatus, "OFFLINE">>();

// Timer per IDLE e per OFFLINE con grace period
const idleTimerByUserId = new Map<number, ReturnType<typeof setTimeout>>();
const offlineGraceTimerByUserId = new Map<number, ReturnType<typeof setTimeout>>();

// Configurazione (puoi modificarla senza toccare la logica)
const IDLE_TIMEOUT_MS = 90_000; // dopo 90s senza attività -> IDLE
const DISCONNECT_GRACE_MS = 4_000; // 4s di grace period prima di OFFLINE (anti-flicker)

function toRoomKey(roomId: number) {
  return `room:${roomId}`;
}

function parseRoomId(input: unknown): number | null {
  const n = Number(input);
  if (!n || Number.isNaN(n)) return null;
  return n;
}

/** Snapshot iniziale: restituisce SOLO utenti ONLINE/IDLE (gli altri sono OFFLINE di default) */
function buildPresenceSnapshot(): PresenceStatePayload[] {
  return Array.from(statusByUserId.entries()).map(([userId, status]) => ({
    userId,
    status,
  }));
}

function clearIdleTimer(userId: number) {
  const t = idleTimerByUserId.get(userId);
  if (t) {
    clearTimeout(t);
    idleTimerByUserId.delete(userId);
  }
}

function cancelOfflineGrace(userId: number) {
  const t = offlineGraceTimerByUserId.get(userId);
  if (t) {
    clearTimeout(t);
    offlineGraceTimerByUserId.delete(userId);
  }
}

/** Emette presence:state solo se lo stato cambia */
function emitPresenceIfChanged(io: Server, userId: number, status: PresenceStatus) {
  const prev = statusByUserId.get(userId);

  if (status === "OFFLINE") {
    // OFFLINE: emetti sempre, poi pulisci tutto
    io.emit("presence:state", { userId, status } satisfies PresenceStatePayload);
    statusByUserId.delete(userId);
    clearIdleTimer(userId);
    cancelOfflineGrace(userId);
    socketsByUserId.delete(userId);
    return;
  }

  // ONLINE/IDLE
  if (prev === status) return;
  statusByUserId.set(userId, status);
  io.emit("presence:state", { userId, status } satisfies PresenceStatePayload);
}

/** Pianifica il passaggio a IDLE dopo un timeout (solo se l’utente è ancora connesso) */
function scheduleIdleTimer(io: Server, userId: number) {
  clearIdleTimer(userId);

  const t = setTimeout(() => {
    const set = socketsByUserId.get(userId);
    // Se non ha socket attivi, non ha senso diventare IDLE
    if (!set || set.size === 0) return;

    emitPresenceIfChanged(io, userId, "IDLE");
  }, IDLE_TIMEOUT_MS);

  idleTimerByUserId.set(userId, t);
}

/**
 * Touch = "attività" (ping / invio messaggio / join room):
 * - annulla eventuale OFFLINE in grace
 * - porta ONLINE
 * - resetta timer IDLE
 */
function touch(io: Server, userId: number) {
  cancelOfflineGrace(userId);
  emitPresenceIfChanged(io, userId, "ONLINE");
  scheduleIdleTimer(io, userId);
}

/** Se resta a 0 socket, dopo grace period diventa OFFLINE (evita flicker su reconnessioni rapide) */
function scheduleOfflineWithGrace(io: Server, userId: number) {
  cancelOfflineGrace(userId);
  clearIdleTimer(userId);

  const t = setTimeout(() => {
    const set = socketsByUserId.get(userId);
    // Se nel frattempo è tornato online (riconnessione), non fare nulla
    if (set && set.size > 0) return;

    emitPresenceIfChanged(io, userId, "OFFLINE");
  }, DISCONNECT_GRACE_MS);

  offlineGraceTimerByUserId.set(userId, t);
}

export function setupSocket(io: Server) {
  // ✅ Middleware auth: token in socket.handshake.auth.token (supporta anche "Bearer ...")
  io.use((socket, next) => {
    try {
      const raw = socket.handshake.auth?.token as string | undefined;
      const token = raw?.startsWith("Bearer ") ? raw.slice(7) : raw;

      if (!token) return next(new Error("Unauthorized"));

      const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
      if (!payload?.userId) return next(new Error("Unauthorized"));

      // Salvo contesto utente sul socket
      socket.data.userId = payload.userId;
      socket.data.role = payload.role ?? "USER";

      next();
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as number;

    // =====================
    // STEP 3 — Presence: register socket + ONLINE + sync iniziale
    // =====================
    {
      let set = socketsByUserId.get(userId);
      if (!set) {
        set = new Set<string>();
        socketsByUserId.set(userId, set);
      }
      set.add(socket.id);

      // Se era in grace OFFLINE, annulla
      cancelOfflineGrace(userId);

      // Consideriamo la connessione come attività -> ONLINE + reset idle
      touch(io, userId);

      // Invia snapshot iniziale al nuovo client (solo ONLINE/IDLE)
      socket.emit("presence:sync", buildPresenceSnapshot());

      // Log utile in dev
      // eslint-disable-next-line no-console
      console.log(`[socket] connect user=${userId} socket=${socket.id}`);
    }

    // Il client può chiedere snapshot in qualsiasi momento
    socket.on("presence:sync:request", (ack?: (snapshot: PresenceStatePayload[]) => void) => {
      ack?.(buildPresenceSnapshot());
    });

    // Ping attività: mouse/keyboard/heartbeat
    socket.on("presence:ping", () => {
      touch(io, userId);
    });

    // =====================
    // STEP 2 — JOIN ROOM (compat: joinRoom + alias room:join)
    // =====================
    const joinRoomHandler = async (
      roomIdRaw: unknown,
      ack?: (res: { ok: boolean; message?: string }) => void
    ) => {
      try {
        // join è attività -> evita IDLE
        touch(io, userId);

        const roomId = parseRoomId(roomIdRaw);
        if (!roomId) return ack?.({ ok: false, message: "roomId required" });

        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room) return ack?.({ ok: false, message: "Room not found" });

        const isMember = room.user1Id === userId || room.user2Id === userId;
        if (!isMember) return ack?.({ ok: false, message: "Forbidden" });

        socket.join(toRoomKey(roomId));
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false, message: "Internal error" });
      }
    };

    socket.on("joinRoom", joinRoomHandler);
    socket.on("room:join", joinRoomHandler);

    // =====================
    // STEP 2 — SEND MESSAGE (compat: sendMessage + alias message:send)
    // =====================
    const sendMessageHandler = async (
      payload: unknown,
      ack?: (res: { ok: boolean; message?: any; error?: string }) => void
    ) => {
      try {
        // invio messaggio = attività -> evita IDLE
        touch(io, userId);

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

        // Broadcast a tutti nella stanza (eventi compat)
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
    // STEP 3 — Presence: cleanup su disconnect (multi-tab + grace)
    // =====================
    socket.on("disconnect", () => {
      const set = socketsByUserId.get(userId);

      if (!set) {
        // Fallback (caso raro): considera come ultima connessione chiusa
        scheduleOfflineWithGrace(io, userId);
        return;
      }

      set.delete(socket.id);

      // Se l’utente ha ancora altre tab/socket aperte, resta ONLINE/IDLE
      if (set.size > 0) return;

      // Nessuna socket rimasta: avvia grace period prima di OFFLINE (anti-flicker)
      scheduleOfflineWithGrace(io, userId);

      // eslint-disable-next-line no-console
      console.log(`[socket] disconnect user=${userId} socket=${socket.id}`);
    });
  });
}
