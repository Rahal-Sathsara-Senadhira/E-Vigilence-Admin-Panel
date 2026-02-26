import Violation from "../../../db/providers/mongo/models/Violation.js";
import User from "../../../db/providers/mongo/models/User.js";
import RegionalStation from "../../../db/providers/mongo/models/RegionalStation.js";
import PoliceStation from "../../../db/providers/mongo/models/PoliceStation.js";
import Notification from "../../../db/providers/mongo/models/Notification.js";
import ReportRun from "../../../db/providers/mongo/models/ReportRun.js";

function toId(obj) {
  if (!obj) return null;
  const copy = { ...obj };
  copy.id = String(copy._id);
  delete copy._id;
  return copy;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export async function get({ days = 14 } = {}) {
  const now = new Date();
  const todayStart = startOfDay(now);

  // Guardrails (avoid accidental heavy queries)
  const safeDays = Math.max(1, Math.min(Number(days) || 14, 90));
  const windowStart = startOfDay(addDays(now, -safeDays + 1));

  const [
    violationsTotal,
    usersTotal,
    regionalStationsTotal,
    policeStationsTotal,
    unreadNotifications,
  ] = await Promise.all([
    Violation.countDocuments({}),
    User.countDocuments({}),
    RegionalStation.countDocuments({}),
    PoliceStation.countDocuments({}),
    Notification.countDocuments({ is_read: false }),
  ]);

  // Status breakdown (supports any custom statuses like 'pending')
  const statusRaw = await Violation.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const violationsByStatus = statusRaw.reduce((acc, x) => {
    const key = x._id || "unknown";
    acc[key] = x.count;
    return acc;
  }, {});

  // Today + window counts
  const [todayCount, windowCount] = await Promise.all([
    Violation.countDocuments({ createdAt: { $gte: todayStart, $lte: now } }),
    Violation.countDocuments({ createdAt: { $gte: windowStart, $lte: now } }),
  ]);

  // Trend by day (fills missing days with 0)
  const byDayRaw = await Violation.aggregate([
    { $match: { createdAt: { $gte: windowStart, $lte: now } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byDayMap = new Map(byDayRaw.map((x) => [x._id, x.count]));
  const trendByDay = [];
  for (let i = 0; i < safeDays; i++) {
    const day = addDays(windowStart, i);
    const key = day.toISOString().slice(0, 10);
    trendByDay.push({ day: key, count: byDayMap.get(key) || 0 });
  }

  // Top categories (Violation.type)
  const topCategoriesRaw = await Violation.aggregate([
    { $group: { _id: "$type", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 6 },
  ]);

  const topCategories = topCategoriesRaw.map((x) => ({
    category: x._id || "unknown",
    count: x.count,
  }));

  const latestViolations = await Violation.find({})
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  const latestReportRuns = await ReportRun.find({})
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  return {
    totals: {
      violations: violationsTotal,
      users: usersTotal,
      regionalStations: regionalStationsTotal,
      policeStations: policeStationsTotal,
      unreadNotifications,
    },
    violations: {
      byStatus: violationsByStatus,
      today: todayCount,
      lastNDays: windowCount,
      days: safeDays,
      trendByDay,
      topCategories,
    },
    latestViolations: latestViolations.map(toId),
    latestReportRuns: latestReportRuns.map((r) => ({
      id: String(r._id),
      name: r.name,
      filters: r.filters || null,
      kpis: r.snapshot?.kpis || null,
      createdBy: r.createdBy || null,
      createdAt: r.createdAt,
    })),
  };
}

export default { get };