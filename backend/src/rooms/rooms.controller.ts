import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getRoomMessages(req: Request, res: Response) {
  const roomId = Number(req.params.roomId);
  const limit = Number(req.query.limit ?? 30);
  const offset = Number(req.query.offset ?? 0);

  if (isNaN(roomId)) {
    return res.status(400).json({ message: "Invalid roomId" });
  }

  const messages = await prisma.message.findMany({
    where: { roomId },
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: limit,
  });

  res.json(messages.reverse());
}
