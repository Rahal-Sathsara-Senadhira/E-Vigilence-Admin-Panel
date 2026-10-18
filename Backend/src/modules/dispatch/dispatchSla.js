import Dispatch from "../../db/providers/mongo/models/Dispatch.js";
import User from "../../db/providers/mongo/models/User.js";
import Notification from "../../db/providers/mongo/models/Notification.js";

// Dispatch time limits, measured from when the case was sent:
//   - unacknowledged: still "sent" (not accepted) after 24 hours
//   - overdue: still "sent" or "received" — no work started — after 72 hours
export const SLA_HOURS = { acknowledge: 24, act: 72 };

const HOUR = 60 * 60 * 1000;

// { unacknowledged, overdue } for one dispatch (lean or doc).
export function slaState(d, now = Date.now()) {
  const sent = d?.sentAt ? new Date(d.sentAt).getTime() : null;
  if (!sent) return { unacknowledged: false, overdue: false };
  const age = now - sent;
  return {
    unacknowledged: d.status === "sent" && age > SLA_HOURS.acknowledge * HOUR,
    overdue: ["sent", "received"].includes(d.status) && age > SLA_HOURS.act * HOUR,
  };
}

// Mongo filters for the same rules (counts on station/division pages).
export function slaFilters(now = Date.now()) {
  return {
    unacknowledged: { status: "sent", sentAt: { $lt: new Date(now - SLA_HOURS.acknowledge * HOUR) } },
    overdue: { status: { $in: ["sent", "received"] }, sentAt: { $lt: new Date(now - SLA_HOURS.act * HOUR) } },
  };
}

export async function notifyHq({ title, message, meta = {} }) {
  const hq = await User.find({ role: "hq", isActive: true }).select("_id").lean();
  if (hq.length === 0) return;
  await Notification.insertMany(hq.map((u) => ({ title, message, user_id: String(u._id), meta })));
}

async function notifyStation(stationId, { title, message, meta = {} }) {
  const admins = await User.find({ stationId, role: "station_admin", isActive: true }).select("_id").lean();
  if (admins.length === 0) return;
  await Notification.insertMany(admins.map((u) => ({ title, message, user_id: String(u._id), meta })));
}

// Run periodically (server.js): alerts once per breach — HQ and the
// station's admins — and records it on the dispatch so it isn't repeated.
export async function checkDispatchSla(now = Date.now()) {
  const f = slaFilters(now);
  let alerts = 0;

  const unack = await Dispatch.find({ ...f.unacknowledged, "slaAlerts.unacknowledgedAt": null })
    .populate("violation", "title")
    .populate("station", "name")
    .limit(200);
  for (const d of unack) {
    const text = `“${d.violation?.title ?? "A case"}” was sent to ${d.station?.name ?? "a station"} over ${SLA_HOURS.acknowledge} hours ago and hasn't been accepted.`;
    const meta = { kind: "dispatch_unacknowledged", violationId: String(d.violation?._id), stationId: String(d.station?._id) };
    await notifyHq({ title: "Dispatch not acknowledged", message: text, meta });
    await notifyStation(d.station?._id, { title: "Case waiting for your station", message: text, meta });
    d.slaAlerts.unacknowledgedAt = new Date(now);
    await d.save();
    alerts++;
  }

  const overdue = await Dispatch.find({ ...f.overdue, "slaAlerts.overdueAt": null })
    .populate("violation", "title")
    .populate("station", "name")
    .limit(200);
  for (const d of overdue) {
    const text = `No action on “${d.violation?.title ?? "a case"}” at ${d.station?.name ?? "a station"} for over ${SLA_HOURS.act} hours.`;
    const meta = { kind: "dispatch_overdue", violationId: String(d.violation?._id), stationId: String(d.station?._id) };
    await notifyHq({ title: "Case overdue", message: text, meta });
    await notifyStation(d.station?._id, { title: "Case overdue", message: text, meta });
    d.slaAlerts.overdueAt = new Date(now);
    await d.save();
    alerts++;
  }

  return alerts;
}
