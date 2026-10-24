// A person's notifications (the bell), and the time limits missed in their
// area — docs/09 §5, T3.

import mongoose from "mongoose";
import { roleInfo } from "#src/core/access/roles.js";
import { notFound } from "#src/core/errors.js";
import { Station } from "../organisation/organisation.model.js";
import { Breach, Notification } from "./notification.model.js";
import { GROUP_AFTER } from "./notify.js";

/** @typedef {NonNullable<import("express").Request["auth"]>} Actor */

/** @param {any} n */
const notificationView = (n) => ({
  id: String(n._id),
  kind: n.kind,
  level: n.level,
  title: n.grouped ? `${n.title} — ${n.count} more` : n.title,
  body: n.grouped
    ? `More than ${GROUP_AFTER} of these within an hour, so they are grouped here.`
    : n.body,
  link: n.link,
  grouped: n.grouped,
  read: Boolean(n.readAt),
  at: n.updatedAt,
});

/** @param {Actor} actor */
export const unreadCount = (actor) =>
  Notification.countDocuments({ userId: actor.userId, readAt: null });

/**
 * Newest first; a grouped summary rises when it grows.
 * @param {Actor} actor @param {{ unread?: boolean, page: number, pageSize: number }} query
 */
export async function listNotifications(actor, { unread, page, pageSize }) {
  const filter = { userId: actor.userId, ...(unread ? { readAt: null } : {}) };
  const [rows, total, unreadTotal] = await Promise.all([
    Notification.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Notification.countDocuments(filter),
    unreadCount(actor),
  ]);
  return { items: rows.map(notificationView), total, unread: unreadTotal, page, pageSize };
}

/** @param {Actor} actor @param {string} id */
export async function markRead(actor, id) {
  if (!mongoose.isValidObjectId(id)) throw notFound("Notification not found.");
  const r = await Notification.updateOne(
    { _id: id, userId: actor.userId, readAt: null },
    { $set: { readAt: new Date() } },
    { timestamps: false },
  );
  if (r.matchedCount === 0 && !(await Notification.exists({ _id: id, userId: actor.userId })))
    throw notFound("Notification not found.");
  return { unread: await unreadCount(actor) };
}

/** @param {Actor} actor */
export async function markAllRead(actor) {
  await Notification.updateMany(
    { userId: actor.userId, readAt: null },
    { $set: { readAt: new Date() } },
    { timestamps: false },
  );
  return { unread: 0 };
}

/**
 * Missed time limits still open in the person's area (T3): nationally for
 * HQ roles, their division's stations, or their own station. Items with no
 * station (reports at triage, HQ payments) are HQ's.
 * @param {Actor} actor @returns {Promise<Record<string, any>>}
 */
async function breachScope(actor) {
  const level = roleInfo(actor.role).level;
  if (level === "national") return {};
  if (level === "division") {
    const ids = await Station.distinct("_id", { divisionId: actor.divisionId });
    return { stationId: { $in: ids } };
  }
  return { stationId: actor.stationId };
}

/** @param {any} b @param {Date} now */
const breachView = (b, now) => ({
  id: String(b._id),
  limitKey: b.limitKey,
  label: b.label,
  item: { type: b.item.type, id: String(b.item.id), number: b.item.number },
  stationId: b.stationId ? String(b.stationId) : null,
  link: b.link,
  dueAt: b.dueAt,
  escalated: Boolean(b.escalatedAt),
  hoursOver: Math.floor((now.getTime() - b.dueAt.getTime()) / 3_600_000),
});

/**
 * Open breaches, longest overdue first, with a count per kind.
 * @param {Actor} actor @param {{ limitKey?: string, page: number, pageSize: number }} query
 */
export async function listOverdue(actor, { limitKey, page, pageSize }) {
  const scope = await breachScope(actor);
  /** @type {Record<string, any>} */
  const filter = { ...scope, resolvedAt: null, ...(limitKey ? { limitKey } : {}) };
  const [rows, total, byKind] = await Promise.all([
    Breach.find(filter)
      .sort({ dueAt: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Breach.countDocuments(filter),
    Breach.aggregate([
      { $match: { ...scope, resolvedAt: null } },
      {
        $group: {
          _id: "$limitKey",
          label: { $first: "$label" },
          count: { $sum: 1 },
          escalated: { $sum: { $cond: [{ $ne: ["$escalatedAt", null] }, 1, 0] } },
        },
      },
      { $sort: { count: -1 } },
    ]),
  ]);
  const stations = await Station.find(
    { _id: { $in: rows.map((b) => b.stationId).filter(Boolean) } },
    { name: 1 },
  ).lean();
  const names = new Map(stations.map((s) => [String(s._id), s.name]));
  const now = new Date();
  return {
    items: rows.map((b) => ({
      ...breachView(b, now),
      stationName: b.stationId ? (names.get(String(b.stationId)) ?? null) : null,
    })),
    kinds: byKind.map((k) => ({
      limitKey: k._id,
      label: k.label,
      count: k.count,
      escalated: k.escalated,
    })),
    total,
    page,
    pageSize,
  };
}
