import { useEffect, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import type { Message } from "../types/api";
import { socket } from "../services/socket";

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
  for (const msg of messages) {
    const day = new Date(msg.createdAt).toDateString();
    if (!groups[day]) groups[day] = [];
    groups[day].push(msg);
  }
  return groups;
}

export default function Chat() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();

  const [roomId] = useState<number>(2);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [presence, setPresence] = useState<Record<number, string>>({});

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Presence + socket connect
  useEffect(() => {
    if (!token) return;

    socket.auth = { token };
    socket.connect();

    socket.on("presence:update", ({ userId, status }) => {
      setPresence((prev) => ({ ...prev, [userId]: status }));
    });

    return () => {
      socket.off("presence:update");
      socket.disconnect();
    };
  }, [token]);

  // Storico + realtime
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function loadHistory() {
      try {
        setLoading(true);
        setError(null);
        const offset = page * LIMIT;

        const res = await fetch(
          `http://localhost:3000/rooms/${roomId}/messages?limit=${LIMIT}&offset=${offset}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!res.ok) throw new Error();

        const history: Message[] = await res.json();

        if (history.length < LIMIT) setHasMore(false);

        if (!cancelled) {
          if (page === 0) setMessages(history);
          else setMessages((prev) => [...history, ...prev]);
        }
      } catch {
        if (!cancelled) setError("Impossibile caricare i messaggi");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHistory();

    socket.emit("joinRoom", roomId);

    socket.on("newMessage", (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      cancelled = true;
      socket.off("newMessage");
    };
  }, [roomId, token, page]);

  async function sendMessage() {
    if (!text.trim() || !token || sending) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch("http://localhost:3000/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ roomId, content: text }),
      });

      if (!res.ok) throw new Error();

      const saved: Message = await res.json();
      socket.emit("sendMessage", saved);
      setText("");
    } catch {
      setError("Impossibile inviare il messaggio. Riprova.");
    } finally {
      setSending(false);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const grouped = groupMessagesByDay(messages);

  return (
    <div style={{ padding: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>💬 Chat Room {roomId}</h2>
        <button onClick={handleLogout}>Logout</button>
      </header>

      {hasMore && !loading && (
        <button onClick={() => setPage((p) => p + 1)}>
          Carica messaggi precedenti
        </button>
      )}

      {loading && <div>Caricamento chat...</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}

      <div
        style={{
          border: "1px solid #ccc",
          padding: 10,
          height: 300,
          overflowY: "auto",
          marginTop: 10,
        }}
      >
        {Object.entries(grouped).map(([day, msgs]) => (
          <div key={day}>
            <div
              style={{ textAlign: "center", margin: "10px 0", color: "#666" }}
            >
              --- {formatDate(day)} ---
            </div>
            {msgs.map((m) => (
              <div key={m.id}>
                <strong>
                  User {m.userId}{" "}
                  <span
                    style={{
                      color:
                        presence[m.userId] === "online"
                          ? "green"
                          : presence[m.userId] === "offline"
                          ? "red"
                          : "#999",
                    }}
                  >
                    ●
                  </span>
                </strong>{" "}
                {m.content}
              </div>
            ))}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={{ marginTop: 10 }}>
        <input
          value={text}
          disabled={sending}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button onClick={sendMessage} disabled={sending}>
          {sending ? "Invio..." : "Invia"}
        </button>
      </div>
    </div>
  );
}
