// backend/src/app.ts
import express from "express";
import cors from "cors";

import authRoutes from "./auth/auth.routes";
import usersRoutes from "./users/users.routes";
import adminRoutes from "./admin/admin.routes";
import roomsRoutes from "./rooms/rooms.routes";
import messagesRoutes from "./messages/messages.routes";

const app = express();

app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
);

app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/rooms", roomsRoutes);
app.use("/api/messages", messagesRoutes);

export default app;
