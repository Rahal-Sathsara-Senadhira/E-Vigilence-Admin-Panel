// Words shown for payment codes — docs/07.

export const METHOD_LABELS = {
  sim_card: "Online — card (test mode)",
  sim_wallet: "Online — mobile wallet (test mode)",
  receipt_cash_agent: "Receipt — cash agent",
  receipt_post_office: "Receipt — post office",
  receipt_bank: "Receipt — bank",
};

export const PAYMENT_STATUS = {
  pending: ["Pending", "warning"],
  succeeded: ["Received", "success"],
  failed: ["Failed", "neutral"],
  reversed: ["Reversed", "danger"],
};

export const FLAG_LABELS = {
  double_payment: "Paid twice",
  notice_not_payable: "Notice no longer payable",
  bad_amount: "Wrong amount",
};

/** Rupees as "Rs. 3,500". @param {number | null | undefined} n */
export const rupees = (n) =>
  n === null || n === undefined ? "—" : `Rs. ${n.toLocaleString("en-LK")}`;
