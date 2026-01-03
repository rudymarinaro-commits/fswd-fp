import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middlewares/auth.middleware";
import { z } from "zod";

const prisma = new PrismaClient();

const schema = z.object({
  username: z.string().min(3).max(30),
});

export async function updateUsername(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten() });
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: { username: parsed.data.username },
    });

    res.json({ id: user.id, username: user.username });
  } catch {
    res.status(409).json({ message: "Username already taken" });
  }
}
