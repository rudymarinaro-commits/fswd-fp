import { createContext } from "react";
import type { Socket } from "socket.io-client";

export type PresenceStatus = "ONLINE" | "IDLE" | "OFFLINE";

export type PresenceStatePayload = {
  userId: number;
  status: PresenceStatus;
};

export type SocketContextValue = {
  socket: Socket;
  connected: boolean;

  /** Mappa “solo online/idle” (offline = default se assente) */
  presenceByUserId: Record<number, Exclude<PresenceStatus, "OFFLINE">>;
};

export const SocketContext = createContext<SocketContextValue | null>(null);
