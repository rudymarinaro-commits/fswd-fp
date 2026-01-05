import express from "express";
import cors from "cors";
import authRoutes from "./auth/auth.routes";
import roomsRoutes from "./rooms/rooms.routes";
import messagesRoutes from "./messages/messages.routes";
import usersRoutes from "./users/users.routes";

export const app = express();

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

app.use("/api", messagesRoutes);

app.use("/auth", authRoutes);
app.use("/rooms", roomsRoutes);
app.use("/messages", messagesRoutes);
app.use("/users", usersRoutes);
