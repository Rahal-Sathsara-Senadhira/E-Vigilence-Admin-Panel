// The payout simulator (D16-10) — stands in for a bank transfer or mobile
// wallet until a real channel is approved. No money moves. An account
// number ending 0000 is refused, so a failure and its retry can be shown.

import { reference } from "../payments/simulator.js";

/**
 * @param {{ method: string, accountMasked: string, amount: number }} payout
 * @returns {{ ok: true, reference: string } | { ok: false, error: string }}
 */
export function payOut({ method, accountMasked }) {
  if (accountMasked.endsWith("0000"))
    return {
      ok: false,
      error:
        method === "wallet"
          ? "The wallet provider refused the wallet number."
          : "The bank refused the account number.",
    };
  return { ok: true, reference: reference("SIMP") };
}
