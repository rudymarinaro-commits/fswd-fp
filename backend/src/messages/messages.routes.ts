// backend/src/messages/messages.routes.ts
import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { requireRoomMember } from "../middlewares/requireRoomMember.middleware";
import { createMessage } from "./messages.controller";

const router = Router();

// Base in app.ts: app.use("/api/messages", router)
// POST /api/messages  body: { roomId, content }
router.post("/", requireAuth, requireRoomMember, createMessage);

export default router;
