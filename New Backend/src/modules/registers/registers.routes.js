// /api/v1/persons and /api/v1/vehicles — the registers (docs/04).

import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "#src/core/access/guards.js";
import { body, query } from "#src/core/http/validate.js";
import { PERSON_TYPES, VEHICLE_FLAGS } from "./registers.model.js";
import {
  createPerson,
  flagVehicle,
  getPerson,
  getVehicle,
  searchPersons,
  updatePerson,
} from "./registers.service.js";

const text = (/** @type {number} */ max) => z.string().trim().max(max);
const optional = (/** @type {z.ZodString} */ s) =>
  z.preprocess((v) => (v === "" ? undefined : v), s.optional());

const searchSchema = z.object({
  nic: optional(text(20)),
  licence: optional(text(30)),
  brn: optional(text(40)),
  q: optional(text(100)),
});
const personFields = {
  name: z.string().trim().min(2, "Enter the name.").max(150),
  nic: optional(text(20)),
  licenceNumber: optional(text(30)),
  businessRegNo: optional(text(40)),
  address: optional(text(300)),
  phone: optional(text(30)),
};
const createSchema = z.object({ type: z.enum(PERSON_TYPES), ...personFields });
const updateSchema = z.object({
  ...Object.fromEntries(Object.entries(personFields).map(([k, v]) => [k, v.optional()])),
  reason: z.string().trim().min(5, "Say why the details change.").max(500),
});
const flagSchema = z.object({
  type: z.enum(VEHICLE_FLAGS),
  note: z.string().trim().min(5, "Describe what you found.").max(1000),
  reference: optional(text(100)),
  since: z.coerce
    .date()
    .max(new Date(Date.now() + 60_000), "Not in the future.")
    .optional(),
});

/** @param {import("express").Request} req */
const ctx = (req) => ({
  ip: req.ip ?? null,
  userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
});
/** @param {import("express").Request} req */
const actor = (req) => /** @type {NonNullable<typeof req.auth>} */ (req.auth);
/** @param {import("express").Request} req */
const idOf = (req) => String(req.params.id);

export function personsRoutes() {
  const router = Router();
  const view = requirePermission("persons.view");
  router.get("/search", view, query(searchSchema), async (req, res) => {
    res.json(await searchPersons(actor(req), req.validQuery));
  });
  router.post("/", requirePermission("cases.investigate"), body(createSchema), async (req, res) => {
    res.status(201).json(await createPerson(actor(req), req.body, ctx(req)));
  });
  router.get("/:id", view, async (req, res) => {
    res.json(await getPerson(actor(req), idOf(req), ctx(req)));
  });
  router.patch("/:id", view, body(updateSchema), async (req, res) => {
    res.json(await updatePerson(actor(req), idOf(req), req.body, ctx(req)));
  });
  return router;
}

export function vehiclesRoutes() {
  const router = Router();
  router.get("/:id", requirePermission("cases.view"), async (req, res) => {
    res.json(await getVehicle(actor(req), idOf(req)));
  });
  router.post(
    "/:id/flags",
    requirePermission("cases.investigate"),
    body(flagSchema),
    async (req, res) => {
      res.json(await flagVehicle(actor(req), idOf(req), req.body, ctx(req)));
    },
  );
  return router;
}
