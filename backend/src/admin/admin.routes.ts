import { Router } from "express";
import { requireAuth, requireAdmin } from "../middlewares/auth.middleware";
import * as adminController from "./admin.controller";

const router = Router();

router.get("/stats", requireAuth, requireAdmin, adminController.getStats);

export default router;
