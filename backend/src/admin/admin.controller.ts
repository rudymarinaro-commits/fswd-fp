import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../prisma";
import type { AuthRequest } from "../middlewares/auth.middleware";

function toAdminUser(u: any) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    username: u.username ?? "",
    phone: u.phone ?? null,
    address: u.address ?? null,
    avatarUrl: u.avatarUrl ?? null,
    createdAt: u.createdAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

export async function getStats(_req: Request, res: Response) {
  const userCount = await prisma.user.count();
  const roomCount = await prisma.room.count();
  const messageCount = await prisma.message.count();
  res.json({ userCount, roomCount, messageCount });
}

/**
 * GET /api/admin/users
 */
export async function listUsersAdmin(_req: Request, res: Response) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        username: true,
        phone: true,
        address: true,
        avatarUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(users.map(toAdminUser));
  } catch (err) {
    console.error("listUsersAdmin error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * POST /api/admin/users
 * Crea utente + password iniziale + profilo esteso
 */
export async function createUser(req: Request, res: Response) {
  try {
    const body = (req.body ?? {}) as any;

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = body.role === "ADMIN" ? "ADMIN" : "USER";

    const firstName =
      typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName =
      typeof body.lastName === "string" ? body.lastName.trim() : "";
    const username =
      typeof body.username === "string" ? body.username.trim() : "";

    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const avatarUrl =
      typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : "";

    if (!email || !password || !firstName || !lastName || !username) {
      return res.status(400).json({
        message: "Required: email, password, firstName, lastName, username",
      });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "password must be at least 6 chars" });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists)
      return res.status(409).json({ message: "Email already in use" });

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        firstName,
        lastName,
        username, // NON univoco
        phone: phone ? phone : null,
        address: address ? address : null,
        avatarUrl: avatarUrl ? avatarUrl : null,
      },
    });

    return res.status(201).json(toAdminUser(user));
  } catch (err: any) {
    console.error("createUser error:", err);
    if (err?.code === "P2002") {
      return res.status(409).json({ message: "Email already in use" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * /api/admin/users/:id
 * update profilo + reset password
 */
export async function updateUser(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id))
      return res.status(400).json({ message: "Invalid id" });

    const body = (req.body ?? {}) as any;
    const data: any = {};

    if (typeof body.email === "string") {
      const email = body.email.trim().toLowerCase();
      if (!email)
        return res.status(400).json({ message: "Email cannot be empty" });
      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists && exists.id !== id) {
        return res.status(409).json({ message: "Email already in use" });
      }
      data.email = email;
    }

    if (typeof body.role === "string") {
      data.role = body.role === "ADMIN" ? "ADMIN" : "USER";
    }

    if (typeof body.firstName === "string") {
      const v = body.firstName.trim();
      if (!v)
        return res.status(400).json({ message: "firstName cannot be empty" });
      data.firstName = v;
    }
    if (typeof body.lastName === "string") {
      const v = body.lastName.trim();
      if (!v)
        return res.status(400).json({ message: "lastName cannot be empty" });
      data.lastName = v;
    }
    if (typeof body.username === "string") {
      const v = body.username.trim();
      if (!v)
        return res.status(400).json({ message: "username cannot be empty" });
      data.username = v; // NON univoco
    }

    if (typeof body.phone === "string") data.phone = body.phone.trim() || null;
    if (typeof body.address === "string")
      data.address = body.address.trim() || null;
    if (typeof body.avatarUrl === "string")
      data.avatarUrl = body.avatarUrl.trim() || null;

    if (typeof body.password === "string") {
      if (body.password.length < 6) {
        return res
          .status(400)
          .json({ message: "password must be at least 6 chars" });
      }
      data.passwordHash = await bcrypt.hash(body.password, 10);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    const updated = await prisma.user.update({ where: { id }, data });
    return res.json(toAdminUser(updated));
  } catch (err: any) {
    console.error("updateUser error:", err);
    if (err?.code === "P2002") {
      return res.status(409).json({ message: "Unique constraint violation" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * DELETE /api/admin/users/:id
 */
export async function deleteUser(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const id = Number(req.params.id);
    if (!id || Number.isNaN(id))
      return res.status(400).json({ message: "Invalid id" });

    if (id === req.user.id) {
      return res.status(400).json({ message: "You cannot delete yourself" });
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ message: "User not found" });

    // Se eliminiamo un utente, eliminiamo anche le sue room DM e i messaggi dentro quelle room
    await prisma.$transaction(async (tx) => {
      const rooms = await tx.room.findMany({
        where: { OR: [{ user1Id: id }, { user2Id: id }] },
        select: { id: true },
      });

      const roomIds = rooms.map((r) => r.id);

      if (roomIds.length) {
        await tx.message.deleteMany({ where: { roomId: { in: roomIds } } });
        await tx.room.deleteMany({ where: { id: { in: roomIds } } });
      }

      await tx.message.deleteMany({ where: { userId: id } }); // extra safety
      await tx.user.delete({ where: { id } });
    });

    return res.status(204).send();
  } catch (err) {
    console.error("deleteUser error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}
