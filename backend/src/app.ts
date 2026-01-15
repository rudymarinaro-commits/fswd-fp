import express from "express";
import cors from "cors";

import authRoutes from "./auth/auth.routes";
import usersRoutes from "./users/users.routes";
import roomsRoutes from "./rooms/rooms.routes";
import messagesRoutes from "./messages/messages.routes";
import adminRoutes from "./admin/admin.routes";

import { errorHandler } from "./middlewares/error.middleware";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/rooms", roomsRoutes);
app.use("/api", messagesRoutes);
app.use("/api/admin", adminRoutes);

// Global error handler (ultima middleware)
app.use(errorHandler);

export default app;
