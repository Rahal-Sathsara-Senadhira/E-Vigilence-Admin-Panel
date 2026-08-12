import asyncHandler from "../../utils/asyncHandler.js";
import * as svc from "./settings.service.js";

export const list = asyncHandler(async (req, res) => {
  const items = await svc.list();
  res.json(items);
});

export const getByKey = asyncHandler(async (req, res) => {
  const item = await svc.getByKey(req.params.key);
  res.json(item);
});

export const upsert = asyncHandler(async (req, res) => {
  const saved = await svc.upsert(req.params.key, req.body.value);
  res.json(saved);
});

// The bundle the Settings page loads on open.
export const getMine = asyncHandler(async (req, res) => {
  const data = await svc.getSettingsForUser(req.user?.id);
  res.json({ data });
});

export const patchProfile = asyncHandler(async (req, res) => {
  const updated = await svc.updateProfile(req.user?.id, req.body || {});
  res.json({ data: updated });
});

export const patchPassword = asyncHandler(async (req, res) => {
  const result = await svc.changePassword(req.user?.id, req.body || {});
  res.json({ data: result });
});

export const patchPreferences = asyncHandler(async (req, res) => {
  const updated = await svc.updatePreferences(req.user?.id, req.body || {});
  res.json({ data: updated });
});

export const patchSystem = asyncHandler(async (req, res) => {
  const updated = await svc.updateSystem(req.body || {});
  res.json({ data: updated });
});
