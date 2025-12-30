import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { createRoom, getMyRooms } from "./rooms.controller";

const router = Router();

router.get("/", requireAuth, getMyRooms);
router.post("/", requireAuth, createRoom);

export default router;
