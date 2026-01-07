import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { listUsers, getMe, updateMe } from "./users.controller";

const router = Router();

// Base in app.ts: app.use("/api/users", router)

router.get("/", requireAuth, listUsers);
router.get("/me", requireAuth, getMe);
router.patch("/me", requireAuth, updateMe);

export default router;
