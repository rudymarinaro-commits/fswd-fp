import { Response } from "express";
import { prisma } from "../prisma";
import type { AuthRequest } from "../middlewares/auth.middleware";

export async function getMyRooms(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const userId = req.user.id;

    const rooms = await prisma.room.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(rooms);
  } catch (err) {
    console.error("getMyRooms error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function getOrCreateDmRoom(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const meId = req.user.id;
    const otherUserId = Number((req.body as any)?.otherUserId);

    if (!otherUserId || Number.isNaN(otherUserId)) {
      return res.status(400).json({ message: "otherUserId required" });
    }
    if (otherUserId === meId) {
      return res
        .status(400)
        .json({ message: "Cannot create DM with yourself" });
    }

    const existing = await prisma.room.findFirst({
      where: {
        OR: [
          { user1Id: meId, user2Id: otherUserId },
          { user1Id: otherUserId, user2Id: meId },
        ],
      },
    });

    if (existing) return res.json(existing);

    const room = await prisma.room.create({
      data: { user1Id: meId, user2Id: otherUserId },
    });

    return res.status(201).json(room);
  } catch (err) {
    console.error("getOrCreateDmRoom error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}
