import mongoose from "mongoose";
import Violation from "../../db/providers/mongo/models/Violation.js";
import Dispatch from "../../db/providers/mongo/models/Dispatch.js";
import User from "../../db/providers/mongo/models/User.js";
import { slaFilters } from "../dispatch/dispatchSla.js";

const OPEN_STATUSES = ["open", "pending", "in_review"];
const STATION_ROLES = ["station_admin", "station_officer"];
const DAY = 24 * 60 * 60 * 1000;

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const toMap = (rows) => new Map(rows.map((r) => [String(r._id), r.n]));

// Workload numbers per station: open cases, unacknowledged and overdue
// dispatches, active officers, and cases returned in the last 30 days.
// `stationIds` limits the work to those stations (omit for all).
export async function stationWorkload(stationIds = null) {
  const ids = stationIds ? stationIds.map(oid) : null;
  const byStation = (field) => (ids ? { [field]: { $in: ids } } : {});
  const sla = slaFilters();
  const since30 = new Date(Date.now() - 30 * DAY);

  const [open, unack, overdue, officers, returnedNow, returnedHist] = await Promise.all([
    Violation.aggregate([
      { $match: { ...byStation("assignedStation"), status: { $in: OPEN_STATUSES } } },
      { $group: { _id: "$assignedStation", n: { $sum: 1 } } },
    ]),
    Dispatch.aggregate([{ $match: { ...byStation("station"), ...sla.unacknowledged } }, { $group: { _id: "$station", n: { $sum: 1 } } }]),
    Dispatch.aggregate([{ $match: { ...byStation("station"), ...sla.overdue } }, { $group: { _id: "$station", n: { $sum: 1 } } }]),
    User.aggregate([
      { $match: { ...byStation("stationId"), role: { $in: STATION_ROLES }, isActive: true } },
      { $group: { _id: "$stationId", n: { $sum: 1 } } },
    ]),
    Dispatch.aggregate([
      { $match: { ...byStation("station"), status: "returned", returnedAt: { $gte: since30 } } },
      { $group: { _id: "$station", n: { $sum: 1 } } },
    ]),
    Dispatch.aggregate([
      { $unwind: "$history" },
      { $match: { ...byStation("history.station"), "history.returnedAt": { $gte: since30 } } },
      { $group: { _id: "$history.station", n: { $sum: 1 } } },
    ]),
  ]);

  const maps = {
    openCases: toMap(open),
    unacknowledged: toMap(unack),
    overdue: toMap(overdue),
    officers: toMap(officers),
    returnedNow: toMap(returnedNow),
    returnedHist: toMap(returnedHist),
  };

  return (stationId) => {
    const k = String(stationId);
    return {
      openCases: maps.openCases.get(k) || 0,
      unacknowledged: maps.unacknowledged.get(k) || 0,
      overdue: maps.overdue.get(k) || 0,
      officers: maps.officers.get(k) || 0,
      returned30d: (maps.returnedNow.get(k) || 0) + (maps.returnedHist.get(k) || 0),
    };
  };
}

// Extra numbers for one station's profile: cases by status, cases decided
// this month, and the average time from dispatch to acceptance.
export async function stationProfileStats(stationId) {
  const id = oid(stationId);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [byStatus, decidedThisMonth, ack] = await Promise.all([
    Violation.aggregate([{ $match: { assignedStation: id } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    Violation.aggregate([
      { $match: { assignedStation: id } },
      { $unwind: "$statusHistory" },
      {
        $match: {
          "statusHistory.status": { $in: ["verified", "rejected", "resolved"] },
          "statusHistory.changedAt": { $gte: monthStart },
        },
      },
      { $group: { _id: "$statusHistory.status", n: { $sum: 1 } } },
    ]),
    Dispatch.aggregate([
      {
        $match: {
          station: id,
          method: { $ne: "station_created" },
          receivedAt: { $ne: null },
          sentAt: { $gte: new Date(Date.now() - 90 * DAY) },
        },
      },
      { $group: { _id: null, avgMs: { $avg: { $subtract: ["$receivedAt", "$sentAt"] } }, n: { $sum: 1 } } },
    ]),
  ]);

  return {
    byStatus: Object.fromEntries(byStatus.map((r) => [r._id, r.n])),
    decidedThisMonth: Object.fromEntries(decidedThisMonth.map((r) => [r._id, r.n])),
    avgHoursToAccept: ack[0]?.n ? Math.round((ack[0].avgMs / 3600000) * 10) / 10 : null,
  };
}
