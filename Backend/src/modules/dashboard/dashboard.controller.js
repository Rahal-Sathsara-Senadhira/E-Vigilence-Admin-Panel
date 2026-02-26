import * as service from "./dashboard.service.js";

export async function getDashboard(req, res, next) {
  try {
    const daysRaw = req.query.days;
    const days = Math.max(
      1,
      Math.min(365, Number.isFinite(Number(daysRaw)) ? Number(daysRaw) : 14)
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