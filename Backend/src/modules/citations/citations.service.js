import Citation from "../../db/providers/mongo/models/Citation.js";
import Counter from "../../db/providers/mongo/models/Counter.js";

const DUE_DAYS = 30;

const ACTIVE = { voidedAt: { $exists: false } };

// Highest sequence already used for `prefix` — only consulted the first time
// a year's counter is created, so numbering continues after citations that
// were issued before the counter existed.
async function highestExistingSeq(prefix) {
  const latest = await Citation.findOne({ citationNumber: { $regex: `^${prefix}` } })
    .sort({ citationNumber: -1 })
    .select("citationNumber")
    .lean();

  const seq = latest ? Number(latest.citationNumber.slice(prefix.length)) : 0;
  return Number.isFinite(seq) ? seq : 0;
}

async function incrementCounter(key) {
  return Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { new: true }).lean();
}

async function generateCitationNumber() {
  const year = new Date().getFullYear();
  const prefix = `CIT-${year}-`;
  const key = `citation-${year}`;

  let counter = await incrementCounter(key);

  if (!counter) {
    try {
      await Counter.create({ _id: key, seq: await highestExistingSeq(prefix) });
    } catch (err) {
      if (err?.code !== 11000) throw err; // another request created it first
    }
    counter = await incrementCounter(key);
  }

  return `${prefix}${String(counter.seq).padStart(6, "0")}`;
}

export async function findActiveCitationForViolation(violationId) {
  return Citation.findOne({ violation: violationId, ...ACTIVE }).lean();
}

// Called whenever a Violation is set to "verified" — from
// violations.controller.js#update (HQ path) and dispatch.service.js's
// stationUpdateViolationForStation (station_admin path), the only two
// callers the workflow (violationWorkflow.js) allows to make that move.
// `violation` is the populated, frontend-shaped violation object (or a
// Mongoose doc — either works, both expose `.violations` as an array of
// catalog entries and `._id`/`.id`).
//
// Idempotent: if the violation already has an active citation, that one is
// returned instead of issuing a second. Re-saving "verified" therefore also
// repairs a violation whose citation failed to be created the first time.
export async function createCitationForVerifiedViolation(violation, issuedByUserId) {
  const violationId = violation._id || violation.id;

  const existing = await findActiveCitationForViolation(violationId);
  if (existing) return existing;

  const primaryEntry = Array.isArray(violation.violations) ? violation.violations[0] : null;
  const fineAmount =
    primaryEntry && typeof primaryEntry === "object" ? primaryEntry.fineAmount ?? null : null;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + DUE_DAYS);

  try {
    return await Citation.create({
      violation: violationId,
      citationNumber: await generateCitationNumber(),
      fineAmount,
      dueDate,
      issuedBy: issuedByUserId ? String(issuedByUserId) : null,
    });
  } catch (err) {
    // Lost a race with a concurrent verify — the partial unique index on
    // `violation` kept it to one; return the winner's citation.
    if (err?.code === 11000 && err.keyPattern?.violation) {
      return findActiveCitationForViolation(violationId);
    }
    throw err;
  }
}

// Voids every active citation for a violation — used when HQ overturns a
// verification (verified → rejected) or deletes the violation, so a fine
// never outlives the finding it was issued for. The previous payment status
// is kept so a voided-after-payment citation can be followed up for a refund.
export async function voidCitationsForViolation(violationId, { reason, userId = null }) {
  const active = await Citation.find({ violation: violationId, ...ACTIVE })
    .select("_id paymentStatus")
    .lean();

  for (const c of active) {
    await Citation.updateOne(
      { _id: c._id, ...ACTIVE },
      {
        $set: {
          paymentStatus: "void",
          paymentStatusBeforeVoid: c.paymentStatus,
          voidedAt: new Date(),
          voidReason: reason || null,
          voidedBy: userId ? String(userId) : null,
        },
      }
    );
  }

  return active.length;
}
