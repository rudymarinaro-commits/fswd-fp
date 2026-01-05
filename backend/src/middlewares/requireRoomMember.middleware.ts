import { Request, Response, NextFunction } from "express";
import { prisma } from "../prisma";

export async function requireRoomMember(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = req.user!.id;
  const roomId = Number(req.params.roomId || req.body.roomId);

  if (!roomId) return res.status(400).json({ error: "roomId required" });

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return res.status(404).json({ error: "Room not found" });

  if (room.user1Id !== userId && room.user2Id !== userId) {
    return res.status(403).json({ error: "Not a room member" });
  }

  (req as any).room = room;
  next();
}
