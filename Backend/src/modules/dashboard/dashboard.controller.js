import * as service from "./dashboard.service.js";

export async function getDashboard(req, res, next) {
  try {
    const daysRaw = req.query.days;
    // Ceiling of 3650 (~10y) so an "All time" range option on the frontend
    // is meaningfully different from the usual 7/14/30/90-day presets.
    const days = Math.max(
      1,
      Math.min(3650, Number.isFinite(Number(daysRaw)) ? Number(daysRaw) : 14)
    );

    const data = await service.getDashboard({
      days,
      userId: req.user?.id || null,
      stationId: req.user?.stationId || null,
      role: req.user?.role || null,
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
}