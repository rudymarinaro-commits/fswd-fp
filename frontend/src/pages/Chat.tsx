import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import type { Message } from "../types/api";
import { socket, setSocketToken } from "../services/socket";

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

export default function Chat() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();

  // nel tuo progetto roomId sembra “fisso” o già determinato.
  // Se invece lo prendi da route params, sostituisci qui.
  const roomId = 4;

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // ---------------- LOAD HISTORY (REST) ----------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!token) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `${API}/rooms/${roomId}/messages?limit=${LIMIT}&page=${page}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data: Message[] = await res.json();

        if (cancelled) return;

        // append “vecchi” sopra o sotto? qui li teniamo in ordine asc come backend
        setMessages((prev) => {
          // se pagini, evita duplicati
          const map = new Map<number, Message>();
          for (const m of [...prev, ...data]) map.set(m.id, m);
          return Array.from(map.values()).sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        });

        setHasMore(data.length === LIMIT);
      } catch {
        if (!cancelled) setError("Impossibile caricare i messaggi.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [roomId, token, page]);

  // ---------------- SOCKET CONNECT + JOIN + LISTEN ----------------
  useEffect(() => {
    if (!token) return;

    // set token per handshake
    setSocketToken(token);

    if (!socket.connected) socket.connect();

    // join room
    socket.emit("joinRoom", roomId);

    const onNewMessage = (msg: Message) => {
      setMessages((prev) => {
        // evita doppioni
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    socket.on("newMessage", onNewMessage);

    return () => {
      socket.off("newMessage", onNewMessage);
      // non disconnettere per forza: dipende dalla tua UX
      // se vuoi disconnettere quando esci dalla pagina chat:
      // socket.disconnect();
    };
  }, [roomId, token]);

  /* ---------------- SEND MESSAGE ---------------- */

  async function sendMessage() {
    if (!text.trim() || !token || sending) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch(`${API}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ roomId, content: text }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

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

  const grouped = useMemo(() => groupMessagesByDay(messages), [messages]);

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

      {loading && <p>Caricamento...</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <div
        style={{
          border: "1px solid #ccc",
          padding: 10,
          height: 420,
          overflow: "auto",
          marginTop: 10,
        }}
      >
        {grouped.map(([day, msgs]) => (
          <div key={day} style={{ marginBottom: 10 }}>
            <div style={{ textAlign: "center", opacity: 0.7 }}>
              --- {formatDate(new Date(day).toISOString())} ---
            </div>
            {msgs.map((m) => (
              <div key={m.id} style={{ display: "flex", gap: 8 }}>
                <strong>User {m.userId}</strong>
                <span style={{ opacity: 0.4 }}>•</span>
                <span>{m.content}</span>
              </div>
            ))}
          </div>
        ))}
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
