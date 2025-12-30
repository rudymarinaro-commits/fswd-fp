import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { sign, SignOptions } from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { loginSchema } from "./auth.schemas";
import { env } from "../config/env";
import { AuthRequest } from "../middlewares/auth.middleware";
import { logger } from "../services/logger";

const prisma = new PrismaClient();

export async function login(req: Request, res: Response) {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      logger.warn({ errors: parsed.error.flatten() }, "Invalid login input");
      return res.status(400).json({ message: "Invalid input" });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      logger.warn({ email }, "Login failed: user not found");
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      logger.warn({ userId: user.id }, "Login failed: wrong password");
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = sign({ userId: user.id, role: user.role }, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn,
    } satisfies SignOptions);

    logger.info({ userId: user.id }, "User logged in");

    return res.json({ token });
  } catch (err) {
    logger.error({ err }, "Login error");
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function me(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    return res.json(user);
  } catch (err) {
    logger.error({ err }, "Me endpoint error");
    return res.status(500).json({ message: "Internal server error" });
  }
}
