import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function sendMessage(req: AuthRequest, res: Response) {
  const { roomId, content } = req.body;

  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const message = await prisma.message.create({
    data: {
      content,
      roomId,
      userId: req.user.userId,
    },
  });

  res.json(message);
}

export async function getMessages(req: AuthRequest, res: Response) {
  const roomId = Number(req.params.roomId);

  const messages = await prisma.message.findMany({
    where: { roomId },
    orderBy: { createdAt: "asc" },
    include: { user: true },
  });

  res.json(messages);
}
