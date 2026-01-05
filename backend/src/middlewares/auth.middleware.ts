import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: number;
    };

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });
    if (!user) return res.status(401).json({ error: "User not found" });

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}
