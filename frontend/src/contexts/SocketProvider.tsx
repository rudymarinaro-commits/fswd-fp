import { useEffect, useMemo, useRef, useState } from "react";
import { SocketContext, type PresenceStatePayload } from "./SocketContext";
import { useAuth } from "../hooks/useAuth";
import { socket, setSocketToken } from "../services/socket";

/**
 * SocketProvider (riusabile)
 * - si collega quando esiste token
 * - si scollega su logout/token nullo
 * - gestisce:
 *   - presence:sync (snapshot iniziale)
 *   - presence:state (aggiornamenti realtime)
 * - invia ping attività:
 *   - interval (heartbeat)
 *   - mousemove/keydown (throttled)
 */
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();

  const [connected, setConnected] = useState(false);

  // Nota: qui memorizziamo SOLO ONLINE/IDLE.
  // OFFLINE = default (se un utente non è in mappa, è offline).
  const [presenceByUserId, setPresenceByUserId] = useState<
    Record<number, "ONLINE" | "IDLE">
  >({});

  // Throttle ping attività (per non spammare)
  const lastActivityPingAtRef = useRef<number>(0);

  // Heartbeat interval
  const heartbeatRef = useRef<number | null>(null);

  // -----------------------------
  // Helper: invio ping attività
  // -----------------------------
  function sendPing(force = false) {
    const now = Date.now();
    const minIntervalMs = 5_000; // al massimo 1 ping ogni 5s su attività

    if (!force && now - lastActivityPingAtRef.current < minIntervalMs) return;

    lastActivityPingAtRef.current = now;
    socket.emit("presence:ping");
  }

  // -----------------------------
  // Connessione / Disconnessione in base al token
  // -----------------------------
  useEffect(() => {
    // Cleanup presenza quando non siamo autenticati
    if (!token) {
      try {
        socket.off(); // toglie tutti i listener (sicuro qui perché socket è singleton)
        socket.disconnect();
      } catch {
        // ignore
      }
      setConnected(false);
      setPresenceByUserId({});
      return;
    }

    // Imposta token per Socket.IO e connetti
    setSocketToken(token);

    // Listener base
    const onConnect = () => {
      setConnected(true);

      // Ping “forzato” appena connessi (ci marca ONLINE e resetta idle lato server)
      sendPing(true);
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    const onPresenceSync = (snapshot: PresenceStatePayload[]) => {
      // snapshot contiene SOLO utenti ONLINE/IDLE
      const next: Record<number, "ONLINE" | "IDLE"> = {};
      for (const item of snapshot) {
        if (item.status === "ONLINE" || item.status === "IDLE") {
          next[item.userId] = item.status;
        }
      }
      setPresenceByUserId(next);
    };

    const onPresenceState = (payload: PresenceStatePayload) => {
      setPresenceByUserId((prev) => {
        const next = { ...prev };

        if (payload.status === "OFFLINE") {
          // OFFLINE: rimuovo dalla mappa (così “assente” => offline)
          delete next[payload.userId];
          return next;
        }

        // ONLINE / IDLE
        next[payload.userId] = payload.status;
        return next;
      });
    };

    // Evita doppie registrazioni (React StrictMode)
    socket.off("connect", onConnect);
    socket.off("disconnect", onDisconnect);
    socket.off("presence:sync", onPresenceSync);
    socket.off("presence:state", onPresenceState);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("presence:sync", onPresenceSync);
    socket.on("presence:state", onPresenceState);

    // Connetti solo se non è già connesso
    if (!socket.connected) socket.connect();

    return () => {
      // Rimuovo listener specifici (non uso socket.off() totale qui)
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("presence:sync", onPresenceSync);
      socket.off("presence:state", onPresenceState);
    };
  }, [token]);

  // -----------------------------
  // Heartbeat + Activity listeners (solo se token presente)
  // -----------------------------
  useEffect(() => {
    if (!token) return;

    const onMouseMove = () => sendPing(false);
    const onKeyDown = () => sendPing(false);
    const onVisibility = () => {
      // Quando torni visibile, manda ping per tornare ONLINE subito
      if (document.visibilityState === "visible") sendPing(true);
    };

    // Heartbeat ogni 25s (mantiene ONLINE e resetta idle)
    heartbeatRef.current = window.setInterval(() => {
      if (socket.connected) sendPing(false);
    }, 25_000);

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;

      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token]);

  const value = useMemo(
    () => ({
      socket,
      connected,
      presenceByUserId,
    }),
    [connected, presenceByUserId]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
