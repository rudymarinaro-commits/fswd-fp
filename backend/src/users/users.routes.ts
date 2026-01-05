import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { listUsers } from "./users.controller";

const router = Router();

router.get("/users", requireAuth, listUsers);

export default router;
