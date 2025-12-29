import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function createRoom(req: AuthRequest, res: Response) {
  const { otherUserId } = req.body;

  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const otherUser = await prisma.user.findUnique({
    where: { id: otherUserId },
  });

  if (!otherUser) {
    return res.status(400).json({ message: "Other user does not exist" });
  }

  const room = await prisma.room.create({
    data: {
      user1Id: req.user.userId,
      user2Id: otherUserId,
    },
  });

  res.json(room);
}

export async function getMyRooms(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const rooms = await prisma.room.findMany({
    where: {
      OR: [{ user1Id: req.user.userId }, { user2Id: req.user.userId }],
    },
  });

  res.json(rooms);
}
