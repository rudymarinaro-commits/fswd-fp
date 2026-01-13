import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../services/api";
import type { User } from "../types/api";

type UpdateMePayload = {
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string | null;
  address?: string | null;
  avatarUrl?: string | null;
  currentPassword?: string;
  newPassword?: string;
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Errore inatteso";
}

export default function Profile() {
  const { token, user, logout, refreshMe } = useAuth();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [address, setAddress] = useState(user?.address ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onSave = useCallback(async () => {
    if (!token) return;

    setSaving(true);
    setMsg(null);

    const payload: UpdateMePayload = {
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      username: username.trim() || undefined,
      phone: phone.trim() ? phone.trim() : null,
      address: address.trim() ? address.trim() : null,
      avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : null,
    };

    // password change (opzionale)
    const cp = currentPassword.trim();
    const np = newPassword.trim();
    if (cp && np) {
      payload.currentPassword = cp;
      payload.newPassword = np;
    }

    try {
      await apiFetch<User>(
        "/users/me",
        { method: "PATCH", body: JSON.stringify(payload) },
        token
      );

      await refreshMe();
      setCurrentPassword("");
      setNewPassword("");
      setMsg("✅ Profilo aggiornato");
    } catch (err: unknown) {
      setMsg(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [
    token,
    firstName,
    lastName,
    username,
    phone,
    address,
    avatarUrl,
    currentPassword,
    newPassword,
    refreshMe,
  ]);

  if (!user) return <div style={{ padding: 16 }}>Non autenticato</div>;

  return (
    <div style={{ padding: 16, maxWidth: 720 }}>
      {/* TOP ACTIONS */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => navigate("/chat")}>
          Vai alla chat
        </button>
        <button type="button" onClick={logout}>
          Logout
        </button>
      </div>

      <h2 style={{ marginTop: 0 }}>Profilo</h2>

      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
        Loggato come: <b>{user.email}</b> — ruolo: <b>{user.role}</b>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
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
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>

        <label>
          Telefono
          <input
            value={phone ?? ""}
            onChange={(e) => setPhone(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>

        <label>
          Indirizzo
          <input
            value={address ?? ""}
            onChange={(e) => setAddress(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>

        <label>
          Avatar URL
          <input
            value={avatarUrl ?? ""}
            onChange={(e) => setAvatarUrl(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>

        <hr />

        <div style={{ fontWeight: 700 }}>Cambio password (opzionale)</div>

        <label>
          Password attuale
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>

        <label>
          Nuova password
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="button" onClick={onSave} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva"}
          </button>
          {msg && (
            <div style={{ color: msg.startsWith("✅") ? "green" : "crimson" }}>
              {msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

