// Words and badge tones for citizen rewards (docs/16).

export const STATUS = {
  pending: ["Pending", "neutral"],
  confirmed: ["Confirmed", "success"],
  paid: ["Paid out", "action"],
  reversed: ["Reversed", "danger"],
  expired: ["Expired", "neutral"],
  not_eligible: ["Not eligible", "neutral"],
};

export const VIEWS = [
  ["held", "Held for review"],
  ["pending", "Pending"],
  ["confirmed", "Confirmed"],
  ["paid", "Paid out"],
  ["reversed", "Reversed"],
  ["not_eligible", "Not eligible"],
  ["expired", "Expired"],
  ["all", "All rewards"],
];

/** "Lead report", "Added evidence", "Duplicate" — the share of D16-6. @param {number} share */
export const shareLabel = (share) =>
  share === 100 ? "Lead report" : share > 0 ? `Added evidence (${share}%)` : "Duplicate";

/** "1,250 points" @param {number} n */
export const points = (n) =>
  `${n.toLocaleString("en-LK")} ${Math.abs(n) === 1 ? "point" : "points"}`;

export const PAYOUT_STATUS = {
  requested: ["Waiting", "warning"],
  batched: ["In a batch", "action"],
  paid: ["Paid", "success"],
  failed: ["Failed", "danger"],
  rejected: ["Rejected", "neutral"],
};

export const BATCH_STATUS = {
  prepared: ["Waiting for approval", "warning"],
  approved: ["Approved", "success"],
  cancelled: ["Cancelled", "neutral"],
};

/** "Rs 12,500" @param {number} n */
export const rupees = (n) => `Rs ${n.toLocaleString("en-LK")}`;
