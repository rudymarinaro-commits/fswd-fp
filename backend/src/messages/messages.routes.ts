import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { createMessage, getRoomMessages } from "./messages.controller";

const router = Router();

// GET /messages/:roomId
router.get("/:roomId", requireAuth, getRoomMessages);

// POST /messages
router.post("/", requireAuth, createMessage);

export default router;
