import { z } from "zod";

export const createStationSchema = z.object({
  name: z.string().min(2),
  code: z.string().optional(),
  region: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),

  // ✅ accept "6.0535" as well as 6.0535
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
});
