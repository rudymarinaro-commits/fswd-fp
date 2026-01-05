import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { listUsers, me, updateMe } from "./users.controller";

const router = Router();

// /api/users
router.get("/", requireAuth, listUsers);

// /api/users/me
router.get("/me", requireAuth, me);
router.patch("/me", requireAuth, updateMe);

export default router;
