import { Response } from "express";
import { prisma } from "../prisma";
import type { AuthRequest } from "../middlewares/auth.middleware";

function normalizePair(a: number, b: number) {
  return a < b ? { user1Id: a, user2Id: b } : { user1Id: b, user2Id: a };
}

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

/**
 * POST /api/rooms  (alias checklist)
 * POST /api/rooms/dm (legacy)
 * Body: { otherUserId }
 */
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

    // (opzionale ma utile) verifica che l'utente esista
    const otherExists = await prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true },
    });
    if (!otherExists) {
      return res.status(404).json({ message: "User not found" });
    }

    const { user1Id, user2Id } = normalizePair(meId, otherUserId);

    // ✅ con @@unique possiamo usare findUnique sulla chiave composta
    const existing = await prisma.room.findUnique({
      where: { user1Id_user2Id: { user1Id, user2Id } },
    });

    if (existing) return res.json(existing);

    try {
      const room = await prisma.room.create({
        data: { user1Id, user2Id },
      });
      return res.status(201).json(room);
    } catch (err: any) {
      // race condition: se due richieste creano insieme, una fallisce con unique
      if (err?.code === "P2002") {
        const room = await prisma.room.findUnique({
          where: { user1Id_user2Id: { user1Id, user2Id } },
        });
        if (room) return res.json(room);
      }
      throw err;
    }
  } catch (err) {
    console.error("getOrCreateDmRoom error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}
