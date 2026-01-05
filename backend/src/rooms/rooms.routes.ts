import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { requireRoomMember } from "../middlewares/requireRoomMember.middleware";
import { getMyRooms, getOrCreateDmRoom } from "./rooms.controller";
import { getRoomMessages } from "../messages/messages.controller";

const router = Router();

// Base in app.ts: app.use("/api/rooms", router)
// quindi qui usiamo path relativi (NO /rooms/...)
router.get("/my", requireAuth, getMyRooms);
router.post("/dm", requireAuth, getOrCreateDmRoom);

// Storico messaggi di una room (coerente col frontend)
router.get(
  "/:roomId/messages",
  requireAuth,
  requireRoomMember,
  getRoomMessages
);

export default router;
