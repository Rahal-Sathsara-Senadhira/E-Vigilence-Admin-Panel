// Words shown for case codes — docs/03.

export const CASE_STATUS_LABELS = {
  open: "Not dispatched",
  dispatched: "Waiting for the station",
  accepted: "Accepted",
  investigating: "Investigating",
  recommended: "Waiting for decision",
  decided: "Decided",
  closed: "Closed",
  returned: "Returned to HQ",
};

/** Badge tone per state family (docs/03 §4: new · progress · waiting · good · problem). */
export const CASE_STATUS_TONES = /** @type {const} */ ({
  open: "action",
  dispatched: "action",
  accepted: "success",
  investigating: "success",
  recommended: "warning",
  decided: "success",
  closed: "neutral",
  returned: "danger",
});

/** The main path of a case, for the lifecycle bar. */
export const LIFECYCLE = [
  ["open", "Opened"],
  ["dispatched", "Dispatched"],
  ["accepted", "Accepted"],
  ["investigating", "Investigating"],
  ["recommended", "Recommended"],
  ["decided", "Decided"],
  ["closed", "Closed"],
];

export const DISPATCH_METHODS = {
  jurisdiction: "Station's area",
  nearest: "Nearest station",
  manual: "Chosen by HQ",
  station_recorded: "Recorded at the station",
};

export const DISPATCH_WARNINGS = {
  overlapping_areas: "Station areas overlap here",
  unverified_station: "Station not yet verified",
  no_active_officers: "No active officers at the station",
  disputed_jurisdiction: "Disputed jurisdiction",
};

export const DEADLINES = {
  accept: "Accept by",
  assign_officer: "Assign an officer by",
  start_work: "Start work by",
  recommend: "Recommend by",
  decide: "Decide by",
};

export const TIMELINE_EVENTS = {
  opened: "Opened",
  dispatched: "Dispatched",
  accepted: "Accepted",
  returned: "Returned to HQ",
  disputed: "Disputed jurisdiction",
  officer_assigned: "Officer assigned",
  investigating: "Work started",
  report_merged: "Report added",
  report_added_closed: "Report added (case closed)",
  report_removed: "Report removed",
  closed: "Closed",
  vehicle_traced: "Vehicle traced",
  plate_corrected: "Plate corrected",
  driver_set: "Driver identified",
  evidence_reviewed: "Evidence reviewed",
  statement_added: "Statement added",
  evidence_added: "Evidence added",
  offences_corrected: "Offences corrected",
  recommended: "Recommended",
  sent_back: "Sent back",
  decided: "Decided",
  decision_overridden: "Decision overridden",
  reopened: "Reopened",
  merged: "Merged into another case",
  case_merged_in: "Another case merged in",
};

/** docs/05 §3. */
export const OUTCOME_LABELS = {
  penalty_notice: "Penalty notice",
  court: "Court referral",
  warning: "Warning",
  no_further_action: "No further action",
};

/** docs/05 §8. */
export const NFA_LABELS = {
  owner_not_traced: "Vehicle or owner couldn't be identified",
  insufficient_evidence: "Evidence doesn't prove the offence",
  false_plate: "Plate doesn't belong to the vehicle in the evidence",
  not_an_offence: "On review, no offence was committed",
  offender_unavailable: "Abroad, deceased or otherwise unreachable",
  other: "Other (explain below)",
};

/** Who decided (S2). */
export const DECIDER_LEVELS = { oic: "OIC", division: "Division supervisor", hq: "HQ supervisor" };
