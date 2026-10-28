// The shape of a case in responses.

const iso = (/** @type {any} */ d) => (d ? new Date(d).toISOString() : null);

/**
 * The next deadline on the case, for the clock on screens (docs/03 §5.3,
 * docs/09). Fixed when the step started.
 * @param {any} c
 * @returns {{ kind: "accept" | "assign_officer" | "start_work" | "recommend" | "decide", at: string } | null}
 */
export function nextDeadline(c) {
  const d = c.dispatches?.at(-1);
  if (c.status === "recommended" && c.decideBy)
    return { kind: "decide", at: iso(c.decideBy) ?? "" };
  if (c.status === "dispatched" && d?.acceptBy)
    return { kind: "accept", at: iso(d.acceptBy) ?? "" };
  if (c.status === "accepted" && !c.investigatingOfficer && c.assignOfficerBy)
    return { kind: "assign_officer", at: iso(c.assignOfficerBy) ?? "" };
  if (c.status === "accepted" && !c.workStartedAt && d?.workBy)
    return { kind: "start_work", at: iso(d.workBy) ?? "" };
  if (["accepted", "investigating"].includes(c.status) && c.recommendBy)
    return { kind: "recommend", at: iso(c.recommendBy) ?? "" };
  return null;
}

/** A person on a case: their name only for roles that may see people. @param {any} p @param {boolean} show */
const person = (p, show) => ({
  id: show && p.id ? String(p.id) : null,
  name: show ? p.name : "Recorded",
});

/** A recommended or decided outcome. @param {any} o @param {boolean} showPeople */
const outcomeView = (o, showPeople) => ({
  outcome: o.outcome,
  offenceCodes: o.offenceCodes ?? [],
  addressee: o.addressee ?? null,
  addresseePerson: o.addresseePerson ? person(o.addresseePerson, showPeople) : null,
  driverUnknownReason: o.driverUnknownReason ?? null,
  prosecutionSummary: o.prosecutionSummary ?? null,
  nfaReason: o.nfaReason ?? null,
  justification: o.justification,
  by: o.by.name,
  byRole: o.by.role,
  at: iso(o.at),
  sentBack: o.sentBackAt
    ? { at: iso(o.sentBackAt), by: o.sentBackBy, reason: o.sentBackReason }
    : null,
});

/** @param {any} c @param {Map<string, string>} names */
export const caseRowView = (c, names) => {
  const d = c.dispatches?.at(-1);
  return {
    id: String(c._id),
    caseNumber: c.caseNumber,
    status: c.status,
    priority: c.priority,
    station: c.stationId
      ? { id: String(c.stationId), name: names.get(String(c.stationId)) ?? null }
      : null,
    vehicleNumber: c.facts.vehicleNumber ?? null,
    plateUnknown: Boolean(c.facts.plateUnknown),
    offenceCodes: c.facts.offenceCodes ?? [],
    address: c.facts.address ?? null,
    occurredAt: iso(c.facts.occurredAt),
    openedAt: iso(c.createdAt),
    investigatingOfficer: c.investigatingOfficer?.name ?? null,
    disputed: Boolean(c.disputed),
    returnCount: c.returnCount ?? 0,
    warnings: d && !d.endedAt ? (d.warnings ?? []) : [],
    deadline: nextDeadline(c),
  };
};

/**
 * @param {any} c
 * @param {{ names: Map<string, string>, officerActive: boolean,
 *   reports: (Omit<import("./cases.service.js").ReportSummary, "evidenceIds"> & { evidence: any[] })[],
 *   evidence: any[], vehicleFlags: string[],
 *   showPeople: boolean, can: object, readiness: Record<string, string[]> | null,
 *   repeatOffender: { vehicle: number, person: number } | null }} extra
 */
