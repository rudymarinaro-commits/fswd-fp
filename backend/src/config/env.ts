import type { SignOptions } from "jsonwebtoken";

export const env = {
    jwtSecret: process.env.JWT_SECRET!,
    jwtExpiresIn: (process.env.JWT_EXPIRES_IN || "7d") as SignOptions["expiresIn"],
};

if (!env.jwtSecret) {
    throw new Error("JWT_SECRET is not defined");
}


if (!env.jwtSecret) {
    throw new Error("JWT_SECRET is not defined");
}
