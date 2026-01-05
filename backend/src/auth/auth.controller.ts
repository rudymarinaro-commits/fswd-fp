import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { sign } from "jsonwebtoken";
import { prisma } from "../prisma";
import { env } from "../config/env";

/**
 * POST /auth/login
 */
export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Invalid input" });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);

    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = sign({ userId: user.id, role: user.role }, env.jwtSecret, {
      expiresIn: "7d",
    });

    return res.json({ token });
  } catch (err) {
    console.error("Login error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * GET /auth/me
 */
export async function me(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    return res.json({
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      createdAt: req.user.createdAt,
    });
  } catch (err) {
    console.error("Me endpoint error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}
