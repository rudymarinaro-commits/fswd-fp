import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";
import { env } from "../config/env";
import type { AuthRequest } from "../middlewares/auth.middleware";

function toAuthUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    role: user.role as "USER" | "ADMIN",

    // Profilo esteso (traccia punto 4.1)
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    username: user.username ?? "",
    phone: user.phone ?? null,
    address: user.address ?? null,
    avatarUrl: user.avatarUrl ?? null,

    createdAt: user.createdAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = (req.body ?? {}) as {
      email?: unknown;
      password?: unknown;
    };

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Email and password required" });
    }

    const emailNorm = email.trim().toLowerCase();
    if (!emailNorm || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const user = await prisma.user.findUnique({ where: { email: emailNorm } });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn }
    );

    return res.json({ token, user: toAuthUser(user) });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function me(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  return res.json(toAuthUser(req.user));
}
