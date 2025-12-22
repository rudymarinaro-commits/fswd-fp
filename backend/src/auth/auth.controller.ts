import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { sign, SignOptions } from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

import { env } from "../config/env";
import { AuthRequest } from "../middlewares/auth.middleware";

const prisma = new PrismaClient();

/**
 * POST /auth/login
 */
export async function login(req: Request, res: Response) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
    }

    const user = await prisma.user.findUnique({
        where: { email },
    });

    if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
    }

    const signOptions: SignOptions = {
        expiresIn: env.jwtExpiresIn,
    };

    const token = sign(
        {
            userId: user.id,
            role: user.role,
        },
        env.jwtSecret,
        signOptions
    );

    return res.json({ token });
}

/**
 * GET /auth/me
 */
export async function me(req: AuthRequest, res: Response) {
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
}
