import type { Response } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../prisma";
import type { AuthRequest } from "../middlewares/auth.middleware";

export async function getStats(_req: AuthRequest, res: Response) {
  const [userCount, roomCount, messageCount] = await Promise.all([
    prisma.user.count(),
    prisma.room.count(),
    prisma.message.count(),
  ]);

  res.json({ userCount, roomCount, messageCount });
}

/**
 * POST /api/admin/users
 * Body: { email, password, role? }
 */
export async function createUser(req: AuthRequest, res: Response) {
  const { email, password, role } = req.body ?? {};

  if (typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ message: "Invalid email" });
  }
  if (typeof password !== "string" || password.length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters" });
  }
  if (role !== undefined && role !== "USER" && role !== "ADMIN") {
    return res.status(400).json({ message: "Invalid role" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        passwordHash,
        role: role ?? "USER",
      },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    return res.status(201).json(user);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(409).json({ message: "Email already in use" });
    }
    console.error("createUser error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * DELETE /api/admin/users/:id
 */
export async function deleteUser(req: AuthRequest, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: "Invalid id" });
  }

  // evita che un admin si cancelli da solo
  if (req.user && req.user.id === id) {
    return res.status(400).json({ message: "You cannot delete yourself" });
  }

  try {
    await prisma.user.delete({ where: { id } });
    return res.status(204).send();
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ message: "User not found" });
    }
    // FK constraint (ha rooms/messages)
    if (err?.code === "P2003") {
      return res.status(409).json({
        message:
          "Cannot delete user with related rooms/messages. Remove related data first.",
      });
    }
    console.error("deleteUser error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}
