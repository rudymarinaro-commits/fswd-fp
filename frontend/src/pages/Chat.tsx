import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { Message, Room, User } from "../types/api";
import { apiFetch } from "../services/api";
import { useSocket } from "../contexts/useSocket";

const API = "http://localhost:3000/api";
const LIMIT = 30;

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function groupMessagesByDay(messages: Message[]) {
  const groups: Record<string, Message[]> = {};
  for (const m of messages) {
    const day = new Date(m.createdAt).toDateString();
    (groups[day] ||= []).push(m);
  }
  return Object.entries(groups);
}

function upsertAndSort(prev: Message[], incoming: Message[]) {
  const map = new Map<number, Message>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

// =====================
// PRESENZA (FASE 4 - Step 3)
// presenceByUserId contiene SOLO ONLINE/IDLE
// OFFLINE = default se l'utente non è nella mappa
// =====================
function getPresenceStatus(
  userId: number,
  map: Record<number, "ONLINE" | "IDLE">
): "ONLINE" | "IDLE" | "OFFLINE" {
  return map[userId] ?? "OFFLINE";
}

function presenceDotStyle(status: "ONLINE" | "IDLE" | "OFFLINE"): CSSProperties {
  const base: CSSProperties = {
    width: 10,
    height: 10,
    borderRadius: 999,
    display: "inline-block",
    flexShrink: 0,
  };

  if (status === "ONLINE") return { ...base, background: "#22c55e" }; // verde
  if (status === "IDLE") return { ...base, background: "#f59e0b" }; // giallo
  return { ...base, background: "#9ca3af" }; // grigio
}

function badgeStyle(): CSSProperties {
  return {
    minWidth: 18,
    height: 18,
    padding: "0 6px",
    borderRadius: 999,
    background: "#ef4444",
    color: "white",
    fontSize: 12,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: "18px",
  };
}

export default function Chat() {
  const { token, user, logout } = useAuth();
  const { socket, connected, presenceByUserId } = useSocket();
  const navigate = useNavigate();

  // LEFT: users list
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  // Selected chat target + room
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [room, setRoom] = useState<Room | null>(null);

  // Messages (current room)
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // ✅ Cache per mantenere storico quando cambi utente
  const [messagesByRoom, setMessagesByRoom] = useState<Record<number, Message[]>>(
    {}
  );
  const [pageByRoom, setPageByRoom] = useState<Record<number, number>>({});
  const [hasMoreByRoom, setHasMoreByRoom] = useState<Record<number, boolean>>(
    {}
  );

  // =====================
  // BADGE / NOTIFICHE (Step 4 extra)
  // =====================
  // otherUserId -> roomId
  const [roomIdByOtherUserId, setRoomIdByOtherUserId] = useState<Record<number, number>>(
    {}
  );
  // roomId -> otherUserId
  const [otherUserIdByRoomId, setOtherUserIdByRoomId] = useState<Record<number, number>>(
    {}
  );
  // roomId -> conteggio non letti
  const [unreadByRoomId, setUnreadByRoomId] = useState<Record<number, number>>({});

  const [toast, setToast] = useState<{
    otherUserId: number;
    roomId: number;
    preview: string;
  } | null>(null);

  const toastTimerRef = useRef<number | null>(null);

  // (opzionale) scroll fondo
  const bottomRef = useRef<HTMLDivElement | null>(null);
  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  // Ref per sapere sempre qual è la room attiva (evita closure stale nel listener socket)
  const currentRoomIdRef = useRef<number | null>(null);
  useEffect(() => {
    currentRoomIdRef.current = room?.id ?? null;
  }, [room?.id]);

  // =====================
  // ✅ BADGE TOTALE (DA INSERIRE QUI)
  // Somma di tutti i badge per room
  // =====================
  const totalUnread = useMemo(() => {
    return Object.values(unreadByRoomId).reduce((sum, n) => sum + n, 0);
  }, [unreadByRoomId]);

  // =====================
  // Helper: garantisce mapping room <-> user
  // (evita chiamate duplicate con una mappa "inflight")
  // =====================
  const inflightRoomReqRef = useRef<Map<number, Promise<Room>>>(new Map());

  async function ensureRoomForOtherUser(otherUserId: number): Promise<Room> {
    if (!token) throw new Error("No token");

    const inflight = inflightRoomReqRef.current.get(otherUserId);
    if (inflight) return inflight;

    const p = apiFetch<Room>(
      "/rooms",
      { method: "POST", body: JSON.stringify({ otherUserId }) },
      token
    )
      .then((r) => {
        setRoomIdByOtherUserId((prev) => ({ ...prev, [otherUserId]: r.id }));
        setOtherUserIdByRoomId((prev) => ({ ...prev, [r.id]: otherUserId }));
        inflightRoomReqRef.current.delete(otherUserId);
        return r;
      })
      .catch((e) => {
        inflightRoomReqRef.current.delete(otherUserId);
        throw e;
      });

    inflightRoomReqRef.current.set(otherUserId, p);
    return p;
  }

  // 1) Load users (REST)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token) return;
      setUsersLoading(true);
      setUsersError(null);

      try {
        const data = await apiFetch<User[]>("/users", {}, token);
        if (!cancelled) setUsers(data);
      } catch (e: any) {
        if (!cancelled) setUsersError(e?.message || "Errore caricamento utenti");
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // 1b) Prefetch roomId per ogni utente (serve per badge su chat non attive)
  useEffect(() => {
    if (!token) return;
    if (!user?.id) return;
    if (users.length === 0) return;

    const others = users.filter((u) => u.id !== user.id);

    for (const u of others) {
      if (roomIdByOtherUserId[u.id]) continue;
      ensureRoomForOtherUser(u.id).catch(() => {
        // ignoriamo: badge non disponibile finché non apri la chat
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.id, users]);

  // 2) Select user -> create/recover DM room (REST)
  async function openChatWith(u: User) {
    if (!token) return;

    setSelectedUser(u);
    setError(null);

    try {
      const r = await apiFetch<Room>(
        "/rooms",
        { method: "POST", body: JSON.stringify({ otherUserId: u.id }) },
        token
      );

      // aggiorna mapping room<->user
      setRoomIdByOtherUserId((prev) => ({ ...prev, [u.id]: r.id }));
      setOtherUserIdByRoomId((prev) => ({ ...prev, [r.id]: u.id }));

      setRoom(r);

      // ✅ azzera badge/non-letti per questa room
      setUnreadByRoomId((prev) => {
        const next = { ...prev };
        delete next[r.id];
        return next;
      });

      // se toast riguarda questa chat, la chiudo
      setToast((t) => (t?.roomId === r.id ? null : t));

      // mostra cache se esiste
      const cachedMsgs = messagesByRoom[r.id] ?? [];
      const cachedPage = pageByRoom[r.id] ?? 1;
      const cachedHasMore = hasMoreByRoom[r.id] ?? false;

      setMessages(cachedMsgs);
      setPage(cachedPage);
      setHasMore(cachedHasMore);

      if (!messagesByRoom[r.id]) setPage(1);
    } catch (e: any) {
      setError(e?.message || "Errore creazione/recupero room");
    }
  }

  // 3) Load messages for current room + pagination (REST)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!token) return;
      if (!room?.id) return;

      setLoadingMsgs(true);
      setError(null);

      try {
        const res = await fetch(
          `${API}/rooms/${room.id}/messages?limit=${LIMIT}&page=${page}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data: Message[] = await res.json();
        if (cancelled) return;

        setMessages((prev) => {
          const merged = upsertAndSort(prev, data);
          setMessagesByRoom((m) => ({ ...m, [room.id]: merged }));
          return merged;
        });

        const more = data.length === LIMIT;
        setHasMore(more);

        setPageByRoom((p) => ({ ...p, [room.id]: page }));
        setHasMoreByRoom((h) => ({ ...h, [room.id]: more }));
      } catch {
        if (!cancelled) setError("Impossibile caricare i messaggi");
      } finally {
        if (!cancelled) setLoadingMsgs(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token, room?.id, page]);

  // =====================
  // STEP 4 — JOIN ROOM realtime
  // =====================
  useEffect(() => {
    if (!token) return;
    if (!room?.id) return;
    if (!connected) return;

    socket.emit("joinRoom", room.id, (ack: any) => {
      if (!ack?.ok) {
        setError(ack?.message || "Impossibile entrare nella room (socket)");
      }
    });
  }, [token, room?.id, connected, socket]);

  // =====================
  // STEP 4 — LISTENER realtime newMessage + badge/notify
  // =====================
  useEffect(() => {
    if (!token) return;

    const onNewMessage = (msg: Message) => {
      // aggiorno SEMPRE la cache stanza
      setMessagesByRoom((m) => {
        const prev = m[msg.roomId] ?? [];
        const merged = upsertAndSort(prev, [msg]);
        return { ...m, [msg.roomId]: merged };
      });

      const currentRoomId = currentRoomIdRef.current;

      // Se è la room attiva -> aggiorno UI
      if (currentRoomId && msg.roomId === currentRoomId) {
        setMessages((prev) => {
          if (prev.some((x) => x.id === msg.id)) return prev;
          return upsertAndSort(prev, [msg]);
        });
        setTimeout(scrollToBottom, 0);
        return;
      }

      // Se NON è la room attiva e NON è un messaggio mio -> badge + toast
      if (msg.userId !== user?.id) {
        setUnreadByRoomId((prev) => ({
          ...prev,
          [msg.roomId]: (prev[msg.roomId] ?? 0) + 1,
        }));

        const otherUserId = otherUserIdByRoomId[msg.roomId];
        if (otherUserId) {
          const preview =
            msg.content.length > 50 ? msg.content.slice(0, 50) + "…" : msg.content;

          setToast({ otherUserId, roomId: msg.roomId, preview });

          if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
          toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
        }
      }
    };

    socket.off("newMessage", onNewMessage);
    socket.on("newMessage", onNewMessage);

    return () => {
      socket.off("newMessage", onNewMessage);
    };
  }, [token, socket, user?.id, otherUserIdByRoomId]);

  const grouped = useMemo(() => groupMessagesByDay(messages), [messages]);

  // =====================
  // STEP 4 — SEND MESSAGE realtime (con fallback REST)
  // =====================
  async function send() {
    if (!token) return;
    if (!room?.id) {
      setError("Seleziona prima un utente");
      return;
    }

    const content = text.trim();
    if (!content) return;

    setSending(true);
    setError(null);

    // ✅ Se socket connesso: invio realtime
    if (connected) {
      socket.emit("sendMessage", { roomId: room.id, content }, (ack: any) => {
        try {
          if (!ack?.ok) {
            setError(ack?.error || "Errore invio messaggio (socket)");
            return;
          }

          const saved: Message = ack.message;
          setText("");

          setMessages((prev) => {
            const merged = upsertAndSort(prev, [saved]);
            setMessagesByRoom((m) => ({ ...m, [room.id]: merged }));
            return merged;
          });

          scrollToBottom();
        } finally {
          setSending(false);
        }
      });

      return;
    }

    // ✅ Fallback REST (se socket non connesso)
    try {
      const res = await fetch(`${API}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ roomId: room.id, content }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const saved: Message = await res.json();
      setText("");

      setMessages((prev) => {
        const merged = upsertAndSort(prev, [saved]);
        setMessagesByRoom((m) => ({ ...m, [room.id]: merged }));
        return merged;
      });

      scrollToBottom();
    } catch {
      setError("Errore invio messaggio");
    } finally {
      setSending(false);
    }
  }

  // Helper: badge count per utente
  function getUnreadForUser(otherUserId: number) {
    const rid = roomIdByOtherUserId[otherUserId];
    if (!rid) return 0;
    return unreadByRoomId[rid] ?? 0;
  }

  // Click su toast -> apri chat con quell'utente
  async function openFromToast() {
    if (!toast) return;
    const target = users.find((u) => u.id === toast.otherUserId);
    if (target) await openChatWith(target);
  }

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* LEFT COLUMN */}
      <aside
        style={{
          width: 300,
          borderRight: "1px solid #ddd",
          padding: 12,
          overflow: "auto",
        }}
      >
        {/* ✅ QUI È STATO INSERITO IL BADGE TOTALE ACCANTO A "UTENTI" */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong>Utenti</strong>
            {totalUnread > 0 && <span style={badgeStyle()}>{totalUnread}</span>}
          </div>
          <button onClick={() => navigate("/profile")}>Profilo</button>
        </div>

        <div style={{ margin: "8px 0" }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Loggato come: {user?.email}
          </div>
          {user?.role === "ADMIN" && (
            <button onClick={() => navigate("/admin")}>Admin</button>
          )}
          <button onClick={logout} style={{ marginLeft: 8 }}>
            Logout
          </button>
        </div>

        {/* Notifica “toast” (room non attiva) */}
        {toast && (
          <button
            onClick={openFromToast}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "8px 10px",
              border: "1px solid #ddd",
              borderRadius: 8,
              background: "#fff7ed",
              cursor: "pointer",
              marginBottom: 10,
            }}
            title="Apri la chat"
          >
            <div style={{ fontWeight: 600, fontSize: 12 }}>Nuovo messaggio</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{toast.preview}</div>
          </button>
        )}

        {usersLoading && <div>Caricamento utenti...</div>}
        {usersError && <div style={{ color: "red" }}>{usersError}</div>}

        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {users
            .filter((u) => u.id !== user?.id)
            .map((u) => {
              const active = selectedUser?.id === u.id;
              const status = getPresenceStatus(u.id, presenceByUserId);
              const unread = getUnreadForUser(u.id);

              return (
                <li key={u.id} style={{ marginBottom: 6 }}>
                  <button
                    onClick={() => openChatWith(u)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      background: active ? "#f3f3f3" : "white",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={presenceDotStyle(status)} />
                        <div>{u.email}</div>
                      </div>

                      {unread > 0 && <span style={badgeStyle()}>{unread}</span>}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.7 }}>{u.role}</div>
                  </button>
                </li>
              );
            })}
        </ul>
      </aside>

      {/* MAIN CHAT */}
      <main style={{ flex: 1, padding: 12, overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>
            {selectedUser ? `Chat con ${selectedUser.email}` : "Seleziona un utente"}
          </h2>

          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {room ? `roomId=${room.id}` : ""}
          </div>
        </div>

        {error && <div style={{ color: "red", marginTop: 8 }}>{error}</div>}

        {room && hasMore && (
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={loadingMsgs}
            style={{ marginTop: 10 }}
          >
            {loadingMsgs ? "Carico..." : "Carica altri"}
          </button>
        )}

        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {grouped.map(([day, msgs]) => (
            <section key={day}>
              <div style={{ opacity: 0.7, marginBottom: 6 }}>
                {formatDate(new Date(day).toISOString())}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {msgs.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      padding: 10,
                      border: "1px solid #ddd",
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      userId: {m.userId} —{" "}
                      {new Date(m.createdAt).toLocaleString("it-IT")}
                    </div>
                    <div>{m.content}</div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <div ref={bottomRef} />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={room ? "Scrivi un messaggio..." : "Seleziona un utente..."}
            style={{ flex: 1 }}
            disabled={!room || sending}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
          />
          <button onClick={send} disabled={sending || !room}>
            {sending ? "Invio..." : "Invia"}
          </button>
        </div>
      </main>
    </div>
  );
}
