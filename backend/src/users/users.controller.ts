import type { Response } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../prisma";
import type { AuthRequest } from "../middlewares/auth.middleware";

function toPublicUser(u: any) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    username: u.username ?? "",
    avatarUrl: u.avatarUrl ?? null,
    createdAt: u.createdAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

function toMeUser(u: any) {
  return {
    ...toPublicUser(u),
    phone: u.phone ?? null,
    address: u.address ?? null,
  };
}

/**
 * GET /api/users
 * Lista utenti per sidebar chat (richiede auth, NON admin)
 */
export async function listUsers(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        username: true,
        avatarUrl: true,
        createdAt: true,
      },
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
export async function getMe(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const me = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!me) return res.status(404).json({ message: "User not found" });

    return res.json(toMeUser(me));
  } catch (err) {
    console.error("getMe error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * PATCH /api/users/me
 * Update profilo esteso + cambio password (con currentPassword)
 */
export async function updateMe(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const body = (req.body ?? {}) as any;
    const data: any = {};

    // Email (univoca)
    if (typeof body.email === "string") {
      const email = body.email.trim().toLowerCase();
      if (!email) return res.status(400).json({ message: "Email cannot be empty" });

      if (email !== req.user.email) {
        const exists = await prisma.user.findUnique({ where: { email } });
        if (exists && exists.id !== req.user.id) {
          return res.status(409).json({ message: "Email already in use" });
        }
        data.email = email;
      }
    }

    // Nome/Cognome/Username (traccia)
    if (typeof body.firstName === "string") {
      const v = body.firstName.trim();
      if (!v) return res.status(400).json({ message: "firstName cannot be empty" });
      data.firstName = v;
    }

    if (typeof body.lastName === "string") {
      const v = body.lastName.trim();
      if (!v) return res.status(400).json({ message: "lastName cannot be empty" });
      data.lastName = v;
    }

    if (typeof body.username === "string") {
      const v = body.username.trim();
      if (!v) return res.status(400).json({ message: "username cannot be empty" });
      data.username = v; // ✅ NON univoco
    }

    // Facoltativi (se stringa vuota => null)
    if (typeof body.phone === "string") {
      const v = body.phone.trim();
      data.phone = v ? v : null;
    }

    if (typeof body.address === "string") {
      const v = body.address.trim();
      data.address = v ? v : null;
    }

    if (typeof body.avatarUrl === "string") {
      const v = body.avatarUrl.trim();
      data.avatarUrl = v ? v : null;
    }

    // Cambio password
    const wantsPasswordChange =
      body.newPassword !== undefined || body.currentPassword !== undefined;

    if (wantsPasswordChange) {
      if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string") {
        return res.status(400).json({
          message: "To change password provide currentPassword and newPassword",
        });
      }

      if (body.newPassword.length < 6) {
        return res.status(400).json({ message: "newPassword must be at least 6 chars" });
      }

      const fresh = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!fresh) return res.status(404).json({ message: "User not found" });

      const ok = await bcrypt.compare(body.currentPassword, fresh.passwordHash);
      if (!ok) return res.status(401).json({ message: "Current password is wrong" });

      data.passwordHash = await bcrypt.hash(body.newPassword, 10);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data,
    });

    return res.json(toMeUser(updated));
  } catch (err: any) {
    console.error("updateMe error:", err);
    // Prisma unique violation fallback
    if (err?.code === "P2002") {
      return res.status(409).json({ message: "Unique constraint violation" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
}
