import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../services/api";
import type { User } from "../types/api";

export default function Admin() {
  const { token } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"USER" | "ADMIN">("USER");
  const [creating, setCreating] = useState(false);

  async function loadUsers() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<User[]>("/users", {}, token);
      setUsers(data);
    } catch (e: any) {
      setError(e?.message || "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function createUser() {
    if (!token) return;
    setCreating(true);
    setError(null);
    try {
      await apiFetch(
        "/admin/users",
        {
          method: "POST",
          body: JSON.stringify({ email, password, role }),
        },
        token
      );

      setEmail("");
      setPassword("");
      setRole("USER");
      await loadUsers();
    } catch (e: any) {
      setError(e?.message || "Errore");
    } finally {
      setCreating(false);
    }
  }

  async function deleteUser(id: number) {
    if (!token) return;
    setError(null);
    try {
      await apiFetch(
        `/admin/users/${id}`,
        {
          method: "DELETE",
        },
        token
      );
      await loadUsers();
    } catch (e: any) {
      setError(e?.message || "Errore");
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "24px auto" }}>
      <h2>Admin</h2>

      <div style={{ border: "1px solid #ddd", padding: 12, marginBottom: 16 }}>
        <h3>Crea utente</h3>

        <div style={{ display: "grid", gap: 8 }}>
          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            placeholder="Password (min 6)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <select value={role} onChange={(e) => setRole(e.target.value as any)}>
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>

          <button onClick={createUser} disabled={creating}>
            {creating ? "Creazione..." : "Crea"}
          </button>

          {error && <div style={{ color: "red" }}>{error}</div>}
        </div>
      </div>

      <h3>Utenti</h3>

      {loading ? (
        <div>Caricamento...</div>
      ) : (
        <table width="100%" cellPadding={6}>
          <thead>
            <tr>
              <th align="left">ID</th>
              <th align="left">Email</th>
              <th align="left">Ruolo</th>
              <th align="left">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>
                  <button onClick={() => deleteUser(u.id)}>Elimina</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
