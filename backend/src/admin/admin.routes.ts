import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { requireAdmin } from "../middlewares/requireAdmin.middleware";
import * as adminController from "./admin.controller";

const router = Router();

router.get("/stats", requireAuth, requireAdmin, adminController.getStats);

// FASE 2 — gestione utenti admin
router.post("/users", requireAuth, requireAdmin, adminController.createUser);
router.delete("/users/:id", requireAuth, requireAdmin, adminController.deleteUser);

export default router;
