import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { requireRoomMember } from "../middlewares/requireRoomMember.middleware";
import { getRoomMessages, createMessage } from "./messages.controller";

const router = Router();

router.get(
  "/rooms/:roomId/messages",
  requireAuth,
  requireRoomMember,
  getRoomMessages
);
router.post("/messages", requireAuth, requireRoomMember, createMessage);

export default router;
