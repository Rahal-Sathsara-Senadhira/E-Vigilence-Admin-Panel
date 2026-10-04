import Citation from "../../db/providers/mongo/models/Citation.js";

const DUE_DAYS = 30;

async function generateCitationNumber() {
  const year = new Date().getFullYear();
  const prefix = `CIT-${year}-`;
  const count = await Citation.countDocuments({
    citationNumber: { $regex: `^${prefix}` },
  });
  const seq = String(count + 1).padStart(6, "0");
  return `${prefix}${seq}`;
}

// Called the moment a Violation transitions to "verified" — from
// violations.controller.js#update (HQ path) and dispatch.service.js's
// stationUpdateViolationForStation (station_admin path), the only two
// callers the workflow (violationWorkflow.js) allows to make that move.
// `violation` is the populated, frontend-shaped violation object (or a
// Mongoose doc — either works, both expose `.violations` as an array of
// catalog entries and `._id`/`.id`).
export async function createCitationForVerifiedViolation(violation, issuedByUserId) {
  const primaryEntry = Array.isArray(violation.violations) ? violation.violations[0] : null;
  const fineAmount =
    primaryEntry && typeof primaryEntry === "object" ? primaryEntry.fineAmount ?? null : null;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + DUE_DAYS);

  const citationNumber = await generateCitationNumber();

  return Citation.create({
    violation: violation._id || violation.id,
    citationNumber,
    fineAmount,
    dueDate,
    issuedBy: issuedByUserId ? String(issuedByUserId) : null,
  });
}
