import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

export default function Profile() {
  const { token, user } = useAuth();
  const [username, setUsername] = useState(user?.username ?? "");
  const [msg, setMsg] = useState("");

  async function save() {
    const res = await fetch("http://localhost:3000/users/me/username", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ username }),
    });

    if (res.ok) setMsg("Username aggiornato");
    else setMsg("Errore");
  }

  return (
    <div>
      <h2>Profilo</h2>
      <input value={username} onChange={(e) => setUsername(e.target.value)} />
      <button onClick={save}>Salva</button>
      <div>{msg}</div>
    </div>
  );
}
