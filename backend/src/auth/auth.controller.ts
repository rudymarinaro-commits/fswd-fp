import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";
import { env } from "../config/env";
import { loginSchema } from "./auth.schemas";
import type { AuthRequest } from "../middlewares/auth.middleware";

function toAuthUser(user: {
  id: number;
  email: string;
  role: string;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    role: user.role as "USER" | "ADMIN",
    createdAt: user.createdAt.toISOString(),
  };
}

export async function login(req: Request, res: Response) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      env.jwtSecret,
      {
        expiresIn: env.jwtExpiresIn,
      }
    );

    return res.json({ token, user: toAuthUser(user) });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function me(req: AuthRequest, res: Response) {
  // ✅ TypeScript: user è opzionale, runtime: requireAuth lo garantisce
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  return res.json(toAuthUser(req.user));
}
