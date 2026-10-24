// One written definition per figure (docs/12 §6, D4). The dashboard shows
// each in a tooltip; the management reports (N9 slice 2) use the same ones,
// so a report always matches the dashboard (D12-7).

export const DEFINITIONS = {
  // Needs attention — counted whenever the work started (§5).
  triage_waiting: "Reports waiting for HQ triage now.",
  p1_waiting: "P1 reports (injury or immediate danger) not yet triaged.",
  not_accepted: "Cases sent to a station and not accepted within the time limit.",
  returned: "Cases a station sent back, waiting for HQ to choose another station.",
  escalated: "Missed time limits now past twice their limit — escalated to HQ (docs/09 T4).",
  money_waiting:
    "Recorded receipts to review, refunds to approve and reward payout requests waiting for a batch.",
  to_accept: "Cases sent to this station and not yet accepted.",
  needs_officer: "Accepted cases with no active investigating officer.",
  to_decide: "Recommendations waiting for this station's decision.",
  disputes: "Notices disputed by the addressee, waiting for review.",
  to_post: "Notices issued and not yet posted.",
  court_this_week: "Court cases to prepare or file, or with a hearing, within the next 7 days.",
  my_cases: "Open cases where you are the investigating officer.",
  my_overdue: "Your cases past their recommendation or first-work time limit.",
  my_hearings: "Hearings in the next 7 days where you prosecute.",
  sent_back: "Your recommendations the decider sent back, waiting for you.",
  service_failed: "Notices returned by post, waiting to be served again.",
  outbox: "Letters waiting to be printed and posted.",
  court_to_prepare: "Court referrals waiting to be prepared for filing.",

  // Throughput — in the period, compared with the one before (§6).
  received: "Reports whose time received is in the period, from every channel.",
  triaged: "Reports whose triage decision is in the period.",
  cases_opened: "Cases opened from accepted reports in the period.",
  accepted: "Dispatches this station accepted in the period.",
  decided: "Cases decided (by the OIC, division or HQ) in the period.",
  notices_issued: "Penalty notices and warnings issued in the period.",
  notices_paid: "Notices paid in the period; refunded payments aren't counted.",
  court_filed: "Court cases filed in the period.",
  court_outcomes: "Court cases with a verdict recorded in the period.",
  collected:
    "Recorded receipts confirmed in the period, less refunds. Online payments are the simulator's and are shown separately as TEST (D12-6).",
  rewards_confirmed: "Reward points confirmed in the period (docs/16).",

  // Charts and tables.
  reports_by_channel: "Reports received each day by channel; officer reports are under Other.",
  triage_outcome:
    "Reports triaged in the period by result; needing information counts reports asked a question in the period.",
  pipeline: "Cases in each state now, in workflow order.",
  top_offences: "The offences on cases opened in the period, most frequent first.",
  stations:
    "Per station: open cases; dispatches in the period accepted on time; median days from acceptance to decision; notices issued in the period that are paid; missed time limits now.",
  officers: "Per officer at this station: open cases, and those past a time limit.",
  overdue_list: "Missed time limits still open, oldest first.",
  returned_list: "The latest cases returned to HQ.",
};

/** @typedef {keyof typeof DEFINITIONS} FigureKey */
