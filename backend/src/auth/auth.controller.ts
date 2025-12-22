import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { sign, SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { PrismaClient } from "@prisma/client";

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
    throw new Error("JWT_SECRET is not defined");
}


const prisma = new PrismaClient();

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
