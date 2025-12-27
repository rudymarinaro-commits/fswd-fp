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
    // wrap in try/catch per gestire errori inattesi (DB down, env mancante, ecc.)
    // evitare crash e restituire un 500 controllato.
    try {
        const { email, password } = req.body;

        // MODIFICA (Punto 3): validazione tipi oltre al semplice "truthy"
        // Motivo: prevenire errori runtime (es. email oggetto, password numero) che causerebbero eccezioni in Prisma/bcrypt.
        if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
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
    } catch (err) {
        // risposta controllata in caso di eccezioni
        // non esporre dettagli interni e mantenere risposta consistente.
        return res.status(500).json({ message: "Internal server error" });
    }
}

/**
 * GET /auth/me
 */
export async function me(req: AuthRequest, res: Response) {
    //  wrap in try/catch per gestire errori inattesi (DB error, ecc.)
    //  mantenere comportamento stabile e risposta 500 controllata.
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
        // risposta controllata in caso di eccezioni
        // evitare crash
        return res.status(500).json({ message: "Internal server error" });
    }
}
