// Words shown for notice codes — docs/05 §6.

export const NOTICE_STATUS_LABELS = {
  issued: "To be posted",
  served: "Served",
  service_failed: "Service failed",
  nominated: "Driver named",
  transferred: "Transferred to driver",
  disputed: "Disputed",
  overdue: "Overdue",
  court_referral: "Referred to court",
  paid: "Paid",
  withdrawn: "Withdrawn",
  closed: "Delivered",
};

/** Badge tone per state family (docs/05 §6: new · waiting · problem · legal · good · closed). */
export const NOTICE_STATUS_TONES = /** @type {const} */ ({
  issued: "action",
  served: "action",
  service_failed: "danger",
  nominated: "warning",
  transferred: "neutral",
  disputed: "warning",
  overdue: "danger",
  court_referral: "warning",
  paid: "success",
  withdrawn: "neutral",
  closed: "success",
});

export const NEXT_DATES = {
  post: "Post by",
  reserve: "Re-serve by",
  due: "Due",
  final: "Final date",
  review: "Review dispute by",
};

export const NOTICE_EVENTS = {
  issued: "Issued",
  posted: "Posted",
  service_failed: "Service failed",
  readdressed: "New address",
  overdue: "Overdue — reminder sent",
  court_proposed: "Court referral proposed",
  court_referral: "Referred to court",
  withdrawn: "Withdrawn",
  nominated: "Driver named",
  nomination_rejected: "Named driver rejected",
  transferred: "Transferred to the driver",
  disputed: "Disputed",
  dispute_rejected: "Dispute rejected",
  paid: "Paid",
  payment_reversed: "Payment reversed",
};

/** docs/05 §6.3. */
export const DISPUTE_GROUNDS = {
  not_my_vehicle: "Not my vehicle, or a false plate",
  sold_or_stolen: "The vehicle was sold or stolen at the time",
  evidence_wrong: "The evidence is wrong",
  other: "Other",
};

/** Rupees as "Rs. 3,500". @param {number | null} n */
export const rupees = (n) => (n === null ? "—" : `Rs. ${n.toLocaleString("en-LK")}`);
