import { useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import { useAuth } from "../hooks/useAuth";
import type { User } from "../types/api";

function hasMessage(x: unknown): x is { message: unknown } {
  return typeof x === "object" && x !== null && "message" in x;
}

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (hasMessage(err) && typeof err.message === "string") return err.message;
  return fallback;
}

export default function Admin() {
  const { token } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // form creazione
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"USER" | "ADMIN">("USER");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");

  async function load() {
    if (!token) return;
    setLoading(true);
    setMsg(null);
    try {
      const data = await apiFetch<User[]>("/admin/users", {}, token);
      setUsers(data);
    } catch (e: unknown) {
      setMsg(`❌ ${getErrorMessage(e, "Errore caricamento utenti")}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function create() {
    if (!token) return;
    setMsg(null);

    try {
      const created = await apiFetch<User>(
        "/admin/users",
        {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
            role,
            firstName,
            lastName,
            username,
          }),
        },
        token
      );

      setUsers((prev) => [created, ...prev]);
      setEmail("");
      setPassword("");
      setRole("USER");
      setFirstName("");
      setLastName("");
      setUsername("");
      setMsg("✅ Utente creato");
    } catch (e: unknown) {
      setMsg(`❌ ${getErrorMessage(e, "Errore creazione utente")}`);
    }
  }

  async function remove(id: number) {
    if (!token) return;
    setMsg(null);

    if (
      !confirm(
        "Eliminare utente? (verranno eliminate anche room/messaggi collegati)"
      )
    )
      return;

    try {
      await apiFetch<void>(`/admin/users/${id}`, { method: "DELETE" }, token);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setMsg("✅ Utente eliminato");
    } catch (e: unknown) {
      setMsg(`❌ ${getErrorMessage(e, "Errore eliminazione utente")}`);
    }
  }

  async function resetPassword(id: number) {
    if (!token) return;
    setMsg(null);

    const newPass = prompt("Nuova password (min 6 caratteri):");
    if (!newPass) return;

    try {
      await apiFetch<User>(
        `/admin/users/${id}`,
        { method: "PATCH", body: JSON.stringify({ password: newPass }) },
        token
      );
      setMsg("✅ Password resettata");
    } catch (e: unknown) {
      setMsg(`❌ ${getErrorMessage(e, "Errore reset password")}`);
    }
  }

  return (
    <div
      style={{ maxWidth: 900, margin: "20px auto", display: "grid", gap: 16 }}
    >
      <h2>Admin</h2>

      {msg && <div>{msg}</div>}

      <section
        style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}
      >
        <h3 style={{ marginTop: 0 }}>Crea utente</h3>

        <div
          style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}
        >
          <label>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%" }}
            />
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
            Ruolo
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "USER" | "ADMIN")}
              style={{ width: "100%" }}
            >
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </label>

          <label>
            Nome
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>

          <label>
            Cognome
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>

          <label>
            Username (non univoco)
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>
        </div>

        <button onClick={create} style={{ marginTop: 10 }}>
          Crea
        </button>
      </section>

      <section
        style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h3 style={{ margin: 0 }}>Utenti</h3>
          <button onClick={load} disabled={loading}>
            {loading ? "Carico..." : "Ricarica"}
          </button>
        </div>

        {loading ? (
          <p>Caricamento...</p>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {users.map((u) => (
              <div
                key={u.id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 10,
                  padding: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {u.email} — {u.role}
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.8 }}>
                    {u.firstName ?? ""} {u.lastName ?? ""} — @{u.username ?? ""}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={() => resetPassword(u.id)}>
                    Reset password
                  </button>
                  <button
                    onClick={() => remove(u.id)}
                    style={{ color: "crimson" }}
                  >
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
