import { getSettings, updateSettings } from "./settings.service.js";

export async function getSettingsHandler(req, res, next) {
  try {
    const settings = await getSettings();
    res.json({ data: settings });
  } catch (e) {
    next(e);
  }
}

export async function updateSettingsHandler(req, res, next) {
  try {
    const updated = await updateSettings(req.body);
    res.json({ data: updated });
  } catch (e) {
    next(e);
  }
}
