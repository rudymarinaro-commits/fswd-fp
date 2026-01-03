import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { updateUsername } from "./users.controller";

const router = Router();

router.patch("/me/username", requireAuth, updateUsername);

export default router;
