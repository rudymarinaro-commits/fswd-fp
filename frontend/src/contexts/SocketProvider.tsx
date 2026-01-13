import { useEffect, useMemo, useRef, useState } from "react";
import { SocketContext, type PresenceStatePayload } from "./SocketContext";
import { useAuth } from "../hooks/useAuth";
import { socket, setSocketToken } from "../services/socket";

/**
 * SocketProvider
 * - connette quando esiste token
 * - disconnette su logout/token nullo
 * - gestisce presence:sync + presence:state
 * - invia ping SOLO su attività reale (mouse/tastiera) + connect/visibility
 *
 * NOTA: niente heartbeat automatico, altrimenti l'IDLE (pallino giallo) non scatta mai.
 */
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();

  const [connected, setConnected] = useState(false);

  // memorizziamo SOLO ONLINE/IDLE (OFFLINE = assente dalla mappa)
  const [presenceByUserId, setPresenceByUserId] = useState<
    Record<number, "ONLINE" | "IDLE">
  >({});

  const lastActivityPingAtRef = useRef<number>(0);

  function sendPing(force = false) {
    const now = Date.now();
    const minIntervalMs = 5_000;
    if (!force && now - lastActivityPingAtRef.current < minIntervalMs) return;

    lastActivityPingAtRef.current = now;
    socket.emit("presence:ping");
  }

  useEffect(() => {
    if (!token) {
      // logout / token nullo: disconnetto e rimuovo listener
      try {
        socket.off();
        socket.disconnect();
      } catch {
        // ignore
      }
      return;
    }

    setSocketToken(token);

    const onConnect = () => {
      setConnected(true);
      // evita “stale presence” se cambi utente e prima del sync
      setPresenceByUserId({});
      // ping immediato: mi segno come attivo appena connesso
      sendPing(true);
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    const onPresenceSync = (snapshot: PresenceStatePayload[]) => {
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
          delete next[payload.userId];
          return next;
        }

        next[payload.userId] = payload.status;
        return next;
      });
    };

    // Evita doppie registrazioni (StrictMode)
    socket.off("connect", onConnect);
    socket.off("disconnect", onDisconnect);
    socket.off("presence:sync", onPresenceSync);
    socket.off("presence:state", onPresenceState);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("presence:sync", onPresenceSync);
    socket.on("presence:state", onPresenceState);

    if (!socket.connected) socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("presence:sync", onPresenceSync);
      socket.off("presence:state", onPresenceState);
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const onMouseMove = () => sendPing(false);
    const onKeyDown = () => sendPing(false);
    const onVisibility = () => {
      // quando torni visibile, ping “forte” (attivo subito)
      if (document.visibilityState === "visible") sendPing(true);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token]);

  // “Safe values” quando non c’è token
  const value = useMemo(
    () => ({
      socket,
      connected: token ? connected : false,
      presenceByUserId: token ? presenceByUserId : {},
    }),
    [token, connected, presenceByUserId]
  );

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}
