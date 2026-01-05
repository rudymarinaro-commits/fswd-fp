import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { Message, Room, User } from "../types/api";
import { apiFetch } from "../services/api";
// import { socket, setSocketToken } from "../services/socket"; // FASE 4

const API = "http://localhost:3000/api";
const LIMIT = 30;

// ✅ per FASE 3: REST only (socket lo riattiviamo in FASE 4)
const USE_SOCKET = false;

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

export default function Chat() {
  const { token, user, logout } = useAuth();
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

  // (opzionale) scroll fondo
  const bottomRef = useRef<HTMLDivElement | null>(null);
  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  // 1) Load users
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

  // 2) Select user -> create/recover DM room (FASE 3)
  async function openChatWith(u: User) {
    if (!token) return;

    setSelectedUser(u);
    setError(null);

    // Nota: NON svuotiamo brutalmente la chat
    // Mostriamo cache appena abbiamo roomId

    try {
      const r = await apiFetch<Room>(
        "/rooms",
        {
          method: "POST",
          body: JSON.stringify({ otherUserId: u.id }),
        },
        token
      );

      setRoom(r);

      // mostra cache se esiste
      const cachedMsgs = messagesByRoom[r.id] ?? [];
      const cachedPage = pageByRoom[r.id] ?? 1;
      const cachedHasMore = hasMoreByRoom[r.id] ?? false;

      setMessages(cachedMsgs);
      setPage(cachedPage);
      setHasMore(cachedHasMore);

      // se non c'è cache, forziamo page=1 (scatterà il fetch se room cambia)
      if (!messagesByRoom[r.id]) {
        setPage(1);
      }
    } catch (e: any) {
      setError(e?.message || "Errore creazione/recupero room");
    }
  }

  // 3) Load messages for current room + pagination
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
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data: Message[] = await res.json();
        if (cancelled) return;

        setMessages((prev) => {
          const merged = upsertAndSort(prev, data);

          // ✅ aggiorna cache
          setMessagesByRoom((m) => ({ ...m, [room.id]: merged }));
          return merged;
        });

        const more = data.length === LIMIT;
        setHasMore(more);

        // ✅ cache page/hasMore
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

  // 4) Socket (FASE 4) — pronto ma disattivato
  useEffect(() => {
    if (!USE_SOCKET) return;
    if (!token) return;
    if (!room?.id) return;

    // setSocketToken(token);
    // socket.connect();
    // socket.emit("joinRoom", room.id);

    // const onNewMessage = (msg: Message) => {
    //   setMessages((prev) => {
    //     if (prev.some((m) => m.id === msg.id)) return prev;
    //     const merged = upsertAndSort(prev, [msg]);
    //     setMessagesByRoom((m) => ({ ...m, [room.id]: merged }));
    //     return merged;
    //   });
    // };
    // socket.on("newMessage", onNewMessage);

    return () => {
      // socket.off("newMessage", onNewMessage);
    };
  }, [token, room?.id]);

  const grouped = useMemo(() => groupMessagesByDay(messages), [messages]);

  // 5) Send message (REST) — ✅ NON resettare la chat
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

      // ✅ il backend dovrebbe restituire il messaggio creato
      const saved: Message = await res.json();

      setText("");

      // ✅ aggiungiamo subito alla UI + cache
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
        <div style={{ display: "flex", justifyContent: "space-between" }}>
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

        {usersLoading && <div>Caricamento utenti...</div>}
        {usersError && <div style={{ color: "red" }}>{usersError}</div>}

        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {users
            .filter((u) => u.id !== user?.id)
            .map((u) => {
              const active = selectedUser?.id === u.id;
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
                    <div>{u.email}</div>
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
