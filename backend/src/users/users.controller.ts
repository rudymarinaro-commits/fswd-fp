import { Request, Response } from "express";
import { prisma } from "../prisma";

export async function listUsers(req: Request, res: Response) {
  try {
    const meId = req.user!.id;

    const users = await prisma.user.findMany({
      where: { id: { not: meId } },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
      },
      orderBy: [{ username: "asc" }, { email: "asc" }],
    });

    return res.json(users);
  } catch (err) {
    console.error("listUsers error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}
