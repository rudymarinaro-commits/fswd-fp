import { NextFunction, Request, Response } from "express";
import { logger } from "../services/logger";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  logger.error({ err }, "Unhandled error");
  return res.status(500).json({ message: "Internal server error" });
}
