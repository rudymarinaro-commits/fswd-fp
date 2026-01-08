import { io } from "socket.io-client";

const token = process.env.TOKEN;
if (!token) {
  console.error("Missing TOKEN. Use: TOKEN='...' node socket-test.mjs");
  process.exit(1);
}

const socket = io("http://localhost:3000", {
  auth: { token },
  transports: ["websocket"],
});

socket.on("connect", () => {
  console.log("✅ connected", socket.id);
  socket.disconnect();
});

socket.on("connect_error", (err) => {
  console.error("❌ connect_error", err.message);
  process.exit(2);
});
