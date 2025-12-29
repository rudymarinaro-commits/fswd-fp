import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "../hooks/useAuth";
import { MessageDTO } from "../types/api";

const socket: Socket = io("http://localhost:3000", { withCredentials: true });

export default function Chat() {
  const { token } = useAuth();
  const roomId = 2;
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!token) return;

    socket.emit("joinRoom", roomId);

    socket.on("newMessage", (msg: MessageDTO) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.off("newMessage");
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

    const saved: MessageDTO = await res.json();
    socket.emit("sendMessage", saved);
    setText("");
  }

  return (
    <div>
      <h2>Chat room {roomId}</h2>
      {messages.map((m) => (
        <div key={m.id}>
          <strong>User {m.userId}:</strong> {m.content}
        </div>
      ))}
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={sendMessage}>Invia</button>
    </div>
  );
}
