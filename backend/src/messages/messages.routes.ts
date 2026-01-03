import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { requireRoomMember } from "../middlewares/requireRoomMember.middleware";
import { createMessage, getRoomMessages } from "./messages.controller";

const router = Router();

router.get(
  "/:roomId/messages",
  requireAuth,
  requireRoomMember,
  getRoomMessages
);
router.post("/", requireAuth, requireRoomMember, createMessage);

export default router;
