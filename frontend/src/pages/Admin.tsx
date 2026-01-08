import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../services/api";
import type { Role, User } from "../types/api";

export default function Admin() {
  const { token } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // create form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("USER");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");

  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  async function loadUsers() {
    if (!token) return;
    setLoading(true);
    setMsg(null);
    try {
      const data = await apiFetch<User[]>("/admin/users", {}, token);
      setUsers(data);
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Errore caricamento utenti"}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function create() {
    if (!token) return;
    setMsg(null);

    try {
      const payload = {
        email,
        password,
        role,
        firstName,
        lastName,
        username,
        phone,
        address,
        avatarUrl,
      };

      await apiFetch<User>(
        "/admin/users",
        { method: "POST", body: JSON.stringify(payload) },
        token
      );

      setEmail("");
      setPassword("");
      setRole("USER");
      setFirstName("");
      setLastName("");
      setUsername("");
      setPhone("");
      setAddress("");
      setAvatarUrl("");

      setMsg("✅ Utente creato");
      await loadUsers();
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Errore creazione utente"}`);
    }
  }

  async function remove(id: number) {
    if (!token) return;
    setMsg(null);

    try {
      await apiFetch<void>(`/admin/users/${id}`, { method: "DELETE" }, token);
      setMsg("Utente eliminato");
      await loadUsers();
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Errore eliminazione utente"}`);
    }
  }

  async function resetPassword(id: number) {
    if (!token) return;
    const pwd = prompt("Nuova password (min 6 caratteri):");
    if (!pwd) return;

    try {
      await apiFetch<User>(
        `/admin/users/${id}`,
        { method: "PATCH", body: JSON.stringify({ password: pwd }) },
        token
      );
      setMsg("🔝Password aggiornata");
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Errore reset password"}`);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "20px auto", display: "grid", gap: 16 }}>
      <h2>Admin - Lista utenti</h2>

      {msg && <div>{msg}</div>}

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Crea nuovo utente</h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%" }} />
          </label>

          <label>
            Password iniziale
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>

          <label>
            Nome
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={{ width: "100%" }} />
          </label>

          <label>
            Cognome
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ width: "100%" }} />
          </label>

          <label>
            Username (non univoco)
            <input value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: "100%" }} />
          </label>

          <label>
            Ruolo
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} style={{ width: "100%" }}>
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </label>

          <label>
            Telefono (facoltativo)
            <input value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: "100%" }} />
          </label>

          <label>
            Indirizzo (facoltativo)
            <input value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: "100%" }} />
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            Immagine profilo (URL facoltativo)
            <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} style={{ width: "100%" }} />
          </label>
        </div>

        <button onClick={create} style={{ marginTop: 12, padding: "10px 12px" }}>
          Crea
        </button>
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Utenti ({users.length})</h3>

        {loading ? (
          <div>Caricamento...</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {users.map((u) => (
              <div
                key={u.id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <div>
                    <strong>{u.email}</strong> — {u.role}
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.85 }}>
                    {u.firstName} {u.lastName} • username: {u.username}
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.85 }}>
                    tel: {u.phone ?? "-"} • indirizzo: {u.address ?? "-"}
                  </div>
                  {u.avatarUrl && (
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      avatarUrl: {u.avatarUrl}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={() => resetPassword(u.id)}>Reset password</button>
                  <button onClick={() => remove(u.id)} style={{ color: "crimson" }}>
                    Elimina
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
