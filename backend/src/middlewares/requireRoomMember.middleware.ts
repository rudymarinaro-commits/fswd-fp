import { Response, NextFunction } from "express";
import { prisma } from "../prisma";
import type { AuthRequest } from "./auth.middleware";

export async function requireRoomMember(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const roomIdRaw =
    req.params.roomId ?? (req.body as any)?.roomId ?? req.query?.roomId;
  const roomId = Number(roomIdRaw);

  if (!roomId || Number.isNaN(roomId)) {
    return res.status(400).json({ message: "roomId required" });
  }

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return res.status(404).json({ message: "Room not found" });

  const isMember = room.user1Id === req.user.id || room.user2Id === req.user.id;
  if (!isMember) return res.status(403).json({ message: "Forbidden" });

  next();
}
