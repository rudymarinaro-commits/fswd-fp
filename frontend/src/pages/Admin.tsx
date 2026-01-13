// frontend/src/pages/Admin.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { User } from "../types/api";
import { apiFetch } from "../services/api";

type Role = "ADMIN" | "USER";

function normalizeStr(v: string) {
  return v.trim();
}

export default function Admin() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ====== CREATE USER (ALL FIELDS PER TRACCIA) ======
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("USER");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");

  // opzionali
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createOk, setCreateOk] = useState<string | null>(null);

  async function loadUsers() {
    if (!token) return;
    setLoading(true);
    setErr(null);

    try {
      const data = await apiFetch<User[]>("/admin/users", {}, token);
      setUsers(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore caricamento utenti";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const usersSorted = useMemo(() => {
    return [...users].sort((a, b) => {
      const ra = a.role === "ADMIN" ? 0 : 1;
      const rb = b.role === "ADMIN" ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return a.email.localeCompare(b.email);
    });
  }, [users]);

  async function createUser() {
    if (!token) return;

    setCreateErr(null);
    setCreateOk(null);

    const payload = {
      email: normalizeStr(email),
      password,
      role,
      firstName: normalizeStr(firstName),
      lastName: normalizeStr(lastName),
      username: normalizeStr(username),
      // opzionali (stringhe, backend le accetta così)
      phone: normalizeStr(phone),
      address: normalizeStr(address),
      avatarUrl: normalizeStr(avatarUrl),
    };

    // min validation FE (senza rischi backend)
    if (
      !payload.email ||
      !payload.password ||
      !payload.firstName ||
      !payload.lastName ||
      !payload.username
    ) {
      setCreateErr(
        "Compila Email, Password, Nome, Cognome e Username (Telefono/Indirizzo/Immagine sono facoltativi)."
      );
      return;
    }

    setCreating(true);
    try {
      await apiFetch<User>(
        "/admin/users",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        token
      );

      setCreateOk("Utente creato correttamente ✅");

      // reset form
      setEmail("");
      setPassword("");
      setRole("USER");
      setFirstName("");
      setLastName("");
      setUsername("");
      setPhone("");
      setAddress("");
      setAvatarUrl("");

      await loadUsers();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore creazione utente";
      setCreateErr(msg);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Lista utenti</h2>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Loggato come: {user?.email} ({user?.role})
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" onClick={() => navigate("/chat")}>
            Vai alla chat
          </button>
          <button type="button" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 12,
          marginBottom: 16,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Crea utente</h3>

        {createErr && (
          <div style={{ color: "crimson", marginBottom: 8 }}>{createErr}</div>
        )}
        {createOk && (
          <div style={{ color: "green", marginBottom: 8 }}>{createOk}</div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 10,
          }}
        >
          <label style={{ display: "grid", gap: 4 }}>
            <span>Email (univoca)</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user2@example.com"
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Password</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="User123!"
              type="password"
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Ruolo</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Nome</span>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Mario"
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Cognome</span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Rossi"
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Username (non univoco)</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="mario"
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Telefono (facoltativo)</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+39 333 0000000"
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Indirizzo (facoltativo)</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Via Roma 1, Milano"
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Immagine profilo (URL facoltativo)</span>
            <input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
            />
          </label>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => void createUser()}
            disabled={creating}
          >
            {creating ? "Creazione..." : "Crea utente"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateErr(null);
              setCreateOk(null);
            }}
          >
            Pulisci messaggi
          </button>
        </div>
      </section>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 12,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Lista utenti</h3>

        {loading && <div>Caricamento...</div>}
        {err && <div style={{ color: "crimson" }}>{err}</div>}

        {!loading && !err && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #ddd",
                      padding: 8,
                    }}
                  >
                    Email
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #ddd",
                      padding: 8,
                    }}
                  >
                    Ruolo
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #ddd",
                      padding: 8,
                    }}
                  >
                    Nome
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #ddd",
                      padding: 8,
                    }}
                  >
                    Cognome
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #ddd",
                      padding: 8,
                    }}
                  >
                    Username
                  </th>
                </tr>
              </thead>
              <tbody>
                {usersSorted.map((u) => (
                  <tr key={u.id}>
                    <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                      {u.email}
                    </td>
                    <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                      {u.role}
                    </td>
                    <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                      {u.firstName}
                    </td>
                    <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                      {u.lastName}
                    </td>
                    <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                      {u.username}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
