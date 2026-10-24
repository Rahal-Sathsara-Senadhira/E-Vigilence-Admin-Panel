// Sending a notification: who receives it, once-only keys, and grouping
// (docs/09 §6). Always inside the caller's transaction, so a notification
// exists exactly when the change it reports does.

import { Station } from "../organisation/organisation.model.js";
import { User } from "../users/user.model.js";
import { Notification } from "./notification.model.js";

/** D09-7: more than this many similar alerts in an hour become one summary. */
export const GROUP_AFTER = 10;
const HOUR = 3_600_000;

/** @typedef {import("#src/core/access/roles.js").Role} Role */
/**
 * Who receives a notification — resolved to active accounts when sent.
 * @typedef {(
 *   | { user: any }
 *   | { station: any, roles: Role[] }
 *   | { divisionOf: any }
 *   | { national: Role[] }
 * )} Target
 */

/**
 * @typedef {object} Message
 * @property {string} kind      similar alerts share a kind (grouping)
 * @property {"info" | "warning" | "danger"} [level]
 * @property {string} title
 * @property {string | null} [body]
 * @property {string | null} [link]
 * @property {string} [key]     sent once per person; never grouped
 * @property {string} [group]   the summary's title when grouped (default: the title)
 */

/**
 * Active accounts for the targets. `divisionOf` is the division supervisors
 * over a station (T4).
 * @param {Target[]} targets @param {import("mongoose").ClientSession | null} session
 */
export async function recipients(targets, session) {
  /** @type {any[]} */
  const ids = [];
  /** @type {object[]} */
  const or = [];
  for (const t of targets) {
    if ("user" in t) {
      if (t.user) ids.push(t.user);
    } else if ("station" in t) {
      if (t.station) or.push({ stationId: t.station, role: { $in: t.roles } });
    } else if ("divisionOf" in t) {
      if (!t.divisionOf) continue;
      const s = await Station.findById(t.divisionOf, { divisionId: 1 }, { session }).lean();
      if (s?.divisionId) or.push({ divisionId: s.divisionId, role: "division_supervisor" });
    } else {
      or.push({ role: { $in: t.national } });
    }
  }
  if (ids.length) or.push({ _id: { $in: ids } });
  if (or.length === 0) return [];
  const users = await User.find({ $or: or, isActive: true }, { _id: 1 }, { session }).lean();
  return users.map((u) => String(u._id));
}

/**
 * Sends `message` to everyone the targets name, except the person who
 * caused it. Returns how many received it.
 * @param {import("mongoose").ClientSession} session @param {Target[]} targets @param {Message} message
 * @param {{ except?: any, now?: Date }} [options]
 */
export async function notify(session, targets, message, { except = null, now = new Date() } = {}) {
  const userIds = (await recipients(targets, session)).filter((id) => id !== String(except));
  for (const userId of userIds) await deliver(session, userId, message, now);
  return userIds.length;
}

/** @param {import("mongoose").ClientSession} session @param {string} userId @param {Message} m @param {Date} now */
async function deliver(session, userId, m, now) {
  const fields = {
    kind: m.kind,
    level: m.level ?? "info",
    title: m.title,
    body: m.body ?? null,
    link: m.link ?? null,
  };
  if (m.key) {
    // Read first: a duplicate-key error would abort the whole transaction.
    if (await Notification.exists({ userId, key: m.key }).session(session)) return;
    await Notification.create([{ userId, ...fields, key: m.key }], { session });
    return;
  }
  const since = new Date(now.getTime() - HOUR);
  const recent = await Notification.countDocuments({
    userId,
    kind: m.kind,
    grouped: false,
    createdAt: { $gte: since },
  }).session(session);
  if (recent < GROUP_AFTER) {
    await Notification.create([{ userId, ...fields }], { session });
    return;
  }
  const summary = await Notification.findOneAndUpdate(
    { userId, kind: m.kind, grouped: true, createdAt: { $gte: since } },
    { $inc: { count: 1 }, $set: { readAt: null } },
    { session },
  );
  if (!summary) {
    await Notification.create(
      [{ userId, ...fields, title: m.group ?? m.title, body: null, link: null, grouped: true }],
      { session },
    );
  }
}
