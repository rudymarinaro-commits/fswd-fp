import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../services/api";
import type { Role, User } from "../types/api";
import Navbar from "../components/Navbar";
import styles from "./Admin.module.css";

type CreateUserPayload = {
  email: string;
  password: string;
  role: Role;

  firstName: string;
  lastName: string;
  username: string;

  phone?: string;
  address?: string;
  avatarUrl?: string;
};

function normalize(v: string): string {
  return v.trim();
}

function isRole(v: string): v is Role {
  return v === "ADMIN" || v === "USER";
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Errore inatteso";
}

export default function Admin() {
  const { token, user } = useAuth();
  const canSee = user?.role === "ADMIN";

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // create user
  const [cEmail, setCEmail] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cRole, setCRole] = useState<Role>("USER");

  const [cFirstName, setCFirstName] = useState("");
  const [cLastName, setCLastName] = useState("");
  const [cUsername, setCUsername] = useState("");

  const [cPhone, setCPhone] = useState("");
  const [cAddress, setCAddress] = useState("");
  const [cAvatarUrl, setCAvatarUrl] = useState("");

  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setErr(null);

    try {
      const data = await apiFetch<User[]>("/admin/users", {}, token);
      setUsers(data);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void loadUsers();
  }, [token, loadUsers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const hay = `${u.email} ${u.username ?? ""} ${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, search]);

  const createUser = useCallback(async () => {
    if (!token) return;
    if (creating) return;

    setCreateMsg(null);

    const payload: CreateUserPayload = {
      email: normalize(cEmail).toLowerCase(),
      password: cPassword,
      role: cRole,

      firstName: normalize(cFirstName),
      lastName: normalize(cLastName),
      username: normalize(cUsername),

      phone: normalize(cPhone),
      address: normalize(cAddress),
      avatarUrl: normalize(cAvatarUrl),
    };

    if (!payload.email || !payload.password || !payload.firstName || !payload.lastName || !payload.username) {
      setCreateMsg("❌ Compila: Email, Password, Nome, Cognome e Username.");
      return;
    }

    if (payload.password.length < 6) {
      setCreateMsg("❌ Password deve essere almeno 6 caratteri");
      return;
    }

    setCreating(true);
    try {
      await apiFetch<User>(
        "/admin/users",
        {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            phone: payload.phone ? payload.phone : "",
            address: payload.address ? payload.address : "",
            avatarUrl: payload.avatarUrl ? payload.avatarUrl : "",
          }),
        },
        token
      );

      setCreateMsg("✅ Utente creato correttamente");

      setCEmail("");
      setCPassword("");
      setCRole("USER");
      setCFirstName("");
      setCLastName("");
      setCUsername("");
      setCPhone("");
      setCAddress("");
      setCAvatarUrl("");

      await loadUsers();
    } catch (e) {
      setCreateMsg(`❌ ${getErrorMessage(e)}`);
    } finally {
      setCreating(false);
    }
  }, [
    token,
    creating,
    cEmail,
    cPassword,
    cRole,
    cFirstName,
    cLastName,
    cUsername,
    cPhone,
    cAddress,
    cAvatarUrl,
    loadUsers,
  ]);

  const updateRole = useCallback(
    async (target: User, nextRole: Role) => {
      if (!token) return;
      if (!canSee) return;
      if (savingId || deletingId) return;

      setMsg(null);
      setErr(null);
      setSavingId(target.id);

      try {
        const updated = await apiFetch<User>(
          `/admin/users/${target.id}`,
          { method: "PATCH", body: JSON.stringify({ role: nextRole }) },
          token
        );

        setUsers((prev) => prev.map((u) => (u.id === target.id ? updated : u)));
        setMsg("✅ Ruolo aggiornato");
      } catch (e) {
        setErr(getErrorMessage(e));
      } finally {
        setSavingId(null);
      }
    },
    [token, canSee, savingId, deletingId]
  );

  const deleteUser = useCallback(
    async (target: User) => {
      if (!token) return;
      if (!canSee) return;
      if (savingId || deletingId) return;

      if (target.id === user?.id) {
        setErr("Non puoi eliminare il tuo utente.");
        return;
      }

      const ok = window.confirm(`Eliminare l'utente "${target.email}"? Questa azione è irreversibile.`);
      if (!ok) return;

      setMsg(null);
      setErr(null);
      setDeletingId(target.id);

      try {
        await apiFetch<unknown>(`/admin/users/${target.id}`, { method: "DELETE" }, token);
        setUsers((prev) => prev.filter((u) => u.id !== target.id));
        setMsg("✅ Utente eliminato");
      } catch (e) {
        setErr(getErrorMessage(e));
      } finally {
        setDeletingId(null);
      }
    },
    [token, canSee, savingId, deletingId, user?.id]
  );

  const isCreateOk = createMsg?.startsWith("✅") ?? false;
  const isOk = msg?.startsWith("✅") ?? false;

  return (
    <div className={styles.page}>
      <Navbar title="Admin" active="admin" />

      <div className={styles.content}>
        {!user || !canSee ? (
          <div className={styles.unauth}>
            <p className={styles.unauthText}>Accesso non autorizzato. Questa pagina è solo per Admin.</p>
          </div>
        ) : (
          <div className={styles.container}>
            <div className={styles.card}>
              <h2 className={styles.sectionTitle}>Crea utente</h2>

              {createMsg && <div className={isCreateOk ? styles.msgOk : styles.msgErr}>{createMsg}</div>}

              <div className={styles.formGrid} style={{ marginTop: 10 }}>
                <label className={styles.label}>
                  Email (univoca)
                  <input value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="user2@example.com" />
                </label>

                <label className={styles.label}>
                  Password
                  <input
                    value={cPassword}
                    onChange={(e) => setCPassword(e.target.value)}
                    placeholder="User123!"
                    type="password"
                  />
                </label>

                <label className={styles.label}>
                  Ruolo
                  <select
                    value={cRole}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (isRole(v)) setCRole(v);
                    }}
                  >
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </label>

                <label className={styles.label}>
                  Nome
                  <input value={cFirstName} onChange={(e) => setCFirstName(e.target.value)} placeholder="Mario" />
                </label>

                <label className={styles.label}>
                  Cognome
                  <input value={cLastName} onChange={(e) => setCLastName(e.target.value)} placeholder="Rossi" />
                </label>

                <label className={styles.label}>
                  Username (non univoco)
                  <input value={cUsername} onChange={(e) => setCUsername(e.target.value)} placeholder="mario" />
                </label>

                <label className={styles.label}>
                  Telefono (facoltativo)
                  <input value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="+39 333 0000000" />
                </label>

                <label className={styles.label}>
                  Indirizzo (facoltativo)
                  <input value={cAddress} onChange={(e) => setCAddress(e.target.value)} placeholder="Via Roma 1, Milano" />
                </label>

                <label className={`${styles.label} ${styles.full}`}>
                  Immagine profilo (URL facoltativo)
                  <input value={cAvatarUrl} onChange={(e) => setCAvatarUrl(e.target.value)} placeholder="https://..." />
                </label>
              </div>

              <div className={styles.formActions}>
                <button type="button" onClick={() => void createUser()} disabled={creating}>
                  {creating ? "Creazione..." : "Crea utente"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCreateMsg(null);
                    setCEmail("");
                    setCPassword("");
                    setCRole("USER");
                    setCFirstName("");
                    setCLastName("");
                    setCUsername("");
                    setCPhone("");
                    setCAddress("");
                    setCAvatarUrl("");
                  }}
                  disabled={creating}
                >
                  Pulisci
                </button>

                <span className={styles.small}>Required: email, password, firstName, lastName, username</span>
              </div>

              <hr className={styles.divider} />

              <h2 className={styles.sectionTitle}>Gestione utenti</h2>

              <div className={styles.row}>
                <input
                  className={styles.inputGrow}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cerca per email / username / nome..."
                />
                <button type="button" onClick={() => void loadUsers()} disabled={loading}>
                  {loading ? "Aggiorno..." : "Ricarica"}
                </button>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Email</th>
                      <th className={styles.th}>Username</th>
                      <th className={styles.th}>Nome</th>
                      <th className={styles.th}>Ruolo</th>
                      <th className={styles.th}>Azioni</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filtered.map((u) => {
                      const isMe = u.id === user.id;
                      const busy = savingId === u.id || deletingId === u.id;

                      return (
                        <tr key={u.id} className={styles.tr}>
                          <td className={styles.td}>{u.email}</td>
                          <td className={styles.td}>{u.username ?? "—"}</td>
                          <td className={styles.td}>
                            {(u.firstName || u.lastName)
                              ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()
                              : "—"}
                          </td>

                          <td className={styles.td}>
                            <span
                              className={`${styles.roleBadge} ${
                                u.role === "ADMIN" ? styles.roleAdmin : styles.roleUser
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>

                          <td className={styles.td}>
                            <div className={styles.actionRow}>
                              <select
                                className={styles.roleSelect}
                                value={u.role}
                                onChange={(e) => {
                                  const next = e.target.value;
                                  if (!isRole(next)) return;
                                  void updateRole(u, next);
                                }}
                                disabled={isMe || busy}
                              >
                                <option value="USER">USER</option>
                                <option value="ADMIN">ADMIN</option>
                              </select>

                              <button
                                type="button"
                                className={styles.dangerMini}
                                onClick={() => void deleteUser(u)}
                                disabled={isMe || busy}
                                title={isMe ? "Non puoi eliminare il tuo utente" : "Elimina utente"}
                              >
                                {deletingId === u.id ? "Elimino..." : "Elimina"}
                              </button>

                              {isMe && <span className={styles.small}>(il tuo utente non è modificabile)</span>}
                              {savingId === u.id && <span className={styles.small}>Salvataggio...</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filtered.length === 0 && (
                      <tr>
                        <td className={styles.td} colSpan={5}>
                          <span className={styles.small}>Nessun utente trovato</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className={styles.footer}>
                {loading && <div className={styles.small}>Caricamento...</div>}
                {err && <div className={styles.msgErr}>{err}</div>}
                {msg && <div className={isOk ? styles.msgOk : styles.msgErr}>{msg}</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
