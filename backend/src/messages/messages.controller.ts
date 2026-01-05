import { Request, Response } from "express";
import { prisma } from "../prisma";
import type { AuthRequest } from "../middlewares/auth.middleware";

export async function getRoomMessages(req: Request, res: Response) {
  try {
    const roomId = Number(req.params.roomId);
    if (!roomId || Number.isNaN(roomId)) {
      return res.status(400).json({ message: "roomId required" });
    }

    const limitRaw = Number(req.query.limit ?? 30);
    const pageRaw = Number(req.query.page ?? 1);

    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 100)
      : 30;
    const page = Number.isFinite(pageRaw) ? Math.max(pageRaw, 1) : 1;

    const skip = (page - 1) * limit;

    const msgsDesc = await prisma.message.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        content: true,
        createdAt: true,
        userId: true,
        roomId: true,
      },
    });

    return res.json(msgsDesc.reverse());
  } catch (err) {
    console.error("getRoomMessages error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function createMessage(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const roomId = Number((req.body as any)?.roomId);
    const content =
      typeof (req.body as any)?.content === "string"
        ? (req.body as any).content.trim()
        : "";

    if (!roomId || Number.isNaN(roomId)) {
      return res.status(400).json({ message: "roomId required" });
    }
    if (!content) {
      return res.status(400).json({ message: "content required" });
    }

    const message = await prisma.message.create({
      data: {
        roomId,
        userId: req.user.id,
        content,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        userId: true,
        roomId: true,
      },
    });

    return res.status(201).json(message);
  } catch (err) {
    console.error("createMessage error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}
