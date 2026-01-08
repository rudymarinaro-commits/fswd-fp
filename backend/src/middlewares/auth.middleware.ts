import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";
import { env } from "../config/env";
import type { User } from "@prisma/client";

// user deve essere opzionale per essere compatibile con Express.Request
export type AuthRequest = Request & { user?: User };

type JwtPayload = { userId: number; role?: string };

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing token" });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;

    if (!payload?.userId) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    (req as AuthRequest).user = user;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}
