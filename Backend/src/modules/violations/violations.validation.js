import { z } from "zod";

export const createViolationSchema = z.object({
  title: z.string().min(2, "title is required (min 2 chars)"),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),

  // Either provide one combined string OR provide both latDms & lngDms
  locationText: z.string().optional(),
  latDms: z.string().optional(),
  lngDms: z.string().optional(),

  status: z.enum(["open", "in_review", "resolved"]).optional(),
});

export const updateViolationSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  status: z.enum(["open", "in_review", "resolved"]).optional(),

  locationText: z.string().optional(),
  latDms: z.string().optional(),
  lngDms: z.string().optional(),
});
