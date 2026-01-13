import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../services/api";
import type { User } from "../types/api";
import styles from "./Profile.module.css";

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

  if (!user) {
    return (
      <div className={styles.page}>
        <div className={styles.unauth}>
          <p className={styles.unauthText}>Non autenticato</p>
        </div>
      </div>
    );
  }

  const isOk = msg?.startsWith("✅") ?? false;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <h1 className={styles.title}>Profilo</h1>
            <div className={styles.meta}>
              Loggato come: <b>{user.email}</b> — ruolo: <b>{user.role}</b>
            </div>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => navigate("/chat")}
            >
              Vai alla chat
            </button>

            <button type="button" className={styles.btnDanger} onClick={logout}>
              Logout
            </button>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.form}>
            <div className={styles.grid}>
              <label className={styles.label}>
                Nome
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </label>

              <label className={styles.label}>
                Cognome
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </label>

              <label className={styles.label}>
                Username
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>

              <label className={styles.label}>
                Telefono
                <input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>

              <label className={`${styles.label} ${styles.full}`}>
                Indirizzo
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>

              <label className={`${styles.label} ${styles.full}`}>
                Avatar URL
                <input
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                />
              </label>
            </div>

            <hr className={styles.divider} />

            <div className={styles.sectionTitle}>Cambio password (opzionale)</div>

            <div className={styles.grid}>
              <label className={styles.label}>
                Password attuale
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </label>

              <label className={styles.label}>
                Nuova password
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </label>
            </div>

            <div className={styles.footer}>
              <button type="button" onClick={onSave} disabled={saving}>
                {saving ? "Salvataggio..." : "Salva"}
              </button>

              {msg && (
                <div
                  className={`${styles.message} ${
                    isOk ? styles.messageOk : styles.messageErr
                  }`}
                >
                  {msg}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
