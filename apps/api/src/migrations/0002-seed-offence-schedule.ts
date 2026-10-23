// Version 1 of the offence schedule (Gazette 2054/9 and Act No. 10 of 2019),
// then the mobile app's public copy. Adds only offences that don't exist yet.

import { publishPublicSchedule, seedOffenceSchedule } from "../modules/offences/schedule.data";
import type { Migration } from "./migration";

export const seedOffences: Migration = {
  id: "0002-seed-offence-schedule",
  description: "Seed the offence schedule and publish the mobile app's copy",
  async run({ conn, apply, log }) {
    const added = await seedOffenceSchedule(conn, apply);
    log(`${added} offence(s) ${apply ? "added" : "to add"}`);
    const published = apply ? await publishPublicSchedule(conn) : 0;
    if (apply) log(`${published} offence(s) published to the mobile app`);
    return { changed: added, details: { added, published } };
  },
};