export const caseView = (
  c,
  {
    names,
    officerActive,
    reports,
    evidence,
    vehicleFlags,
    showPeople,
    can,
    readiness,
    repeatOffender,
  },
) => ({
  ...caseRowView(c, names),
  facts: {
    offenceCodes: c.facts.offenceCodes ?? [],
    vehicleNumber: c.facts.vehicleNumber ?? null,
    plateUnknown: Boolean(c.facts.plateUnknown),
    vehicleType: c.facts.vehicleType ?? null,
    location: c.facts.location?.coordinates
      ? { lat: c.facts.location.coordinates[1], lng: c.facts.location.coordinates[0] }
      : null,
    address: c.facts.address ?? null,
    occurredAt: iso(c.facts.occurredAt),
  },
  officer: c.investigatingOfficer
    ? {
        id: String(c.investigatingOfficer.id),
        name: c.investigatingOfficer.name,
        active: officerActive,
      }
    : null,
  workStartedAt: iso(c.workStartedAt),
  noEvidenceReason: c.noEvidenceReason ?? null,
  openedBy: c.openedBy?.name ?? null,
  closedReason: c.closedReason ?? null,
  reports,
  investigation: {
    vehicle: c.vehicle
      ? { id: String(c.vehicle.id), plate: c.vehicle.plate, flags: vehicleFlags }
      : null,
    owner: c.owner ? person(c.owner, showPeople) : null,
    driver: c.driver
      ? { ...person(c.driver, showPeople), basis: c.driver.basis, note: c.driver.note ?? null }
      : null,
    review: c.review
      ? {
          plateReadable: c.review.plateReadable,
          vehicleMatches: c.review.vehicleMatches,
          timePlaceConsistent: c.review.timePlaceConsistent,
          noEditing: c.review.noEditing,
          offenceVisible: c.review.offenceVisible,
          note: c.review.note ?? null,
          by: c.review.by,
          at: iso(c.review.at),
        }
      : null,
    statements: (c.statements ?? []).map((/** @type {any} */ s) => ({
      role: s.role,
      ...person({ id: s.personId, name: s.name }, showPeople),
      takenAt: iso(s.takenAt),
      summary: s.summary,
      evidenceId: s.evidenceId ? String(s.evidenceId) : null,
      by: s.by,
      at: iso(s.at),
    })),
    evidence,
  },
  recommendation: c.recommendations?.length
    ? outcomeView(c.recommendations.at(-1), showPeople)
    : null,
  decision: c.decision
    ? {
        ...outcomeView(c.decision.outcome, showPeople),
        kind: c.decision.kind,
        reason: c.decision.reason ?? null,
        level: c.decision.level,
        decidedBy: c.decision.by.name,
        decidedAt: iso(c.decision.at),
      }
    : null,
  overriddenDecisions: (c.decisions ?? [])
    .filter((/** @type {any} */ d) => d.overriddenAt)
    .map((/** @type {any} */ d) => ({
      outcome: d.outcome.outcome,
      decidedBy: d.by.name,
      overriddenAt: iso(d.overriddenAt),
      overriddenBy: d.overriddenBy,
      reason: d.overrideReason,
    })),
  mergedInto: c.mergedInto
    ? { id: String(c.mergedInto.id), caseNumber: c.mergedInto.caseNumber }
    : null,
  readiness,
  repeatOffender,
  dispatches: (c.dispatches ?? []).map((/** @type {any} */ d) => ({
    station: { id: String(d.stationId), name: d.stationName },
    method: d.method,
    at: iso(d.at),
    by: d.by,
    distanceKm: d.distanceKm ?? null,
    warnings: d.warnings ?? [],
    reason: d.reason ?? null,
    acceptBy: iso(d.acceptBy),
    acceptedAt: iso(d.acceptedAt),
    acceptedBy: d.acceptedBy ?? null,
    endedAt: iso(d.endedAt),
    endReason: d.endReason ?? null,
    endNote: d.endNote ?? null,
  })),
  notes: (c.notes ?? []).map((/** @type {any} */ n) => ({
    at: iso(n.at),
    by: n.by,
    side: n.side,
    text: n.text,
  })),
  timeline: (c.timeline ?? []).map((/** @type {any} */ e) => ({
    at: iso(e.at),
    event: e.event,
    by: e.by,
    note: e.note ?? null,
  })),
  can,
});
