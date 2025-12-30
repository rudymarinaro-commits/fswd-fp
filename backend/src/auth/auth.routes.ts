import { Router } from "express";
import { login, me } from "./auth.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const router = Router();

router.post("/login", login);
router.get("/me", requireAuth, me);

export default router;
