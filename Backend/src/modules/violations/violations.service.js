import repo from "./violations.repository.js";
import { HttpError } from "../../utils/httpError.js";

export async function list(filters) {
  return repo.list(filters);
}

export async function getById(id) {
  const v = await repo.getById(id);
  if (!v) throw new HttpError(404, "Violation not found");
  return v;
}

export async function create(payload) {
  const { createdBy = null, createdByRole = null, ...violationPayload } = payload;

  const duplicateIds = await repo.findPossibleDuplicates({
    type: violationPayload.type,
    lat: violationPayload.location?.lat,
    lng: violationPayload.location?.lng,
  });

  const created = await repo.create({
    ...violationPayload,
    possibleDuplicateOf: duplicateIds,
    statusHistory: [
      {
        status: violationPayload.status,
        changedBy: createdBy,
        changedByRole: createdByRole,
        note: "Created",
        changedAt: new Date(),
      },
    ],
  });

  return { ...created, duplicateWarning: duplicateIds.length > 0 };
}

export async function update(id, patch, historyEntry = null) {
  const updated = await repo.update(id, patch, historyEntry);
  if (!updated) throw new HttpError(404, "Violation not found");
  return updated;
}

export async function remove(id) {
  const ok = await repo.remove(id);
  if (!ok) throw new HttpError(404, "Violation not found");
  return true;
}
