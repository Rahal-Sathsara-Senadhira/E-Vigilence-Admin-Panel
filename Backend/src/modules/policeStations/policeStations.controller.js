import asyncHandler from "../../utils/asyncHandler.js";
import { HttpError } from "../../utils/httpError.js";
import * as svc from "./stations.service.js";

export const list = asyncHandler(async (req, res) => {
  res.json(await svc.listStations(req.query, req.user));
});

export const verificationQueue = asyncHandler(async (_req, res) => {
  res.json(await svc.verificationQueue());
});

export const nearest = asyncHandler(async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const limit = Math.min(Math.max(Number(req.query.limit) || 3, 1), 20);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new HttpError(400, "lat and lng are required numbers");
  }
  res.json(await svc.nearestStations(lat, lng, limit));
});

export const getById = asyncHandler(async (req, res) => {
  res.json(await svc.getStation(req.params.stationId, req.user));
});

export const officers = asyncHandler(async (req, res) => {
  res.json(await svc.listOfficers(req.params.stationId, req.user));
});

export const audit = asyncHandler(async (req, res) => {
  res.json(await svc.listAudit(req.params.stationId, req.user));
});

export const create = asyncHandler(async (req, res) => {
  res.status(201).json(await svc.createStation(req.body || {}, req.user));
});

export const update = asyncHandler(async (req, res) => {
  res.json(await svc.updateStation(req.params.stationId, req.body || {}, req.user));
});

export const verify = asyncHandler(async (req, res) => {
  res.json(await svc.verifyStation(req.params.stationId, req.body || {}, req.user));
});

export const setJurisdiction = asyncHandler(async (req, res) => {
  res.json(await svc.setJurisdiction(req.params.stationId, req.body?.geometry ?? null, req.user));
});

export const deactivationPlan = asyncHandler(async (req, res) => {
  res.json(await svc.deactivationPlan(req.params.stationId));
});

export const deactivate = asyncHandler(async (req, res) => {
  res.json(await svc.deactivateStation(req.params.stationId, req.body || {}, req.user));
});

export const reactivate = asyncHandler(async (req, res) => {
  res.json(await svc.reactivateStation(req.params.stationId, req.user));
});

export const remove = asyncHandler(async (req, res) => {
  await svc.deleteStation(req.params.stationId);
  res.json({ ok: true });
});

export const importCsv = asyncHandler(async (req, res) => {
  res.json(await svc.importStations(req.body?.rows, req.user));
});
