import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { requireRoomMember } from "../middlewares/requireRoomMember.middleware";
import { getRoomMessages } from "./rooms.controller";
import { createMessage } from "../messages/messages.controller";

const router = Router();

router.get(
  "/:roomId/messages",
  requireAuth,
  requireRoomMember,
  getRoomMessages
);
router.post("/", requireAuth, requireRoomMember, createMessage);

export default router;
