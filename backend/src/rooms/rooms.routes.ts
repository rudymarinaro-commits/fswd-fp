import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import * as controller from "./rooms.controller";

const router = Router();

router.post("/", authMiddleware, controller.createRoom);
router.get("/", authMiddleware, controller.getMyRooms);

export default router;
