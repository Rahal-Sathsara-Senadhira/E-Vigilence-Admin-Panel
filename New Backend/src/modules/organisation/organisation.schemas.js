// Request bodies and queries for divisions and stations.

import { z } from "zod";
import { SRI_LANKA } from "#src/core/geo.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Choose from the list.");
const blankToUndefined = (/** @type {z.ZodType} */ schema) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

const lat = z.coerce
  .number({ error: "Enter the latitude." })
  .min(SRI_LANKA.minLat, "This latitude is outside Sri Lanka.")
  .max(SRI_LANKA.maxLat, "This latitude is outside Sri Lanka.");
const lng = z.coerce
  .number({ error: "Enter the longitude." })
  .min(SRI_LANKA.minLng, "This longitude is outside Sri Lanka.")
  .max(SRI_LANKA.maxLng, "This longitude is outside Sri Lanka.");
const phone = z
  .string()
  .trim()
  .regex(/^[+\d][\d\s-]{6,19}$/, "Enter a phone number, e.g. 081 222 2222.");

export const divisionSchema = z.object({
  name: z.string().trim().min(2, "Enter the division name.").max(80),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,24}$/, "Use 2–24 letters, digits or dashes."),
  range: blankToUndefined(z.string().trim().max(80)),
  province: blankToUndefined(z.string().trim().max(40)),
});

export const stationListSchema = z.object({
  q: z.string().trim().max(80).optional(),
  divisionId: objectId.optional(),
  status: z.enum(["verified", "unverified", "inactive"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const contactSchema = z.object({
  address: blankToUndefined(z.string().trim().max(200)),
  phone: blankToUndefined(phone),
  email: blankToUndefined(z.string().trim().toLowerCase().email("Enter a valid email address.")),
});

export const stationSchema = contactSchema.extend({
  name: z.string().trim().min(3, "Enter the station name.").max(80),
  code: blankToUndefined(
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{2,24}$/, "Use 2–24 letters, digits or dashes."),
  ),
  divisionId: objectId,
  lat,
  lng,
});

export const verifySchema = z.object({ divisionId: objectId, lat, lng });

export const areaSchema = z.object({ area: z.any() });

export const reasonSchema = z.object({
  reason: z.string().trim().min(5, "Give a short reason (at least 5 characters).").max(500),
});
