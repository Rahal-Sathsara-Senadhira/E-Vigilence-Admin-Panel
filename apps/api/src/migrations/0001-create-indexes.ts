// Creates the indexes declared on every model. In production the API doesn't
// build indexes on start-up (autoIndex off), so they arrive through here.
//
// Only creates: it never drops an index, because some collections (users,
// policestations) are shared with the old system and the mobile app, whose
// indexes must stay.

import type { Migration } from "./migration";

export const createIndexes: Migration = {
  id: "0001-create-indexes",
  description: "Create the indexes declared on every model (never drops any)",
  // New models arrive with every phase, so this runs each time.
  repeatable: true,
  async run({ conn, apply, log }) {
    let changed = 0;
    const details: Record<string, number> = {};

    for (const name of conn.modelNames()) {
      const model = conn.model(name);
      const { toCreate } = await model.diffIndexes();
      if (toCreate.length === 0) continue;
      details[model.collection.collectionName] = toCreate.length;
      changed += toCreate.length;
      log(`${model.collection.collectionName}: ${toCreate.length} index(es) to create`);
      if (apply) await model.createIndexes();
    }
    return { changed, details };
  },
};
