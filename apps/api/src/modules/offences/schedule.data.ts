// Seeding and publishing the schedule — used by migration 0002 and by the
// service after every change.

import type { Connection, Model } from "mongoose";
import { OffenceVersion, PublicOffenceDoc } from "./offence.schema";
import { SCHEDULE_SOURCE, SEED_OFFENCES } from "./schedule.seed";

function models(conn: Connection) {
  return {
    versions: conn.model(OffenceVersion.name) as Model<OffenceVersion>,
    publicCopy: conn.model(PublicOffenceDoc.name) as Model<PublicOffenceDoc>,
  };
}

/** Adds version 1 of every seed offence that doesn't exist yet. Returns how many it would add or added. */
export async function seedOffenceSchedule(conn: Connection, apply: boolean): Promise<number> {
  const { versions } = models(conn);
  const existing = new Set(await versions.distinct("code"));
  const missing = SEED_OFFENCES.filter((o) => !existing.has(o.code));
  if (apply && missing.length > 0) {
    const now = new Date();
    await versions.insertMany(
      missing.map((o) => ({
        ...o,
        version: 1,
        demeritPoints: null,
        active: true,
        effectiveFrom: now,
        effectiveTo: null,
        current: true,
        source: SCHEDULE_SOURCE,
        changedBy: "seed",
        reason: "Initial schedule",
      })),
    );
  }
  return missing.length;
}

/**
 * Rewrites the mobile app's copy from the current schedule: active,
 * citizen-reportable offences only, with public names and descriptions.
 * Returns how many offences are published.
 */
export async function publishPublicSchedule(conn: Connection): Promise<number> {
  const { versions, publicCopy } = models(conn);
  const current = await versions
    .find({ current: true, active: true, citizenReportable: true })
    .sort({ severity: -1, publicName: 1 })
    .lean();
  const now = new Date();

  await publicCopy.bulkWrite([
    ...current.map((o, i) => ({
      updateOne: {
        filter: { code: o.code },
        update: {
          $set: {
            name: o.publicName,
            description: o.publicDescription,
            vehicleTypes: o.vehicleTypes,
            sortOrder: i,
            publishedAt: now,
          },
        },
        upsert: true,
      },
    })),
    { deleteMany: { filter: { code: { $nin: current.map((o) => o.code) } } } },
  ]);
  return current.length;
}
