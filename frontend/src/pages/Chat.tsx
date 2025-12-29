import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";

type Message = {
  id: number;
  content: string;
  createdAt: string;
  userId: number;
  roomId: number;
};

export default function Chat() {
  const { token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState("");

  useEffect(() => {
    fetch("http://localhost:3000/messages", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((r) => r.json())
      .then(setMessages);
  }, [token]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    const res = await fetch("http://localhost:3000/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ roomId: 2, content }),
    });

    const msg: Message = await res.json();
    setMessages((prev) => [...prev, msg]);
    setContent("");
  };

  return (
    <div>
      <h2>Chat</h2>

      {messages.map((m) => (
        <div key={m.id}>
          <strong>{m.userId}:</strong> {m.content}
        </div>
      ))}

      <form onSubmit={handleSend}>
        <input value={content} onChange={(e) => setContent(e.target.value)} />
        <button type="submit">Invia</button>
      </form>
    </div>
  );
}
