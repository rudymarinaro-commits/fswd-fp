import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import * as controller from "./messages.controller";

const router = Router();

router.post("/", authMiddleware, controller.sendMessage);
router.get("/:roomId", authMiddleware, controller.getMessages);

export default router;
