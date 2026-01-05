import { Request, Response } from "express";
import { prisma } from "../prisma";

export async function getRoomMessages(req: Request, res: Response) {
  const roomId = Number(req.params.roomId);
  if (!roomId) return res.status(400).json({ error: "roomId required" });

  const messages = await prisma.message.findMany({
    where: { roomId },
    orderBy: { createdAt: "asc" },
    include: { user: true },
  });

  res.json(messages);
}

export async function createMessage(req: Request, res: Response) {
  const userId = req.user!.id;

  const roomId = Number(req.body.roomId);
  const content =
    typeof req.body.content === "string" ? req.body.content.trim() : "";

  if (!roomId) return res.status(400).json({ error: "roomId required" });
  if (!content) return res.status(400).json({ error: "content required" });

  const message = await prisma.message.create({
    data: {
      content,
      roomId,
      userId,
    },
    include: { user: true },
  });

  res.status(201).json(message);
}
