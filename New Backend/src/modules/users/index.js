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

/** Roles that can take a case at a station and work it (docs/03 §6). */
export const CASE_OFFICER_ROLES = ["traffic_officer", "station_oic"];

/**
 * Active officers who can investigate cases at a station.
 * @param {mongoose.Types.ObjectId | string} stationId
 * @returns {Promise<{ id: string, name: string, role: string, serviceNumber: string | null }[]>}
 */
export async function caseOfficersAt(stationId) {
  const rows = await User.find(
    {
      stationId: new mongoose.Types.ObjectId(String(stationId)),
      isActive: true,
      role: { $in: CASE_OFFICER_ROLES },
    },
    { name: 1, role: 1, serviceNumber: 1 },
  )
    .sort({ name: 1 })
    .lean();
  return rows.map((u) => ({
    id: String(u._id),
    name: u.name,
    role: u.role,
    serviceNumber: u.serviceNumber ?? null,
  }));
}

/**
 * Ids of active case officers at these stations (all stations when null),
 * to find cases whose officer has left or been deactivated (docs/03 §6).
 * @param {any[] | null} stationIds
 */
export async function activeCaseOfficerIds(stationIds) {
  return User.find({
    isActive: true,
    role: { $in: CASE_OFFICER_ROLES },
    ...(stationIds ? { stationId: { $in: stationIds } } : { stationId: { $ne: null } }),
  }).distinct("_id");
}
