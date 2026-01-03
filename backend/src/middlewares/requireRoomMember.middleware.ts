import { Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "./auth.middleware";

const prisma = new PrismaClient();

export async function requireRoomMember(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const roomId = Number(req.params.roomId || req.body.roomId);
  const userId = req.user?.userId;

  if (!roomId || !userId) {
    return res.status(400).json({ message: "Missing roomId or user" });
  }

  const room = await prisma.room.findUnique({
    where: { id: roomId },
  });

  if (!room) return res.status(404).json({ message: "Room not found" });

  if (room.user1Id !== userId && room.user2Id !== userId) {
    return res.status(403).json({ message: "Not a member of this room" });
  }

  next();
}
