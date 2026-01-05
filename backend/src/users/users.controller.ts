import { Request, Response } from "express";
import { prisma } from "../prisma";

/**
 * GET /users
 * (se hai una route admin, metti requireAdmin nel router, non qui)
 */
export async function listUsers(_req: Request, res: Response) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(users);
  } catch (err) {
    console.error("listUsers error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}
