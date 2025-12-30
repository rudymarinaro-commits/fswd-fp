import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middlewares/auth.middleware";
import { logger } from "../services/logger";
import { z } from "zod";

const prisma = new PrismaClient();

const createRoomSchema = z.object({
  otherUserId: z.number().int().positive(),
});

export async function createRoom(req: AuthRequest, res: Response) {
  const parsed = createRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.info({ errors: parsed.error.flatten() }, "Invalid createRoom input");
    return res
      .status(400)
      .json({ message: "Invalid input", errors: parsed.error.flatten() });
  }

  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const otherUserId = parsed.data.otherUserId;

  // verifica che esista l’altro utente (evita FK crash)
  const other = await prisma.user.findUnique({ where: { id: otherUserId } });
  if (!other) return res.status(404).json({ message: "Other user not found" });

  if (otherUserId === req.user.userId) {
    return res
      .status(400)
      .json({ message: "Cannot create room with yourself" });
  }

  const room = await prisma.room.create({
    data: {
      user1Id: req.user.userId,
      user2Id: otherUserId,
    },
  });

  return res.status(201).json(room);
}

export async function getMyRooms(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const rooms = await prisma.room.findMany({
    where: {
      OR: [{ user1Id: req.user.userId }, { user2Id: req.user.userId }],
    },
    orderBy: { createdAt: "desc" },
  });

  return res.json(rooms);
}
