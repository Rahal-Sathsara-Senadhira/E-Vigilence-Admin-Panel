import mongoose from "mongoose";
import ViolationCatalogEntry from "../db/providers/mongo/models/ViolationCatalogEntry.js";

// Single place that turns "whatever the caller sent for violations[]" into
// real ViolationCatalogEntry documents — used by violations.controller.js
// (the frontend already sends catalog IDs, picked from the catalog), the
// citizen-report sync (sends free-text issueType), and the one-off legacy
// data migration (sends the old free-text strings). Each distinct name only
// gets resolved/created once; a batch of duplicate names in the same call
// only hits the DB once per unique name.
//
// - A value that's already a valid ObjectId AND matches an existing entry is
//   used as-is.
// - Anything else is treated as a name: case-insensitive exact match reuses
//   an existing entry; no match creates a new one (fineAmount left null —
//   HQ fills it in via the Violation Catalog page).
//
// Returns the resolved entries' ObjectIds, in the same order as input,
// de-duplicated.
export async function resolveCatalogEntries(items) {
  const list = Array.isArray(items) ? items : [items];
  const trimmed = list.map((v) => String(v ?? "").trim()).filter(Boolean);

  if (trimmed.length === 0) return [];

  const resolvedIds = [];
  const seen = new Set();

  for (const raw of trimmed) {
    let entry = null;

    if (mongoose.Types.ObjectId.isValid(raw)) {
      entry = await ViolationCatalogEntry.findById(raw).lean();
    }

    if (!entry) {
      entry = await ViolationCatalogEntry.findOne({
        name: { $regex: `^${escapeRegex(raw)}$`, $options: "i" },
      }).lean();
    }

    if (!entry) {
      entry = await ViolationCatalogEntry.create({ name: raw });
      entry = entry.toObject();
    }

    const id = String(entry._id);
    if (!seen.has(id)) {
      seen.add(id);
      resolvedIds.push(entry._id);
    }
  }

  return resolvedIds;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
