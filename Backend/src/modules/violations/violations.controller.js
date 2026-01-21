import {
  createViolationSchema,
  updateViolationSchema,
} from "./violations.validation.js";

import {
  createViolation,
  getViolations,
  getViolationById,
  updateViolation,
  deleteViolation,
} from "./violations.service.js";

import { parseLocationText, parseSingleDms } from "../../utils/parseDms.js";
import { createNotification } from "../notifications/notifications.service.js";

function parseBbox(bboxStr) {
  if (!bboxStr) return null;
  const parts = String(bboxStr)
    .split(",")
    .map((x) => Number(x.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  // minLng,minLat,maxLng,maxLat
  return parts;
}

function buildLocation(payload) {
  // Supports:
  // 1) locationText: "6°07'11.7\"N 80°12'50.8\"E"
  // 2) latDms + lngDms separately

  if (payload.locationText) {
    const parsed = parseLocationText(payload.locationText);
    return {
      location_text: payload.locationText,
      lat_dms: parsed.latDms,
      lng_dms: parsed.lngDms,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
    };
  }

  if (payload.latDms && payload.lngDms) {
    const latP = parseSingleDms(payload.latDms);
    const lngP = parseSingleDms(payload.lngDms);

    const lat = latP.value;
    const lng = lngP.value;

    if (lat < -90 || lat > 90)
      throw new Error("Latitude out of range (-90..90).");
    if (lng < -180 || lng > 180)
      throw new Error("Longitude out of range (-180..180).");

    return {
      location_text: `${payload.latDms} ${payload.lngDms}`,
      lat_dms: payload.latDms,
      lng_dms: payload.lngDms,
      latitude: lat,
      longitude: lng,
    };
  }

  throw new Error(
    "Location is required. Provide either locationText OR both latDms and lngDms.",
  );
}

export async function createViolationHandler(req, res, next) {
  try {
    const parsed = createViolationSchema.parse(req.body);

    const loc = buildLocation(parsed);

    const created = await createViolation({
      title: parsed.title,
      description: parsed.description,
      category: parsed.category,
      status: parsed.status ?? "open",
      ...loc,
    });

    await createNotification({
      type: "violation",
      title: "New Violation Reported",
      message: parsed.title,
      related_id: created.id,
    });

    res.status(201).json({ data: created });
  } catch (err) {
    next(err);
  }
}

export async function listViolationsHandler(req, res, next) {
  try {
    const { status, category, q } = req.query;

    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const bbox = parseBbox(req.query.bbox);

    const result = await getViolations({
      status: status || undefined,
      category: category || undefined,
      q: q || undefined,
      limit,
      offset,
      bbox,
    });

    res.json({
      data: result.items,
      meta: { total: result.total, limit: result.limit, offset: result.offset },
    });
  } catch (err) {
    next(err);
  }
}

export async function getViolationHandler(req, res, next) {
  try {
    const { id } = req.params;
    const item = await getViolationById(id);
    if (!item) return res.status(404).json({ error: "Violation not found" });
    res.json({ data: item });
  } catch (err) {
    next(err);
  }
}

export async function updateViolationHandler(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = updateViolationSchema.parse(req.body);

    const patch = {};

    if (parsed.title !== undefined) patch.title = parsed.title;
    if (parsed.description !== undefined)
      patch.description = parsed.description;
    if (parsed.category !== undefined) patch.category = parsed.category;
    if (parsed.status !== undefined) patch.status = parsed.status;

    // If they send any location fields, re-parse and update coordinates
    const hasLocationChange =
      parsed.locationText !== undefined ||
      parsed.latDms !== undefined ||
      parsed.lngDms !== undefined;

    if (hasLocationChange) {
      const loc = buildLocation(parsed);
      patch.location_text = loc.location_text;
      patch.lat_dms = loc.lat_dms;
      patch.lng_dms = loc.lng_dms;
      patch.latitude = loc.latitude;
      patch.longitude = loc.longitude;
    }

    const updated = await updateViolation(id, patch);
    if (!updated) return res.status(404).json({ error: "Violation not found" });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
}

export async function deleteViolationHandler(req, res, next) {
  try {
    const { id } = req.params;
    const deleted = await deleteViolation(id);
    if (!deleted) return res.status(404).json({ error: "Violation not found" });
    res.json({ data: { id: deleted.id } });
  } catch (err) {
    next(err);
  }
}
