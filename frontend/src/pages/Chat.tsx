import { useAuth } from "../hooks/useAuth";

export default function Chat() {
  const { logout } = useAuth();

  return (
    <div>
      <h1>Chat</h1>
      <p>Login effettuato correttamente 🎉</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
