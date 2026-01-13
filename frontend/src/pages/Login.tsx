import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import styles from "./Login.module.css";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);

    try {
      const ok = await login(email.trim(), password);
      if (!ok) {
        setError("Credenziali non valide");
        return;
      }
      navigate("/chat");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <header className={styles.header}>
          <h1 className={styles.title}>Login</h1>
          <p className={styles.subtitle}>Accedi per continuare alla chat.</p>
        </header>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label} htmlFor="email">
            Email
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="es. user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className={styles.label} htmlFor="password">
            Password
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="La tua password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          <button type="submit" className={styles.submit} disabled={submitting}>
            {submitting ? "Accesso..." : "Accedi"}
          </button>

          {error && <p className={styles.error}>{error}</p>}
        </form>

        <p className={styles.hint}>
          Se non ricordi le credenziali, usa quelle seedate nel backend (admin/user).
        </p>
      </div>
    </div>
  );
}
