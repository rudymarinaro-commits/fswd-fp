import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { requireAdmin } from "../middlewares/requireAdmin.middleware";
import * as adminController from "./admin.controller";

const router = Router();

router.get("/stats", requireAuth, requireAdmin, adminController.getStats);

export default router;
