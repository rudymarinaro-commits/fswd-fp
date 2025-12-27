import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requireAdmin } from "../middlewares/requireAdmin.middleware";

const router = Router();

router.get("/stats", authMiddleware, requireAdmin, (_req, res) => {
    res.json({
        message: "Admin access granted",
    });
});

export default router;