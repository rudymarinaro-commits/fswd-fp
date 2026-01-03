import { Router } from "express";
import { getRoomMessages } from "./rooms.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const router = Router();

router.get("/:roomId/messages", requireAuth, getRoomMessages);

export default router;
