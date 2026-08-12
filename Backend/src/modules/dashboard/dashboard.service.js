import Violation from "../../db/providers/mongo/models/Violation.js";
import Notification from "../../db/providers/mongo/models/Notification.js";
import User from "../../db/providers/mongo/models/User.js";
import PoliceStation from "../../db/providers/mongo/models/PoliceStation.js";
import ReportRun from "../../db/providers/mongo/models/ReportRun.js";

function startDateForDays(days) {
  const d = new Date();
  d.setDate(d.getDate() - days + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getDashboard({ days = 14, userId = null, stationId = null, role = null }) {
  const from = startDateForDays(days);
  const to = new Date();

  // If you later want station-based filtering:
  // - Your Violation schema currently doesn't store stationId.
  // - So we can't filter by station yet.
  // Keeping args for future.

  const baseFilter = {
    createdAt: { $gte: from, $lte: to },
  };

  const [
    total,
    open,
    in_review,
    resolved,
    byCategoryRaw,
    byDayRaw,
    recentViolations,
    unreadNotifications,
    violationsAllTime,
    usersAllTime,
    stationsAllTime,
    latestReportRunsRaw,
  ] = await Promise.all([
    Violation.countDocuments(baseFilter),
    Violation.countDocuments({ ...baseFilter, status: "open" }),
    Violation.countDocuments({ ...baseFilter, status: "in_review" }),
    Violation.countDocuments({ ...baseFilter, status: "resolved" }),

    // byCategory (type)
    Violation.aggregate([
      { $match: baseFilter },
      { $group: { _id: "$type", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),

    // byDay
    Violation.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Recent
    Violation.find(baseFilter)
      .sort({ createdAt: -1 })
      .limit(10)
      .select("_id title type status createdAt")
      .lean(),

    // Unread notifications for current user (optional)
    userId
      ? Notification.countDocuments({ user_id: String(userId), is_read: false })
      : 0,

    // System-wide totals (not scoped to `days`)
    Violation.countDocuments({}),
    User.countDocuments({}),
    PoliceStation.countDocuments({}),

    // Latest saved report runs
    ReportRun.find({}).sort({ createdAt: -1 }).limit(5).lean(),
  ]);

  return {
    range: {
      days,
      from,
      to,
    },
    totals: {
      violations: violationsAllTime,
      users: usersAllTime,
      stations: stationsAllTime,
    },
    kpis: {
      total,
      open,
      in_review,
      resolved,
      unreadNotifications,
    },
    byCategory: byCategoryRaw.map((x) => ({
      category: x._id || "unknown",
      count: x.count,
    })),
    byDay: byDayRaw.map((x) => ({
      day: x._id,
      count: x.count,
    })),
    recentViolations: recentViolations.map((v) => ({
      id: String(v._id),
      title: v.title,
      type: v.type,
      status: v.status,
      createdAt: v.createdAt,
    })),
    latestReportRuns: latestReportRunsRaw.map((r) => ({
      id: String(r._id),
      name: r.name,
      kpis: r.snapshot?.kpis || null,
      createdAt: r.createdAt,
    })),
    viewer: {
      role,
      stationId,
      userId,
    },
  };
}