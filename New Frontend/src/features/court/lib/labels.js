// Words shown for court codes — docs/06.

export const COURT_STATUS = {
  referred: ["To prepare", "action"],
  prepared: ["Waiting for approval", "warning"],
  approved: ["Approved — to file", "action"],
  filed: ["Filed", "success"],
  hearing: ["At hearing", "success"],
  verdict: ["Verdict — to confirm", "warning"],
  closed: ["Closed", "neutral"],
  withdrawn: ["Withdrawn", "neutral"],
};

export const ROUTES = {
  court_offence: "Court-only offence or court decision",
  unpaid_notice: "Unpaid penalty notice",
  unserved_notice: "Notice that couldn't be served",
};

export const HEARING_OUTCOMES = {
  postponed: "Postponed",
  heard: "Heard — continues",
  warrant_issued: "Accused absent — warrant issued",
  guilty_plea: "Guilty plea (convicted)",
};

export const VERDICTS = {
  convicted: "Convicted",
  acquitted: "Acquitted",
  withdrawn: "Withdrawn by the prosecution",
  discharged: "Discharged",
};

export const NEXT = { prepare: "Prepare by", file: "File by", hearing: "Next hearing" };
