import { Router } from "express";
import { login, me } from "./auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.post("/login", login);
router.get("/me", authMiddleware, me);

export default router;
