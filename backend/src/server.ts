import http from "http";
import { Server } from "socket.io";
import { app } from "./app";
import { env } from "./config/env";
import { setupSocket } from "./services/socket";

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

setupSocket(io);

const port = Number(env.PORT) || 3000;

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
