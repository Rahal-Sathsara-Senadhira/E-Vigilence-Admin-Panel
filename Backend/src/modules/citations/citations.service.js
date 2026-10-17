import Citation from "../../db/providers/mongo/models/Citation.js";
import Counter from "../../db/providers/mongo/models/Counter.js";
import ViolationCatalogEntry from "../../db/providers/mongo/models/ViolationCatalogEntry.js";
import { HttpError } from "../../utils/httpError.js";

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

// `violations` may be catalog ids or populated entries — always re-read from
// the catalog so the fine is the one in force at verification time.
async function loadCatalogEntries(violations) {
  const ids = (Array.isArray(violations) ? violations : []).map((x) => String(x?._id ?? x));
  if (ids.length === 0) return [];

  const docs = await ViolationCatalogEntry.find({ _id: { $in: ids } }).lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  return ids.map((id) => byId.get(id) || null);
}

// Verification issues a citation, so it is refused unless the fine can be
// worked out: at least one offence, every offence still in the catalog, and
// every one with a fine amount set. (Entries auto-created from free text —
// ingest / citizen sync — start with no fine until HQ sets one.)
export async function assertCitationCanBeIssued(violations) {
  const entries = await loadCatalogEntries(violations);

  if (entries.length === 0) {
    throw new HttpError(400, "A violation needs at least one offence before it can be verified");
  }
  if (entries.some((e) => !e)) {
    throw new HttpError(400, "One of this violation's offences no longer exists in the catalog");
  }

  const missing = entries.filter((e) => typeof e.fineAmount !== "number").map((e) => e.name);
  if (missing.length > 0) {
    throw new HttpError(
      400,
      `Set a fine amount in the Violation Catalog before verifying: ${missing.join(", ")}`
    );
  }

  return entries;
}

// Called whenever a Violation is set to "verified" — from
// violations.controller.js#update (HQ path) and dispatch.service.js's
// stationUpdateViolationForStation (station_admin path), the only two
// callers the workflow (violationWorkflow.js) allows to make that move.
// `violation` is the frontend-shaped violation object or a Mongoose doc —
// only `._id`/`.id` and `.violations` (ids or populated entries) are used.
//
// Every offence is fined: fineAmount is the sum of each catalog entry's
// fine, itemized in `lines`, copied at verification time.
//
// Idempotent: if the violation already has an active citation, that one is
// returned instead of issuing a second. Re-saving "verified" therefore also
// repairs a violation whose citation failed to be created the first time.
export async function createCitationForVerifiedViolation(violation, issuedByUserId) {
  const violationId = violation._id || violation.id;

  const existing = await findActiveCitationForViolation(violationId);
  if (existing) return existing;

  const entries = await assertCitationCanBeIssued(violation.violations);
  const lines = entries.map((e) => ({
    entry: e._id,
    name: e.name,
    legalCode: e.legalCode ?? null,
    fineAmount: e.fineAmount,
  }));
  const fineAmount = lines.reduce((sum, l) => sum + l.fineAmount, 0);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + DUE_DAYS);

  try {
    return await Citation.create({
      violation: violationId,
      citationNumber: await generateCitationNumber(),
      fineAmount,
      lines,
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
