import { z } from "zod";

export const createRoomSchema = z.object({
  otherUserId: z.number().int().positive(),
});
