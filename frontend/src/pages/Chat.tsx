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
  return { ...base, background: "#9ca3af" };
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

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isIncomingOfferPayload(x: unknown): x is IncomingOffer {
  if (!isRecord(x)) return false;
  const roomIdOk = typeof x.roomId === "number";
  const fromOk = typeof x.fromUserId === "number";
  const modeOk = x.mode === "video" || typeof x.mode === "undefined";
  const sdpOk =
    isRecord(x.sdp) &&
    x.sdp.type === "offer" &&
    (typeof x.sdp.sdp === "string" || typeof x.sdp.sdp === "undefined");
  return roomIdOk && fromOk && modeOk && sdpOk;
}

type JoinRoomAck = { ok: boolean; message?: string };
type SendAck = { ok: boolean; message?: Message; error?: string };

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

function parseSendAck(x: unknown): SendAck | null {
  if (!isRecord(x)) return null;
  if (typeof x.ok !== "boolean") return null;

  const error = typeof x.error === "string" ? x.error : undefined;

  const msgUnknown = x.message;
  const message = isMessageLike(msgUnknown) ? msgUnknown : undefined;

  return { ok: x.ok, error, message };
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

  // Load users
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token) return;
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

  // Prefetch rooms
  useEffect(() => {
    if (!token) return;
    if (!user?.id) return;
    if (users.length === 0) return;

    const others = users.filter((u) => u.id !== user.id);
    for (const u of others) {
      if (roomIdByOtherUserId[u.id]) continue;
      ensureRoomForOtherUser(u.id).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.id, users]);

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

      if (!messagesByRoom[r.id]) setPage(1);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Errore creazione/recupero room";
      setError(msg);
    }
  }

  // Load messages
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

  // joinRoom realtime
  useEffect(() => {
    if (!token) return;
    if (!room?.id) return;
    if (!connected) return;

    socket.emit("joinRoom", room.id, (ackRaw: unknown) => {
      const ack = parseJoinAck(ackRaw);
      if (!ack) return;
      if (!ack.ok) setError(ack.message || "Errore joinRoom");
    });

    socket.emit("room:join", room.id, (ackRaw: unknown) => {
      const ack = parseJoinAck(ackRaw);
      if (!ack) return;
      if (!ack.ok) setError(ack.message || "Errore room:join");
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

      setUnreadByRoomId((prev) => ({
        ...prev,
        [msg.roomId]: (prev[msg.roomId] ?? 0) + 1,
      }));

      const otherUserId =
        otherUserIdByRoomId[msg.roomId] ??
        (msg.userId === user?.id ? null : msg.userId);

      if (otherUserId) {
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

  // scroll bottom on messages
  useEffect(() => {
    if (messages.length === 0) return;
    scrollToBottom();
  }, [messages.length]);

  const grouped = useMemo(() => groupMessagesByDay(messages), [messages]);

  // Presence ping (keepalive)
  useEffect(() => {
    if (!connected) return;

    const t = window.setInterval(() => {
      socket.emit("presence:ping");
    }, 20_000);

    return () => window.clearInterval(t);
  }, [connected, socket]);

  async function send() {
    if (!token) return;
    if (!room?.id) return;

    const content = text.trim();
    if (!content) return;

    setSending(true);
    setError(null);

    if (connected) {
      socket.emit(
        "sendMessage",
        { roomId: room.id, content },
        (ackRaw: unknown) => {
          try {
            const ack = parseSendAck(ackRaw);
            if (!ack?.ok || !ack.message) {
              setError(ack?.error || "Errore invio messaggio (socket)");
              return;
            }

            const saved = ack.message;
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
        }
      );

      return;
    }

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

  // =====================
  // CALL STATE
  // =====================
  const [callOpen, setCallOpen] = useState(false);
  const [callKey, setCallKey] = useState<string>("");
  const [callRole, setCallRole] = useState<"caller" | "callee">("caller");
  const [incomingOffer, setIncomingOffer] = useState<IncomingOffer | null>(
    null
  );
  const [callRoomId, setCallRoomId] = useState<number | null>(null);
  const [callOtherUser, setCallOtherUser] = useState<User | null>(null);

  function closeCall() {
    setCallOpen(false);
    setIncomingOffer(null);
    setCallRoomId(null);
    setCallOtherUser(null);
    setCallKey("");
  }

  function startVideoCall() {
    if (!room?.id || !selectedUser) {
      setError("Seleziona prima un utente");
      return;
    }
    if (!connected) {
      setError("Socket non connesso (attendi qualche secondo e riprova)");
      return;
    }

    setError(null);
    setCallRole("caller");
    setCallRoomId(room.id);
    setCallOtherUser(selectedUser);
    setIncomingOffer(null);
    setCallKey(`${Date.now()}-video-caller`);
    setCallOpen(true);
  }

  // ✅ LISTENER OFFER (callee)
  useEffect(() => {
    if (!connected) return;

    const onOffer = (payload: unknown) => {
      if (!isIncomingOfferPayload(payload)) return;

      // ✅ Se c’è già una call davvero attiva (modal aperta + room valorizzata), ignora.
      // ✅ Se callOpen è true ma callRoomId è null (stato incoerente), NON bloccare le nuove offer.
      if (callOpen && callRoomId) return;

      const other = users.find((u) => u.id === payload.fromUserId) ?? null;

      setCallRole("callee");
      setCallRoomId(payload.roomId);
      setCallOtherUser(other);
      setIncomingOffer(payload);
      setCallKey(`${Date.now()}-video-callee`);
      setCallOpen(true);
    };

    socket.on("webrtc:offer", onOffer);
    return () => {
      socket.off("webrtc:offer", onOffer);
    };
  }, [callOpen, callRoomId, connected, socket, users]);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <aside
        style={{
          width: 300,
          borderRight: "1px solid #ddd",
          padding: 12,
          overflow: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <strong>Utenti</strong>
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <h2 style={{ margin: 0 }}>
            {selectedUser
              ? `Chat con ${selectedUser.email}`
              : "Seleziona un utente"}
          </h2>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {room ? `roomId=${room.id}` : ""}
            </div>

            <button disabled={!room || !connected} onClick={startVideoCall}>
              Video
            </button>
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
