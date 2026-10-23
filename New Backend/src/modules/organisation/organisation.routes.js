// /api/v1/divisions and /api/v1/stations — HTTP in and out only.

import { Router } from "express";
import { requirePermission } from "#src/core/access/guards.js";
import { body, query } from "#src/core/http/validate.js";
import {
  areaSchema,
  contactSchema,
  divisionSchema,
  reasonSchema,
  stationListSchema,
  stationSchema,
  verifySchema,
} from "./organisation.schemas.js";
import {
  createDivision,
  createStation,
  deactivateStation,
  getStation,
  listDivisions,
  listStations,
  reactivateStation,
  setArea,
  stationsForMap,
  updateContact,
  updateDivision,
  updateStation,
  verifyStation,
} from "./organisation.service.js";

/** @param {import("express").Request} req */
const ctx = (req) => ({
  ip: req.ip ?? null,
  userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
});
/** @param {import("express").Request} req */
const actor = (req) => /** @type {NonNullable<typeof req.auth>} */ (req.auth);
/** @param {import("express").Request} req */
const idOf = (req) => String(req.params.id);

export function divisionsRoutes() {
  const router = Router();
  router.get("/", requirePermission("stations.view"), async (req, res) => {
    res.json(await listDivisions(actor(req)));
  });
  router.post("/", requirePermission("stations.manage"), body(divisionSchema), async (req, res) => {
    res.status(201).json(await createDivision(actor(req), req.body, ctx(req)));
  });
  router.put(
    "/:id",
    requirePermission("stations.manage"),
    body(divisionSchema),
    async (req, res) => {
      res.json(await updateDivision(actor(req), idOf(req), req.body, ctx(req)));
    },
  );
  return router;
}

export function stationsRoutes() {
  const router = Router();
  const view = requirePermission("stations.view");
  const manage = requirePermission("stations.manage");

  router.get("/", view, query(stationListSchema), async (req, res) => {
    res.json(await listStations(actor(req), req.validQuery));
  });
  router.get("/map", view, async (req, res) => {
    res.json(await stationsForMap(actor(req)));
  });
  router.get("/:id", view, async (req, res) => {
    res.json(await getStation(actor(req), idOf(req)));
  });
  router.post("/", manage, body(stationSchema), async (req, res) => {
    res.status(201).json(await createStation(actor(req), req.body, ctx(req)));
  });
  router.put("/:id", manage, body(stationSchema), async (req, res) => {
    res.json(await updateStation(actor(req), idOf(req), req.body, ctx(req)));
  });
  router.put(
    "/:id/contact",
    requirePermission("stations.editContact"),
    body(contactSchema),
    async (req, res) => {
      res.json(await updateContact(actor(req), idOf(req), req.body, ctx(req)));
    },
  );
  router.post("/:id/verify", manage, body(verifySchema), async (req, res) => {
    res.json(await verifyStation(actor(req), idOf(req), req.body, ctx(req)));
  });
  router.put("/:id/area", manage, body(areaSchema), async (req, res) => {
    res.json(await setArea(actor(req), idOf(req), req.body.area ?? null, ctx(req)));
  });
  router.post("/:id/deactivate", manage, body(reasonSchema), async (req, res) => {
    res.json(await deactivateStation(actor(req), idOf(req), req.body.reason, ctx(req)));
  });
  router.post("/:id/reactivate", manage, async (req, res) => {
    res.json(await reactivateStation(actor(req), idOf(req), ctx(req)));
  });
  return router;
}
