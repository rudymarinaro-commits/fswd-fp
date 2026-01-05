import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { getMyRooms, getOrCreateDmRoom } from "./rooms.controller";

const router = Router();

router.get("/rooms/my", requireAuth, getMyRooms);
router.post("/rooms/dm", requireAuth, getOrCreateDmRoom);

export default router;
