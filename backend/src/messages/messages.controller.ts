import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middlewares/auth.middleware";
import { logger } from "../services/logger";
import { z } from "zod";

const prisma = new PrismaClient();

const createMessageSchema = z.object({
  roomId: z.number().int().positive(),
  content: z.string().min(1).max(2000),
});

export async function createMessage(req: AuthRequest, res: Response) {
  const parsed = createMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.info(
      { errors: parsed.error.flatten() },
      "Invalid createMessage input"
    );
    return res
      .status(400)
      .json({ message: "Invalid input", errors: parsed.error.flatten() });
  }

  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const { roomId, content } = parsed.data;

  const msg = await prisma.message.create({
    data: {
      roomId,
      content,
      userId: req.user.userId,
    },
  });

  return res.status(201).json(msg);
}

export async function getRoomMessages(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const roomId = Number(req.params.roomId);
  if (!Number.isFinite(roomId)) {
    return res.status(400).json({ message: "Invalid roomId" });
  }

  const messages = await prisma.message.findMany({
    where: { roomId },
    orderBy: { createdAt: "asc" },
  });

  return res.json(messages);
}
