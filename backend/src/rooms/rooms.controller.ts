import { Request, Response } from "express";
import { prisma } from "../prisma";

/**
 * Ritorna tutte le room dell'utente loggato
 */
export async function getMyRooms(req: Request, res: Response) {
  try {
    const userId = req.user!.id;

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

/**
 * Ritorna una room 1-to-1 esistente oppure la crea
 */
export async function getOrCreateDmRoom(req: Request, res: Response) {
  try {
    const meId = req.user!.id;
    const { otherUserId } = req.body as { otherUserId?: number };

    if (!otherUserId || typeof otherUserId !== "number") {
      return res.status(400).json({ message: "otherUserId (number) required" });
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

    if (existing) {
      return res.json(existing);
    }

    const room = await prisma.room.create({
      data: {
        user1Id: meId,
        user2Id: otherUserId,
      },
    });

    return res.status(201).json(room);
  } catch (err) {
    console.error("getOrCreateDmRoom error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}
