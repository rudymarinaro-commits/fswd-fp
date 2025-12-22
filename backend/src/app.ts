import express from "express";
import authRoutes from "./auth/auth.routes";


const app = express();

app.use(express.json());

app.use("/auth", authRoutes);

app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

export default app;
