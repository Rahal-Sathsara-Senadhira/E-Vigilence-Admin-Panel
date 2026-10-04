import { api } from "./api";

// Backend/src/modules/citations — auto-created when a violation is verified
// (VIOLATIONS_BUSINESS_LOGIC.md #4). HQ sees all; station accounts are
// scoped server-side to citations tied to their own station's violations.
const BASE = "/api/citations";

export function listCitations({ paymentStatus = "" } = {}) {
  const params = new URLSearchParams();
  if (paymentStatus) params.set("paymentStatus", paymentStatus);

  const qs = params.toString() ? `?${params.toString()}` : "";
  return api.get(`${BASE}${qs}`);
}

export function updateCitationPaymentStatus(id, paymentStatus) {
  return api.patch(`${BASE}/${id}`, { paymentStatus });
}
