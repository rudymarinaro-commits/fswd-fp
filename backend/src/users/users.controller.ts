import type { Response } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../prisma";
import type { AuthRequest } from "../middlewares/auth.middleware";

function toPublicUser(user: {
  id: number;
  email: string;
  role: string;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

/**
 * GET /api/users
 * Lista utenti (per colonna sinistra chat).
 * Richiede solo autenticazione.
 */
export async function listUsers(_req: AuthRequest, res: Response) {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    return res.json(users.map(toPublicUser));
  } catch (err) {
    console.error("listUsers error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * GET /api/users/me
 */
export async function me(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  return res.json(toPublicUser(req.user));
}

/**
 * PATCH /api/users/me
 * Campi supportati:
 * - email (opzionale)
 * - currentPassword + newPassword (opzionali, ma se imposti newPassword devi passare currentPassword)
 */
export async function updateMe(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const { email, currentPassword, newPassword } = req.body ?? {};

  const data: { email?: string; passwordHash?: string } = {};

  if (email !== undefined) {
    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ message: "Invalid email" });
    }
    data.email = email.trim().toLowerCase();
  }

  if (newPassword !== undefined) {
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "newPassword must be at least 6 characters" });
    }
    if (typeof currentPassword !== "string" || !currentPassword) {
      return res
        .status(400)
        .json({ message: "currentPassword is required to change password" });
    }

    const ok = await bcrypt.compare(currentPassword, req.user.passwordHash);
    if (!ok) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    data.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "No valid fields to update" });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: { id: true, email: true, role: true, createdAt: true },
    });

    return res.json(toPublicUser(updated));
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(409).json({ message: "Email already in use" });
    }
    console.error("updateMe error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

