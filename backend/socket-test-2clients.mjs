// backend/socket-test-2clients.mjs
import { io } from "socket.io-client";

/**
 * USO:
 * TOKEN_A="<JWT_ADMIN>" TOKEN_B="<JWT_USER>" node socket-test-2clients.mjs
 *
 * NOTE:
 * - Devi avere il backend avviato su http://localhost:3000
 * - Il token va preso da POST /api/auth/login (campo "token")
 */

const URL = process.env.URL || "http://localhost:3000";
const tokenA = process.env.TOKEN_A;
const tokenB = process.env.TOKEN_B;

// (Opzionale) roomId per testare anche joinRoom/sendMessage
const ROOM_ID = process.env.ROOM_ID ? Number(process.env.ROOM_ID) : null;

if (!tokenA || !tokenB) {
  console.error(
    "Token mancanti.\nEsempio:\nTOKEN_A='<JWT_ADMIN>' TOKEN_B='<JWT_USER>' node socket-test-2clients.mjs"
  );
  process.exit(1);
}

function creaClient(nome, token) {
  const s = io(URL, {
    auth: { token }, // puoi anche passare "Bearer <token>" se il middleware lo supporta
    transports: ["websocket"],
  });

  s.on("connect", () => console.log(`[${nome}] ✅ connesso socket=${s.id}`));
  s.on("connect_error", (err) =>
    console.error(`[${nome}] ❌ connect_error`, err.message)
  );

  // Snapshot iniziale presenza (ONLINE/IDLE)
  s.on("presence:sync", (snapshot) =>
    console.log(`[${nome}] 🧾 presence:sync`, snapshot)
  );

  // Aggiornamenti presenza realtime
  s.on("presence:state", (state) =>
    console.log(`[${nome}] 👤 presence:state`, state)
  );

  // Messaggi realtime (Step 2) — utile se vuoi verificare che non abbiamo rotto nulla
  s.on("newMessage", (msg) => console.log(`[${nome}] 💬 newMessage`, msg));

  // Heartbeat attività: ogni 25s mando ping per restare ONLINE
  const ping = setInterval(() => {
    s.emit("presence:ping");
    // console.log(`[${nome}] 💓 ping`);
  }, 25_000);

  s.on("disconnect", () => clearInterval(ping));

  return s;
}

const A = creaClient("A", tokenA);
const B = creaClient("B", tokenB);

// (Opzionale) Test Step 2: join room e invio messaggio
// Se vuoi usarlo: imposta ROOM_ID=1 (o la tua room) nell'env e scommenta sotto.
/*
setTimeout(() => {
  if (!ROOM_ID) return;

  A.emit("joinRoom", ROOM_ID, (ack) => console.log("[A] joinRoom ack:", ack));
  B.emit("joinRoom", ROOM_ID, (ack) => console.log("[B] joinRoom ack:", ack));

  setTimeout(() => {
    A.emit("sendMessage", { roomId: ROOM_ID, content: "Ciao da A (test)" }, (ack) =>
      console.log("[A] sendMessage ack:", ack)
    );
  }, 1500);
}, 1200);
*/

// Test grace period OFFLINE: disconnetto B e lo riconnetto entro 4s (NON dovrebbe andare OFFLINE)
setTimeout(() => {
  console.log("[B] 🔌 disconnect (test grace)");
  B.disconnect();
}, 6000);

setTimeout(() => {
  console.log("[B] 🔁 reconnect (entro grace)");
  creaClient("B2", tokenB);
}, 8000);

// Chiudo tutto dopo 15s
setTimeout(() => {
  A.disconnect();
  process.exit(0);
}, 15000);
