import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { requireAdmin } from "../middlewares/requireAdmin.middleware";
import { listUsers } from "./users.controller";

const router = Router();

// Se in app.ts fai: app.use("/users", router)
// allora qui deve essere "/"
router.get("/", requireAuth, requireAdmin, listUsers);

export default router;
