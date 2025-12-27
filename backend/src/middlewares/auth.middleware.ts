/*Ho messo auth.middleware.ts in middlewares
 poichè: non è legato solo alla feature auth ma possiamo
 riutilizzarlo per altre rotte (/users, /orders, ecc.)*/

import { Request, Response, NextFunction } from "express";
import { verify, JwtPayload } from "jsonwebtoken";
import { env } from "../config/env";

export interface AuthRequest extends Request {
    user?: {
        userId: number;
        role: string;
    };
}

export function authMiddleware(
    req: AuthRequest,
    res: Response,
    next: NextFunction
) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ message: "Authorization header missing" });
    }

    /*Il parsing del Bearer token è la lettura 
    e separazione dell’Authorization header per estrarre e validare il token JWT.*/
    const [type, token] = authHeader.split(" ");

    if (type !== "Bearer" || !token) {
        return res.status(401).json({ message: "Invalid authorization format" });
    }

    try {
        const decoded = verify(token, env.jwtSecret) as JwtPayload;

        req.user = {
            userId: decoded.userId as number,
            role: decoded.role as string,
        };

        next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}
