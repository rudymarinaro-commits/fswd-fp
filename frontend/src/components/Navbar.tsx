import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import styles from "./Navbar.module.css";

export type NavbarActive = "chat" | "profile" | "admin";

type Props = {
  title?: string;
  active?: NavbarActive;
};

export default function Navbar({ title = "FSWD Chat", active }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const isAdmin = user?.role === "ADMIN";

  const email = user?.email ?? "—";
  const role = user?.role ?? "USER";

  const secondaryLabel = useMemo(() => {
    if (!user) return "";
    return `Loggato come: ${email}`;
  }, [email, user]);

  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <div className={styles.left}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{title}</h1>
          </div>

          {user && (
            <div className={styles.userLine}>
              <span className={styles.userEmail}>{secondaryLabel}</span>
              <span className={`${styles.role} ${isAdmin ? styles.roleAdmin : ""}`}>
                {role}
              </span>
            </div>
          )}
        </div>

        <div className={styles.right}>
          <button
            type="button"
            className={`${styles.btn} ${active === "chat" ? styles.btnActive : ""}`}
            onClick={() => navigate("/chat")}
            disabled={active === "chat"}
          >
            Chat
          </button>

          {isAdmin ? (
            <button
              type="button"
              className={`${styles.btn} ${active === "admin" ? styles.btnActive : ""}`}
              onClick={() => navigate("/admin")}
              disabled={active === "admin"}
            >
              Admin
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.btn} ${active === "profile" ? styles.btnActive : ""}`}
              onClick={() => navigate("/profile")}
              disabled={active === "profile"}
            >
              Profilo
            </button>
          )}

          <button
            type="button"
            className={`${styles.btn} ${styles.btnDanger}`}
            onClick={logout}
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
