import express from "express";
import cors from "cors";
import authRoutes from "./auth/auth.routes";
import adminRoutes from "./admin/admin.routes";
import roomRoutes from "./rooms/rooms.routes";
import messageRoutes from "./messages/messages.routes";

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());

app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);

app.use("/rooms", roomRoutes);

app.use("/messages", messageRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

export default app;
