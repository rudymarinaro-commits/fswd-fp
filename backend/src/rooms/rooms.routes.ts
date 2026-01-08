import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { requireRoomMember } from "../middlewares/requireRoomMember.middleware";
import { getMyRooms, getOrCreateDmRoom } from "./rooms.controller";
import { getRoomMessages } from "../messages/messages.controller";

const router = Router();

// Base in app.ts: app.use("/api/rooms", router)
router.get("/my", requireAuth, getMyRooms);

// Checklist-friendly alias: POST /api/rooms
router.post("/", requireAuth, getOrCreateDmRoom);

// Mantengo anche la tua route esistente
router.post("/dm", requireAuth, getOrCreateDmRoom);

// Storico messaggi di una room
router.get("/:roomId/messages", requireAuth, requireRoomMember, getRoomMessages);

export default router;
