import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getStats(req: Request, res: Response) {
  const userCount = await prisma.user.count();
  const roomCount = await prisma.room.count();
  const messageCount = await prisma.message.count();

  res.json({ userCount, roomCount, messageCount });
}
