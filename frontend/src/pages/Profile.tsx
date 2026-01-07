import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../services/api";
import type { User } from "../types/api";

export default function Profile() {
  const { token, user, refreshMe } = useAuth();

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setEmail(user.email ?? "");
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setUsername(user.username ?? "");
    setPhone(user.phone ?? "");
    setAddress(user.address ?? "");
    setAvatarUrl(user.avatarUrl ?? "");
  }, [user]);

  async function save() {
    if (!token) return;

    setSaving(true);
    setMsg(null);

    try {
      const payload: any = {
        email,
        firstName,
        lastName,
        username,
        phone,
        address,
        avatarUrl,
      };

      // Cambio password solo se compilata
      if (currentPassword || newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      await apiFetch<User>(
        "/users/me",
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
        token
      );

      setCurrentPassword("");
      setNewPassword("");

      await refreshMe();
      setMsg("✅ Profilo aggiornato");
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Errore aggiornamento profilo"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "20px auto", display: "grid", gap: 10 }}>
      <h2>Profilo</h2>

      {msg && <div>{msg}</div>}

      <label>
        Email (univoca)
        <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%" }} />
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
        Telefono (facoltativo)
        <input value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: "100%" }} />
      </label>

      <label>
        Indirizzo (facoltativo)
        <input value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: "100%" }} />
      </label>

      <label>
        Immagine profilo (URL facoltativo)
        <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} style={{ width: "100%" }} />
      </label>

      {avatarUrl?.trim() && (
        <img
          src={avatarUrl}
          alt="avatar"
          style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 12, border: "1px solid #ddd" }}
        />
      )}

      <hr />

      <h3 style={{ margin: 0 }}>Cambio password</h3>

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

      <button onClick={save} disabled={saving} style={{ padding: "10px 12px" }}>
        {saving ? "Salvo..." : "Salva"}
      </button>
    </div>
  );
}
