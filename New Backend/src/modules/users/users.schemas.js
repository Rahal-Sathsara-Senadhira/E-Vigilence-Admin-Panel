// Request bodies and queries for staff accounts — docs/20 §6.

import { z } from "zod";
import { ROLES } from "#src/core/access/roles.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Choose from the list.");
const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(160);
const serviceNumber = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, "").toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9-]{3,20}$/, "Use 3–20 letters, digits or dashes."));
const optional = (/** @type {z.ZodType} */ schema) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

export const listQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  role: z.enum(/** @type {[string, ...string[]]} */ (ROLES)).optional(),
  status: z.enum(["active", "inactive", "locked"]).optional(),
  stationId: objectId.optional(),
  divisionId: objectId.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const accountFields = {
  name: z.string().trim().min(3, "Enter the full name.").max(120),
  email: optional(email),
  serviceNumber: optional(serviceNumber),
  phone: optional(z.string().trim().max(20)),
  role: z.enum(/** @type {[string, ...string[]]} */ (ROLES), { error: "Choose a role." }),
  stationId: optional(objectId),
  divisionId: optional(objectId),
};

/** Email or service number: at least one is needed to sign in. */
const hasSignInId = (/** @type {{ email?: string, serviceNumber?: string }} */ v) =>
  Boolean(v.email || v.serviceNumber);
const signInIdIssue = {
  message: "Enter an email address or a service number — one is needed to sign in.",
  path: ["email"],
};

export const createUserSchema = z.object(accountFields).refine(hasSignInId, signInIdIssue);
export const updateUserSchema = z.object(accountFields).refine(hasSignInId, signInIdIssue);

export const reasonSchema = z.object({
  reason: z.string().trim().min(5, "Give a short reason (at least 5 characters).").max(500),
});
