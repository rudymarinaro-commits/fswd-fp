import express from "express";
import authRoutes from "./auth/auth.routes";
import adminRoutes from "./admin/admin.routes";

const app = express();

app.use(express.json());

app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);

app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

export default app;
