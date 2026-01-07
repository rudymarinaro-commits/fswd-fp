import { useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../services/api";

export default function Profile() {
  const { token, user, refreshMe, logout } = useAuth();

  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const createdAt = useMemo(() => {
    if (!user?.createdAt) return null;
    try {
      return new Date(user.createdAt).toLocaleString("it-IT");
    } catch {
      return user.createdAt;
    }
  }, [user?.createdAt]);

  async function save() {
    if (!token) return;

    setSaving(true);
    setMsg(null);

    try {
      await apiFetch(
        "/users/me",
        {
          method: "PATCH",
          body: JSON.stringify({
            email: email.trim(),
            ...(newPassword
              ? { currentPassword: currentPassword, newPassword: newPassword }
              : {}),
          }),
        },
        token
      );

      await refreshMe();
      setCurrentPassword("");
      setNewPassword("");
      setMsg("Profilo aggiornato ✅");
    } catch (e: any) {
      setMsg(e?.message || "Errore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "24px auto" }}>
      <h2>Profilo</h2>

      <div style={{ marginBottom: 12 }}>
        <div>
          <strong>Ruolo:</strong> {user?.role}
        </div>
        {createdAt && (
          <div>
            <strong>Creato il:</strong> {createdAt}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>

        <hr />

        <label>
          Password attuale (solo se vuoi cambiarla)
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>

        <label>
          Nuova password (min 6)
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva"}
          </button>
          <button onClick={logout}>Logout</button>
        </div>

        {msg && <div>{msg}</div>}
      </div>
    </div>
  );
}
