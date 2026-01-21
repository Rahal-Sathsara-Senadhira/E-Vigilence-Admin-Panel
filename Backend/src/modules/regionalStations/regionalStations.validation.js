import { z } from "zod";

export const createStationSchema = z.object({
  name: z.string().min(2),
  code: z.string().optional(),
  region: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  latitude: z.number(),
  longitude: z.number(),
});
