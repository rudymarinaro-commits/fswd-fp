import { io } from "socket.io-client";

const token = process.env.TOKEN;
const roomId = Number(process.env.ROOM_ID || 1);

if (!token) {
  console.error(
    "Missing TOKEN. Use: TOKEN='...' ROOM_ID=1 node socket-test-2clients.mjs"
  );
  process.exit(1);
}

function makeClient(name) {
  const s = io("http://localhost:3000", {
    auth: { token },
    transports: ["websocket"],
  });

  s.on("connect", () => {
    console.log(`[${name}] ✅ connected`, s.id);

    s.emit("joinRoom", roomId, (res) => {
      console.log(`[${name}] joinRoom ack:`, res);

      if (name === "A" && res?.ok) {
        s.emit(
          "sendMessage",
          { roomId, content: "hello realtime (saved on DB)" },
          (ack) => console.log(`[${name}] sendMessage ack:`, ack)
        );
      }
    });
  });

  s.on("newMessage", (msg) => {
    console.log(`[${name}] 📩 newMessage`, msg);
  });

  s.on("connect_error", (err) => {
    console.error(`[${name}] ❌ connect_error`, err.message);
  });

  return s;
}

const A = makeClient("A");
const B = makeClient("B");

setTimeout(() => {
  A.disconnect();
  B.disconnect();
  process.exit(0);
}, 3000);
