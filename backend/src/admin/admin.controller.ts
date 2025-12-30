import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getStats(req: AuthRequest, res: Response) {
  const userCount = await prisma.user.count();
  const roomCount = await prisma.room.count();
  const messageCount = await prisma.message.count();

  res.json({ userCount, roomCount, messageCount });
}
