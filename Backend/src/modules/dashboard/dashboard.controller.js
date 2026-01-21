import { getDashboardSummary } from "./dashboard.service.js";

export async function dashboardSummaryHandler(req, res, next) {
  try {
    const data = await getDashboardSummary();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
