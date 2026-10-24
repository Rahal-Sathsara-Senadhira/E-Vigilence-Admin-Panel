// Request bodies for reports and triage — docs/02.

import { z } from "zod";
import { SRI_LANKA } from "#src/core/geo.js";
import { normalizePhone, normalizePlate } from "#src/core/srilanka.js";
import { PRIORITIES, STAFF_REJECTION_REASONS } from "./report.model.js";

const DAY = 86_400_000;
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Choose from the list.");
const blank = (/** @type {z.ZodType} */ s) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), s.optional());

const occurredAt = z.coerce
  .date({ error: "Enter when it happened." })
  .refine((d) => d.getTime() <= Date.now() + 5 * 60_000, "This is in the future.")
  .refine((d) => d.getTime() >= Date.now() - 30 * DAY, "Reports must be within the last 30 days.");

const position = {
  lat: blank(
    z.coerce
      .number()
      .min(SRI_LANKA.minLat, "Outside Sri Lanka.")
      .max(SRI_LANKA.maxLat, "Outside Sri Lanka."),
  ),
  lng: blank(
    z.coerce
      .number()
      .min(SRI_LANKA.minLng, "Outside Sri Lanka.")
      .max(SRI_LANKA.maxLng, "Outside Sri Lanka."),
  ),
  address: blank(z.string().trim().max(200)),
};

const plate = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const p = normalizePlate(v);
    if (!p) {
      ctx.addIssue({ code: "custom", message: "Enter a Sri Lankan plate, e.g. WP CAB-1234." });
      return z.NEVER;
    }
    return p;
  });

const vehicle = {
  vehicleNumber: blank(plate),
  plateUnknown: z.boolean().default(false),
  vehicleType: blank(
    z.enum(["motorcycle", "three_wheeler", "car", "van", "bus", "lorry", "tractor", "other"]),
  ),
};
const hasPlateOrUnknown = (/** @type {{ vehicleNumber?: string, plateUnknown: boolean }} */ v) =>
  Boolean(v.vehicleNumber) || v.plateUnknown;
const plateIssue = {
  message: "Enter the plate, or tick “plate unknown”.",
  path: ["vehicleNumber"],
};
const hasPlace = (/** @type {{ lat?: number, lng?: number, address?: string }} */ v) =>
  (v.lat !== undefined && v.lng !== undefined) || Boolean(v.address);
const placeIssue = { message: "Set the place on the map or enter an address.", path: ["address"] };

/** Recorded by staff (docs/02 §3): WhatsApp and phone at HQ; phone, walk-in, officer at stations. */
export const recordSchema = z
  .object({
    channel: z.enum(["whatsapp", "phone", "walk_in", "officer"], {
      error: "Choose how it arrived.",
    }),
    reporter: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("named"),
        name: z.string().trim().min(2, "Enter the reporter's name.").max(120),
        phone: blank(
          z.string().transform((v, ctx) => {
            const p = normalizePhone(v);
            if (!p) {
              ctx.addIssue({ code: "custom", message: "Enter a Sri Lankan phone number." });
              return z.NEVER;
            }
            return p;
          }),
        ),
      }),
      z.object({ kind: z.literal("anonymous") }),
    ]),
    occurredAt,
    ...position,
    ...vehicle,
    offenceCodes: z
      .array(z.string().trim().toUpperCase())
      .min(1, "Choose at least one offence.")
      .max(10),
    description: z
      .string()
      .trim()
      .min(10, "Describe what happened (10 characters or more).")
      .max(2000),
    injuries: z.boolean().default(false),
  })
  .refine(hasPlateOrUnknown, plateIssue)
  .refine(hasPlace, placeIssue)
  .refine((v) => v.channel !== "officer" || v.reporter.kind === "anonymous", {
    message: "An officer's own observation has no separate reporter.",
    path: ["channel"],
  });

export const listSchema = z.object({
  view: z
    .enum([
      "triage",
      "needs_info",
      "station_review",
      "second_officer",
      "accepted",
      "rejected",
      "all",
    ])
    .default("triage"),
  q: z.string().trim().max(80).optional(),
  channel: z.string().trim().max(20).optional(),
  priority: z.enum(PRIORITIES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** HQ's conclusions when accepting — what goes on the case (docs/02 §6.1). */
export const acceptSchema = z
  .object({
    offenceCodes: z
      .array(z.string().trim().toUpperCase())
      .min(1, "Choose at least one offence.")
      .max(10),
    ...vehicle,
    ...position,
    occurredAt,
    priority: z.enum(PRIORITIES),
    noEvidenceReason: blank(z.string().trim().min(5).max(500)),
  })
  .refine(hasPlateOrUnknown, plateIssue)
  .refine(hasPlace, placeIssue);

export const mergeSchema = z.object({
  caseId: objectId,
  note: blank(z.string().trim().max(500)),
});

export const questionSchema = z.object({
  question: z.string().trim().min(10, "Write the question (10 characters or more).").max(500),
});
export const replySchema = z.object({
  answer: z.string().trim().min(1, "Enter the reporter's answer.").max(1000),
});

export const rejectSchema = z.object({
  reasonCode: z.enum(/** @type {[string, ...string[]]} */ (STAFF_REJECTION_REASONS), {
    error: "Choose a reason.",
  }),
  note: blank(z.string().trim().max(1000)),
});

export const reasonSchema = z.object({
  reason: z.string().trim().min(5, "Give a reason (5 characters or more).").max(500),
});

export const prioritySchema = z.object({
  priority: z.enum(PRIORITIES),
  reason: z.string().trim().min(5, "Give a reason (5 characters or more).").max(500),
});
