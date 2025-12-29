import { Server } from "socket.io";
import http from "http";
import app from "../app";

const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    credentials: true,
  },
});

io.on("connection", (socket) => {
  if (process.env.NODE_ENV !== "test") {
    console.log("🟢 Client connected:", socket.id);
  }

  socket.on("joinRoom", (roomId: number) => {
    socket.join(`room:${roomId}`);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });

  socket.on("sendMessage", (data) => {
    io.to(`room:${data.roomId}`).emit("newMessage", data);
  });

  socket.on("disconnect", () => {
    console.log("🔴 Client disconnected:", socket.id);
  });
});

export default server;
