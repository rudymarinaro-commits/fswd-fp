import { z } from "zod";

export const createMessageSchema = z.object({
  roomId: z.number().int().positive(),
  content: z.string().min(1).max(1000),
});
