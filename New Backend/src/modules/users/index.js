// What other modules may use from staff accounts (docs/19 §4.2 rule 2).

import mongoose from "mongoose";
import { roleInfo } from "#src/core/access/roles.js";
import { User } from "./user.model.js";

/**
 * Active staff at a station, counted by role.
 * @param {mongoose.Types.ObjectId | string} stationId
 * @returns {Promise<{ role: string, label: string, count: number }[]>}
 */
export async function activeStaffByRole(stationId) {
  const rows = await User.aggregate([
    { $match: { stationId: new mongoose.Types.ObjectId(String(stationId)), isActive: true } },
    { $group: { _id: "$role", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({
    role: r._id,
    label: roleInfo(r._id).label,
    count: r.count,
  }));
}

/** Display name of an account, or null. @param {any} userId */
export async function nameOf(userId) {
  if (!userId) return null;
  const u = await User.findById(userId, { name: 1 }).lean();
  return u?.name ?? null;
}
