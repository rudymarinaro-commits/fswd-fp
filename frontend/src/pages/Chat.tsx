import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "../hooks/useAuth";

type Message = {
  id: number;
  content: string;
  userId: number;
  roomId: number;
  createdAt: string;
};

const socket: Socket = io("http://localhost:3000", {
  withCredentials: true,
});

export default function Chat() {
  const { token } = useAuth();
  const [roomId] = useState<number>(2); // temporaneo
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!token) return;

    socket.emit("joinRoom", roomId);

    const handler = (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
    };

    socket.on("newMessage", handler);

    return () => {
      socket.off("newMessage", handler);
    };
  }, [roomId, token]);

  async function sendMessage() {
    if (!text.trim()) return;

    const res = await fetch("http://localhost:3000/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ roomId, content: text }),
    });

    if (!res.ok) {
      console.error("Errore invio messaggio");
      return;
    }

    const saved: Message = await res.json();

    socket.emit("sendMessage", saved);
    setText("");
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>💬 Chat Room {roomId}</h2>

      <div
        style={{
          border: "1px solid #ccc",
          padding: 10,
          height: 300,
          overflowY: "auto",
        }}
      >
        {messages.map((m) => (
          <div key={m.id}>
            <strong>User {m.userId}:</strong> {m.content}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Scrivi un messaggio..."
        />
        <button onClick={sendMessage}>Invia</button>
      </div>
    </div>
  );
}
