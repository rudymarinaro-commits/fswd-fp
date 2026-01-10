// frontend/src/pages/Chat.tsx
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { Message, Room, User } from "../types/api";
import { apiFetch } from "../services/api";
import { useSocket } from "../contexts/useSocket";
import CallModal, { type IncomingOffer } from "../components/CallModal";

const API = "http://localhost:3000/api";
const LIMIT = 30;

// Badge polling: solo FE, zero modifiche backend
const BADGE_POLL_MS = 4000;
const BADGE_LOOKBACK_LIMIT = 10;

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTime(date: string) {
  return new Date(date).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupMessagesByDay(messages: Message[]) {
  const groups: Array<{ day: string; items: Message[] }> = [];
  let current = "";

  for (const m of messages) {
    const day = formatDate(m.createdAt);
    if (day !== current) {
      groups.push({ day, items: [m] });
      current = day;
    } else {
      groups[groups.length - 1]?.items.push(m);
    }
  }

  return groups;
}

function upsertAndSort(prev: Message[], incoming: Message[]) {
  const map = new Map<number, Message>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);

  const arr = Array.from(map.values());
  arr.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  return arr;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

type JoinRoomAck = { ok: boolean; message?: string };

function parseJoinAck(x: unknown): JoinRoomAck | null {
  if (!isRecord(x)) return null;
  if (typeof x.ok !== "boolean") return null;
  const message = typeof x.message === "string" ? x.message : undefined;
  return { ok: x.ok, message };
}

function isMessageLike(x: unknown): x is Message {
  if (!isRecord(x)) return false;
  return (
    typeof x.id === "number" &&
    typeof x.content === "string" &&
    typeof x.userId === "number" &&
    typeof x.roomId === "number" &&
    typeof x.createdAt === "string"
  );
}

type MessageResponse = { ok: boolean; message?: Message; error?: string };

function isMessageResponse(x: unknown): x is MessageResponse {
  if (!isRecord(x)) return false;
  if (typeof x.ok !== "boolean") return false;

  if (x.message && !isMessageLike(x.message)) return false;
  if (x.error && typeof x.error !== "string") return false;

  return true;
}

function getPresenceStatus(
  userId: number,
  map: Record<number, "ONLINE" | "IDLE">
): "ONLINE" | "IDLE" | "OFFLINE" {
  return map[userId] ?? "OFFLINE";
}

function presenceDotStyle(
  status: "ONLINE" | "IDLE" | "OFFLINE"
): CSSProperties {
  const base: CSSProperties = {
    width: 10,
    height: 10,
    borderRadius: 999,
    display: "inline-block",
    flexShrink: 0,
  };

  if (status === "ONLINE") return { ...base, background: "#22c55e" };
  if (status === "IDLE") return { ...base, background: "#f59e0b" };
  return { ...base, background: "#ef4444" };
}

function badgeStyle(bg = "#ef4444"): CSSProperties {
  return {
    minWidth: 18,
    height: 18,
    padding: "0 6px",
    borderRadius: 999,
    background: bg,
    color: "white",
    fontSize: 12,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: "18px",
  };
}

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export default function Chat() {
  const { token, user, logout } = useAuth();
  const { socket, connected, presenceByUserId } = useSocket();
  const navigate = useNavigate();

  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [room, setRoom] = useState<Room | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const [messagesByRoom, setMessagesByRoom] = useState<
    Record<number, Message[]>
  >({});
  const [pageByRoom, setPageByRoom] = useState<Record<number, number>>({});
  const [hasMoreByRoom, setHasMoreByRoom] = useState<Record<number, boolean>>(
    {}
  );

  const [roomIdByOtherUserId, setRoomIdByOtherUserId] = useState<
    Record<number, number>
  >({});
  const [unreadByRoomId, setUnreadByRoomId] = useState<Record<number, number>>(
    {}
  );

  // lastSeen persistente per badge (no backend)
  const [lastSeenByRoomId, setLastSeenByRoomId] = useState<
    Record<number, string>
  >({});

  const lastSeenKey = user?.id ? `fswd:lastSeenByRoom:${user.id}` : null;

  useEffect(() => {
    if (!lastSeenKey) return;
    const saved = safeParseJson<Record<number, string>>(
      localStorage.getItem(lastSeenKey)
    );
    if (saved) setLastSeenByRoomId(saved);
  }, [lastSeenKey]);

  const persistLastSeen = useCallback(
    (next: Record<number, string>) => {
      if (!lastSeenKey) return;
      localStorage.setItem(lastSeenKey, JSON.stringify(next));
    },
    [lastSeenKey]
  );

  const markRoomSeen = useCallback(
    (roomId: number, iso: string) => {
      setLastSeenByRoomId((prev) => {
        const next = { ...prev, [roomId]: iso };
        persistLastSeen(next);
        return next;
      });

      setUnreadByRoomId((prev) => {
        if (!prev[roomId]) return prev;
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
    },
    [persistLastSeen]
  );

  const [toast, setToast] = useState<{
    otherUserId: number;
    roomId: number;
    preview: string;
  } | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const currentRoomIdRef = useRef<number | null>(null);
  useEffect(() => {
    currentRoomIdRef.current = room?.id ?? null;
  }, [room?.id]);

  // ====== VIDEO CALL ======
  const [callOpen, setCallOpen] = useState(false);
  const [callRoomId, setCallRoomId] = useState<number | null>(null);
  const [callOtherUser, setCallOtherUser] = useState<User | null>(null);
  const [incomingOffer, setIncomingOffer] = useState<IncomingOffer | null>(
    null
  );
  const [callKey, setCallKey] = useState(0);
  const [callRole, setCallRole] = useState<"caller" | "callee">("caller");

  const closeCall = useCallback(() => {
    setCallOpen(false);
    setIncomingOffer(null);
    setCallKey((k) => k + 1);
  }, []);

  // load users
  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    (async () => {
      setUsersLoading(true);
      setUsersError(null);

      try {
        const data = await apiFetch<User[]>("/users", {}, token);
        if (!cancelled) setUsers(data);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Errore caricamento utenti";
        if (!cancelled) setUsersError(msg);
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const openChatWith = useCallback(
    async (u: User) => {
      if (!token) return;

      setSelectedUser(u);
      setError(null);

      // reset UI (stabilità)
      setRoom(null);
      setMessages([]);
      setPage(1);
      setHasMore(false);

      try {
        const r = await apiFetch<Room>(
          "/rooms",
          { method: "POST", body: JSON.stringify({ otherUserId: u.id }) },
          token
        );

        setRoomIdByOtherUserId((prev) => ({ ...prev, [u.id]: r.id }));
        setRoom(r);

        const cachedMsgs = messagesByRoom[r.id] ?? [];
        const cachedPage = pageByRoom[r.id] ?? 1;
        const cachedHasMore = hasMoreByRoom[r.id] ?? false;

        setMessages(cachedMsgs);
        setPage(cachedPage);
        setHasMore(cachedHasMore);

        // considero letto fino ad ora (poi viene raffinato quando carico messaggi)
        markRoomSeen(r.id, new Date().toISOString());

        if (cachedMsgs.length === 0) {
          setPage(1);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Errore apertura chat";
        setError(msg);
      }
    },
    [token, messagesByRoom, pageByRoom, hasMoreByRoom, markRoomSeen]
  );

  // Load messages for current room + page
  useEffect(() => {
    if (!token) return;
    if (!room?.id) return;

    let cancelled = false;

    async function load() {
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

        setMessagesByRoom((prev) => {
          const roomMsgs = prev[room.id] ?? [];
          const merged = upsertAndSort(roomMsgs, data);
          return { ...prev, [room.id]: merged };
        });

        const more = data.length === LIMIT;

        setMessages((prev) => upsertAndSort(prev, data));
        setHasMore(more);

        setPageByRoom((p) => ({ ...p, [room.id]: page }));
        setHasMoreByRoom((h) => ({ ...h, [room.id]: more }));

        const last = data[data.length - 1];
        if (last) markRoomSeen(room.id, last.createdAt);
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
  }, [token, room?.id, page, markRoomSeen]);

  // joinRoom realtime (solo joinRoom)
  useEffect(() => {
    if (!token) return;
    if (!room?.id) return;
    if (!connected) return;

    socket.emit("joinRoom", room.id, (ackRaw: unknown) => {
      const ack = parseJoinAck(ackRaw);
      if (!ack) return;

      if (!ack.ok) {
        setError(ack.message || "Errore joinRoom");
        return;
      }

      setError(null);
    });
  }, [connected, room?.id, socket, token]);

  // realtime messages (solo quando dentro room)
  useEffect(() => {
    if (!connected) return;

    const onNewMessage = (payload: unknown) => {
      if (!isMessageLike(payload)) return;

      const msg = payload;
      const currentRoomId = currentRoomIdRef.current;

      setMessagesByRoom((prev) => {
        const roomMsgs = prev[msg.roomId] ?? [];
        const merged = upsertAndSort(roomMsgs, [msg]);
        return { ...prev, [msg.roomId]: merged };
      });

      if (currentRoomId === msg.roomId) {
        setMessages((prev) => upsertAndSort(prev, [msg]));
        scrollToBottom();
        markRoomSeen(msg.roomId, msg.createdAt);
      }
    };

    socket.on("newMessage", onNewMessage);
    socket.on("message:new", onNewMessage);

    return () => {
      socket.off("newMessage", onNewMessage);
      socket.off("message:new", onNewMessage);
    };
  }, [connected, socket, scrollToBottom, markRoomSeen]);

  useEffect(() => {
    if (messages.length === 0) return;
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  const grouped = useMemo(() => groupMessagesByDay(messages), [messages]);

  const send = useCallback(async () => {
    if (!token) return;
    if (!room?.id) return;
    if (!text.trim()) return;

    const content = text.trim();
    setText("");
    setError(null);

    if (connected) {
      setSending(true);

      socket.emit(
        "sendMessage",
        { roomId: room.id, content },
        (ackRaw: unknown) => {
          if (!isMessageResponse(ackRaw)) {
            setError("Errore invio messaggio");
            setSending(false);
            return;
          }

          if (!ackRaw.ok || !ackRaw.message) {
            setError(ackRaw.error || "Errore invio messaggio");
            setSending(false);
            return;
          }

          const saved = ackRaw.message;

          setMessagesByRoom((prev) => {
            const roomMsgs = prev[saved.roomId] ?? [];
            const merged = upsertAndSort(roomMsgs, [saved]);
            return { ...prev, [saved.roomId]: merged };
          });

          if (currentRoomIdRef.current === saved.roomId) {
            setMessages((prev) => upsertAndSort(prev, [saved]));
            scrollToBottom();
            markRoomSeen(saved.roomId, saved.createdAt);
          }

          setSending(false);
        }
      );

      return;
    }

    try {
      setSending(true);

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

      setMessagesByRoom((prev) => {
        const roomMsgs = prev[saved.roomId] ?? [];
        const merged = upsertAndSort(roomMsgs, [saved]);
        return { ...prev, [saved.roomId]: merged };
      });

      if (currentRoomIdRef.current === saved.roomId) {
        setMessages((prev) => upsertAndSort(prev, [saved]));
        scrollToBottom();
        markRoomSeen(saved.roomId, saved.createdAt);
      }
    } catch {
      setError("Impossibile inviare il messaggio");
    } finally {
      setSending(false);
    }
  }, [token, room?.id, text, connected, socket, scrollToBottom, markRoomSeen]);

  const loadMore = useCallback(() => {
    if (!hasMore) return;
    setPage((p) => p + 1);
  }, [hasMore]);

  function getUnreadForUser(otherUserId: number) {
    const rid = roomIdByOtherUserId[otherUserId];
    if (!rid) return 0;
    return unreadByRoomId[rid] ?? 0;
  }

  // ====== incoming call handling ======
  useEffect(() => {
    if (!connected) return;

    const onIncomingOffer = (payload: unknown) => {
      if (!isRecord(payload)) return;
      const roomId = payload.roomId;
      const fromUserId = payload.fromUserId;

      if (typeof roomId !== "number" || typeof fromUserId !== "number") return;

      const fromUser = users.find((u) => u.id === fromUserId) ?? null;

      setIncomingOffer(payload as IncomingOffer);
      setCallRole("callee");
      setCallRoomId(roomId);
      setCallOtherUser(fromUser);
      setCallOpen(true);
      setCallKey((k) => k + 1);
    };

    socket.on("webrtc:offer", onIncomingOffer);
    return () => {
      socket.off("webrtc:offer", onIncomingOffer);
    };
  }, [connected, socket, users]);

  const startVideoCall = useCallback(() => {
    if (!room?.id || !selectedUser) return;
    setIncomingOffer(null);
    setCallRole("caller");
    setCallRoomId(room.id);
    setCallOtherUser(selectedUser);
    setCallOpen(true);
    setCallKey((k) => k + 1);
  }, [room?.id, selectedUser]);

  // ✅ BADGE POLLING (no backend)
  useEffect(() => {
    if (!token) return;
    if (!user?.id) return;

    let alive = true;
    const controller = new AbortController();

    async function pollOnce() {
      try {
        const rooms = await apiFetch<
          Array<Room & { user1Id: number; user2Id: number }>
        >("/rooms/my", {}, token);

        if (!alive) return;

        // mapping room<->otherUser (serve per badge in lista utenti)
        const nextRoomIdByOther: Record<number, number> = {};
        for (const r of rooms) {
          const otherUserId = r.user1Id === user.id ? r.user2Id : r.user1Id;
          nextRoomIdByOther[otherUserId] = r.id;
        }
        setRoomIdByOtherUserId((prev) => ({ ...prev, ...nextRoomIdByOther }));

        const unreadUpdates: Record<number, number> = {};

        for (const r of rooms) {
          const currentRoomId = currentRoomIdRef.current;
          if (currentRoomId === r.id) continue;

          const seenIso = lastSeenByRoomId[r.id];
          const seenTime = seenIso ? new Date(seenIso).getTime() : 0;

          const res = await fetch(
            `${API}/rooms/${r.id}/messages?limit=${BADGE_LOOKBACK_LIMIT}&page=1`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: controller.signal,
            }
          );

          if (!res.ok) continue;

          const data: Message[] = await res.json();
          if (!alive) return;

          let count = 0;
          for (const m of data) {
            if (m.userId === user.id) continue;
            const t = new Date(m.createdAt).getTime();
            if (t > seenTime) count += 1;
          }

          if (count > 0) unreadUpdates[r.id] = count;
        }

        setUnreadByRoomId((prev) => {
          const next: Record<number, number> = { ...prev };

          for (const [k, v] of Object.entries(unreadUpdates)) {
            next[Number(k)] = v;
          }

          // elimina quelle room che ora risultano 0 e sono presenti in rooms
          const roomIds = new Set(rooms.map((r) => r.id));
          for (const k of Object.keys(next)) {
            const roomId = Number(k);
            if (!roomIds.has(roomId)) continue;
            if (!unreadUpdates[roomId]) delete next[roomId];
          }

          return next;
        });
      } catch {
        // silenzioso: il polling non deve rompere UI
      }
    }

    const id = window.setInterval(() => void pollOnce(), BADGE_POLL_MS);
    void pollOnce();

    return () => {
      alive = false;
      controller.abort();
      window.clearInterval(id);
    };
  }, [token, user?.id, lastSeenByRoomId]);

  function getUnreadTotal() {
    let total = 0;
    for (const v of Object.values(unreadByRoomId)) total += v;
    return total;
  }

  const unreadTotal = getUnreadTotal();

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <aside style={{ width: 320, padding: 12, borderRight: "1px solid #ddd" }}>
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>Utenti</span>
            {unreadTotal > 0 && (
              <span style={badgeStyle("#111827")}>{unreadTotal}</span>
            )}
          </div>

          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Loggato come: {user?.email}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => navigate("/profile")}>Profilo</button>
            <button onClick={() => logout()}>Logout</button>
          </div>
        </div>

        {usersLoading && <div>Caricamento...</div>}
        {usersError && <div style={{ color: "crimson" }}>{usersError}</div>}

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
                    onClick={() => void openChatWith(u)}
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
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
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

      <main style={{ flex: 1, padding: 12, overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>
            {selectedUser
              ? `Chat con ${selectedUser.email}`
              : "Seleziona un utente"}
          </h2>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={startVideoCall} disabled={!room || !selectedUser}>
              Video
            </button>
          </div>
        </div>

        {error && <div style={{ color: "crimson", marginTop: 6 }}>{error}</div>}

        <div style={{ marginTop: 12 }}>
          {hasMore && (
            <button onClick={loadMore} style={{ marginBottom: 8 }}>
              Carica altri
            </button>
          )}

          {loadingMsgs && <div>Caricamento messaggi...</div>}

          {grouped.map((g) => (
            <div key={g.day} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{g.day}</div>

              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {g.items.map((m) => {
                  const mine = m.userId === user?.id;
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        justifyContent: mine ? "flex-end" : "flex-start",
                      }}
                    >
                      <div
                        style={{
                          maxWidth: "70%",
                          border: "1px solid #ddd",
                          borderRadius: 10,
                          padding: "8px 10px",
                          background: mine ? "#eff6ff" : "white",
                        }}
                      >
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {formatTime(m.createdAt)}
                        </div>
                        <div style={{ whiteSpace: "pre-wrap" }}>
                          {m.content}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              room ? "Scrivi un messaggio..." : "Seleziona un utente..."
            }
            style={{ flex: 1 }}
            disabled={!room || sending}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
          />
          <button onClick={() => void send()} disabled={sending || !room}>
            {sending ? "Invio..." : "Invia"}
          </button>
        </div>
      </main>

      {toast && (
        <div
          style={{
            position: "fixed",
            right: 18,
            bottom: 18,
            border: "1px solid #ddd",
            background: "white",
            borderRadius: 10,
            padding: 12,
            width: 320,
            boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Nuovo messaggio
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Da utente #{toast.otherUserId} — room #{toast.roomId}
          </div>
          <div style={{ marginTop: 8 }}>{toast.preview}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              onClick={() =>
                void openChatWith(
                  users.find((u) => u.id === toast.otherUserId) ?? users[0]!
                )
              }
            >
              Apri
            </button>
            <button onClick={() => setToast(null)}>Chiudi</button>
          </div>
        </div>
      )}

      {callOpen && callRoomId && (
        <CallModal
          key={callKey}
          role={callRole}
          roomId={callRoomId}
          otherUser={callOtherUser}
          socket={socket}
          incomingOffer={incomingOffer}
          onClose={closeCall}
        />
      )}
    </div>
  );
}
