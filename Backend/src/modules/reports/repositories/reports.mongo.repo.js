import Violation from "../../../db/providers/mongo/models/Violation.js";

function parseDate(s) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function summary({ from, to, type }) {
  const match = {};
  if (type) match.type = type;

  const fromDate = from ? parseDate(from) : null;
  const toDate = to ? parseDate(to) : null;

  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = fromDate;
    if (toDate) match.createdAt.$lte = toDate;
  }

  const [byType, byStatus, total] = await Promise.all([
    Violation.aggregate([
      { $match: match },
      { $group: { _id: "$type", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Violation.aggregate([
      { $match: match },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Violation.countDocuments(match),
  ]);

  return {
    total,
    byType: byType.map((x) => ({ type: x._id, count: x.count })),
    byStatus: byStatus.map((x) => ({ status: x._id, count: x.count })),
  };
}

export default { summary };
