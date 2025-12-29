import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { sign, SignOptions } from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { loginSchema } from "./auth.schemas";
import { env } from "../config/env";
import { AuthRequest } from "../middlewares/auth.middleware";
import { logger } from "../services/logger";

const prisma = new PrismaClient();

/**
 * POST /auth/login
 */
export async function login(req: Request, res: Response) {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      logger.warn("Invalid login input", parsed.error.flatten());
      return res
        .status(400)
        .json({ message: "Invalid input", errors: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      logger.info("Login failed: user not found", { email });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      logger.info("Login failed: wrong password", { userId: user.id });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const signOptions: SignOptions = {
      expiresIn: env.jwtExpiresIn,
    };

    const token = sign(
      { userId: user.id, role: user.role },
      env.jwtSecret,
      signOptions
    );

    logger.info("User logged in", { userId: user.id });

    return res.json({ token });
  } catch (err) {
    logger.error("Unexpected login error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * GET /auth/me
 */
export async function me(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return res.json(user);
  } catch (err) {
    logger.error("Error fetching /me", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}
