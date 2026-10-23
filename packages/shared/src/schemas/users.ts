// Staff accounts — docs/01-roles-and-permissions.md §7.

import { z } from "zod";
import { STAFF_ROLES } from "../roles.js";
import { normalizeNic, normalizePhone } from "../utils/srilanka.js";
import { emailSchema } from "./auth.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id.");

export const nicSchema = z.string().transform((v, ctx) => {
  const nic = normalizeNic(v);
  if (!nic) {
    ctx.addIssue({
      code: "custom",
      message: "Enter a valid NIC (e.g. 852345678V or 198523405678).",
    });
    return z.NEVER;
  }
  return nic;
});

export const phoneSchema = z.string().transform((v, ctx) => {
  if (v.trim() === "") return null;
  const phone = normalizePhone(v);
  if (!phone) {
    ctx.addIssue({ code: "custom", message: "Enter a valid Sri Lankan phone number." });
    return z.NEVER;
  }
  return phone;
});

export const createUserSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the full name.").max(120),
    email: emailSchema,
    nic: nicSchema,
    phone: phoneSchema.optional(),
    role: z.enum(STAFF_ROLES),
    stationId: objectId.nullable().optional(),
  })
  .refine((v) => !["station_oic", "station_officer"].includes(v.role) || !!v.stationId, {
    message: "Choose the station for this role.",
    path: ["stationId"],
  });
export type CreateUserInput = z.input<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
});
export type UpdateUserInput = z.input<typeof updateUserSchema>;

export const changeRoleSchema = z
  .object({
    role: z.enum(STAFF_ROLES),
    stationId: objectId.nullable().optional(),
    reason: z.string().trim().min(5, "Give a reason.").max(500),
  })
  .refine((v) => !["station_oic", "station_officer"].includes(v.role) || !!v.stationId, {
    message: "Choose the station for this role.",
    path: ["stationId"],
  });
export type ChangeRoleInput = z.input<typeof changeRoleSchema>;

export const reasonSchema = z.object({
  reason: z.string().trim().min(5, "Give a reason.").max(500),
});
export type ReasonInput = z.input<typeof reasonSchema>;

export const listUsersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(STAFF_ROLES).optional(),
  stationId: objectId.optional(),
  active: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListUsersQuery = z.input<typeof listUsersQuerySchema>;

export interface StaffUserView {
  id: string;
  name: string;
  email: string;
  nicMasked: string;
  phone: string | null;
  role: (typeof STAFF_ROLES)[number];
  stationId: string | null;
  stationName: string | null;
  active: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
