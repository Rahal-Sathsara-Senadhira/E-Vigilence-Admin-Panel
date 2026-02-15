import Violation from "../../../db/providers/mongo/models/Violation.js";
import User from "../../../db/providers/mongo/models/User.js";
import RegionalStation from "../../../db/providers/mongo/models/RegionalStation.js";

function toId(obj) {
  if (!obj) return null;
  const copy = { ...obj };
  copy.id = String(copy._id);
  delete copy._id;
  return copy;
}

export async function get() {
  const [violationsTotal, usersTotal, stationsTotal] = await Promise.all([
    Violation.countDocuments({}),
    User.countDocuments({}),
    RegionalStation.countDocuments({}),
  ]);

  const latestViolations = await Violation.find({})
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  return {
    totals: {
      violations: violationsTotal,
      users: usersTotal,
      stations: stationsTotal,
    },
    latestViolations: latestViolations.map(toId),
  };
}

export default { get };
