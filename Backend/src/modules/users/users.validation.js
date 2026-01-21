import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(["admin", "officer", "viewer"]),
  station_id: z.string().uuid().nullable().optional(),
});

export const updateUserSchema = z.object({
  role: z.enum(["admin", "officer", "viewer"]).optional(),
  station_id: z.string().uuid().nullable().optional(),
  status: z.enum(["active", "disabled"]).optional(),
});
