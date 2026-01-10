// frontend/src/pages/Chat.tsx
import {
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
  return { ...base, background: "#ef4444" }; // OFFLINE: rosso (traccia)
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
  const [otherUserIdByRoomId, setOtherUserIdByRoomId] = useState<
    Record<number, number>
  >({});
  const [unreadByRoomId, setUnreadByRoomId] = useState<Record<number, number>>(
    {}
  );

  const [toast, setToast] = useState<{
    otherUserId: number;
    roomId: number;
    preview: string;
  } | null>(null);

  const toastTimerRef = useRef<number | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

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

  function closeCall() {
    setCallOpen(false);
    setIncomingOffer(null);
    setCallKey((k) => k + 1);
  }

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

  async function openChatWith(u: User) {
    if (!token) return;

    setSelectedUser(u);
    setError(null);

    // ✅ reset stato UI per evitare join su room precedente e residui (stabilità)
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
      setOtherUserIdByRoomId((prev) => ({ ...prev, [r.id]: u.id }));

      setRoom(r);

      setUnreadByRoomId((prev) => {
        const next = { ...prev };
        delete next[r.id];
        return next;
      });

      setToast((t) => (t?.roomId === r.id ? null : t));

      const cachedMsgs = messagesByRoom[r.id] ?? [];
      const cachedPage = pageByRoom[r.id] ?? 1;
      const cachedHasMore = hasMoreByRoom[r.id] ?? false;

      setMessages(cachedMsgs);
      setPage(cachedPage);
      setHasMore(cachedHasMore);

      if (cachedMsgs.length === 0) {
        setPage(1);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore apertura chat";
      setError(msg);
    }
  }

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

        setUnreadByRoomId((prev) => {
          const next = { ...prev };
          delete next[room.id];
          return next;
        });

        setToast((t) => (t?.roomId === room.id ? null : t));
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

  // joinRoom realtime (✅ SOLO joinRoom)
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

  // unread + toast on newMessage/message:new
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
        return;
      }

      // ✅ evita badge falsi per messaggi inviati da me (multi-tab)
      if (msg.userId === user?.id) return;

      setUnreadByRoomId((prev) => ({
        ...prev,
        [msg.roomId]: (prev[msg.roomId] ?? 0) + 1,
      }));

      const otherUserId =
        otherUserIdByRoomId[msg.roomId] ??
        (msg.userId === user?.id ? null : msg.userId);

      if (otherUserId) {
        // ✅ mapping room<->otherUser per far apparire badge anche su room “non mappate”
        setOtherUserIdByRoomId((prev) => {
          if (prev[msg.roomId] === otherUserId) return prev;
          if (prev[msg.roomId]) return prev;
          return { ...prev, [msg.roomId]: otherUserId };
        });

        setRoomIdByOtherUserId((prev) => {
          if (prev[otherUserId] === msg.roomId) return prev;
          if (prev[otherUserId]) return prev;
          return { ...prev, [otherUserId]: msg.roomId };
        });

        setToast({
          otherUserId,
          roomId: msg.roomId,
          preview: msg.content.slice(0, 80),
        });

        if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => {
          setToast(null);
          toastTimerRef.current = null;
        }, 5000);
      }
    };

    socket.on("newMessage", onNewMessage);
    socket.on("message:new", onNewMessage);

    return () => {
      socket.off("newMessage", onNewMessage);
      socket.off("message:new", onNewMessage);
    };
  }, [connected, otherUserIdByRoomId, socket, user?.id]);

  useEffect(() => {
    if (messages.length === 0) return;
    scrollToBottom();
  }, [messages.length]);

  const grouped = useMemo(() => groupMessagesByDay(messages), [messages]);

  async function send() {
    if (!token) return;
    if (!room?.id) return;
    if (!text.trim()) return;

    const content = text.trim();
    setText("");
    setError(null);

    // prefer socket se connesso
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
          }

          setSending(false);
        }
      );

      return;
    }

    // fallback REST
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
      }
    } catch {
      setError("Impossibile inviare il messaggio");
    } finally {
      setSending(false);
    }
  }

  function loadMore() {
    if (!hasMore) return;
    setPage((p) => p + 1);
  }

  function getUnreadForUser(otherUserId: number) {
    const rid = roomIdByOtherUserId[otherUserId];
    if (!rid) return 0;
    return unreadByRoomId[rid] ?? 0;
  }

  async function openFromToast() {
    if (!toast) return;
    const target = users.find((u) => u.id === toast.otherUserId);
    if (target) await openChatWith(target);
  }

  // ====== incoming call handling (offer) ======
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

  function startVideoCall() {
    if (!room?.id || !selectedUser) return;
    setIncomingOffer(null);
    setCallRole("caller");
    setCallRoomId(room.id);
    setCallOtherUser(selectedUser);
    setCallOpen(true);
    setCallKey((k) => k + 1);
  }

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <aside style={{ width: 320, padding: 12, borderRight: "1px solid #ddd" }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 700 }}>Utenti</div>
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

      {/* toast */}
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
            <button onClick={() => void openFromToast()}>Apri</button>
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
