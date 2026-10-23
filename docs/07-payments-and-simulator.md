# 07 — Payments and the payment simulator

**Status:** Agreed (2026-10-20) · **Depends on:** [05](05-outcomes-and-penalty-notices.md) · **Last updated:** 2026-10-20

## 1. Purpose

Money moves in two directions:

- **In** — an addressee pays a penalty notice.
- **Out** — a citizen is paid a reward ([16](16-citizen-rewards.md)), or a payment is refunded.

Sri Lanka's real channel for traffic fines is **GovPay** (live in all nine provinces since
February 2026). Connecting to it needs an agreement with ICTA and LankaPay, so until then a
**payment simulator** stands in. Everything else — records, rules, audit, refunds — is built for
real from the start, so connecting a real provider later replaces only the simulator.

## 2. Current state

Payment status on a citation is changed by hand (`unpaid → paid / appealed / waived`) with a
required note and a history. There is no payment reference, no payer, no refund and no payout.

## 3. Principles

- P1. **The amount comes from the notice**, never from the payer or the page.
- P2. **Every payment has a unique reference**, and a reference is processed only once.
- P3. **No real money and no card data** in the simulator — it only chooses an outcome.
- P4. **The simulator never imitates GovPay** — not its name, logo, colours or layout — and shows
  "TEST MODE — no real money" on every screen.
- P5. **Confirmations are server-to-server and signed**, the way a real gateway works; the
  browser is never trusted to say "paid".
- P6. **Money records are never edited or deleted** — corrections are new entries (refund,
  reversal) with a reason.

## 4. Ways a notice can be paid

| Channel | `method` | How |
|---|---|---|
| **Online (simulated)** | `sim_card`, `sim_wallet` | The addressee uses the public payment page (§5) |
| **Recorded receipt** | `receipt_cash_agent`, `receipt_post_office`, `receipt_bank` | Paid elsewhere; staff record the receipt (§6) |
| **Court fine** | — | Paid at court; recorded on the court case ([06](06-court-cases.md)), not here |

## 5. The payment simulator (public page)

### 5.1 Finding the notice
- Public page, no login. The payer enters the **notice number** and the **ID number of the
  addressee** (NIC, or business registration number for organisations).
- Shows only: notice number, vehicle plate, offence date, offences, amount due, due date, status.
  The addressee's name is shown masked (e.g. "N. P*****").
- **Rate limit:** 5 failed look-ups per 10 minutes per device/IP, then a short block.
- Notices that can't be paid online — withdrawn, already paid, filed in court, legacy — show why
  and what to do instead.

### 5.2 Paying
- The payer chooses card or mobile wallet; the simulator offers outcomes to test every path:
  **Pay — success**, **Card declined**, **Cancel**, **Bank delay** (stays pending, then succeeds
  after a minute).
- On success the simulator issues a reference (`SIM-` + 10 characters) and sends a **signed
  confirmation** to E-Vigilance (HMAC with a shared secret). E-Vigilance checks the signature,
  the reference (once only) and the amount, then marks the notice **paid**.
- The page shows a printable receipt: reference, notice, amount, date/time.

### 5.3 What paying triggers
Notice `paid` → case may close ([03](03-cases-and-dispatch.md) C4) → reporter's reward confirmed
([16](16-citizen-rewards.md)) → demerit points recorded ([08](08-demerit-points.md), if enabled) →
addressee gets an SMS receipt.

## 6. Recorded receipts

For fines paid at a cash agent, post office or bank:
- The **OIC** or **HQ** records it: method, receipt number, amount, date, and a **scan or photo of
  the receipt** (required).
- The amount must equal the notice amount.
- Every recorded receipt is listed for **HQ review**; HQ can reverse a wrong entry, with a reason.

## 7. The payment record

| Field | Notes |
|---|---|
| `reference` | Unique; `SIM-…` for simulator payments, the receipt number for recorded ones |
| `notice`, `amount` | Amount must equal the notice amount |
| `method` | §4 |
| `status` | `pending` → `succeeded` / `failed`; `succeeded` → `refunded` |
| `payerName` | As entered (optional for online) |
| `receivedAt`, `recordedBy` | `recordedBy` = system for online payments |
| `confirmation` | The signed payload as received (online), or the receipt scan (recorded) |

## 8. Refunds

- When a **paid** notice is withdrawn — e.g. a dispute upheld after payment, or HQ overrides the
  decision — a refund is due.
- **HQ approves** each refund; the simulator returns a refund reference (`SIMR-…`).
- The notice shows "Refunded" with the reference; the payment status becomes `refunded`; points
  recorded for it are removed and the reporter's reward is reversed.

## 9. Reward payouts

([16](16-citizen-rewards.md) §6)
- Citizens choose **bank transfer** (bank, account number) or **mobile wallet** (phone number).
  Account numbers are stored masked except for the last 4 digits once a payout succeeds.
- HQ approves payouts in **weekly batches**. The simulator returns success or failure per payout
  with a reference (`SIMP-…`).
- A **failed** payout returns the amount to the citizen's confirmed balance and asks them to check
  their details.

## 10. Reconciliation

- A daily report compares simulator confirmations with notices marked paid, and payouts approved
  with payouts confirmed. Any mismatch is flagged to HQ.
- Totals by day, station, division and method feed the dashboard ([12](12-dashboards-and-reports.md)).

## 11. Connecting a real provider later

The simulator sits behind a **payment provider interface**: start a payment, receive a
confirmation, refund, pay out. A setting (`payments.provider = simulator | govpay`) chooses the
implementation. Records, rules, audit and screens stay the same.

## 12. Edge cases

| Situation | Rule |
|---|---|
| A notice is paid twice (two tabs, two channels) | The second payment is **refunded automatically** and flagged. |
| Payment confirmed while a dispute is open | The payment stands; the dispute is closed as "withdrawn by payment". |
| Payment after the due date, before court filing | Accepted ([05](05-outcomes-and-penalty-notices.md) D05-6). |
| Payment attempt after court filing | Refused; the page explains the court will decide. |
| Confirmation with a wrong amount or unknown reference | Rejected and flagged; the notice is unchanged. |
| "Bank delay" never completes | Pending payments older than 24 hours are marked failed. |
| Notice withdrawn between look-up and payment | The confirmation is refunded automatically. |

## 13. Loopholes this closes

| Loophole | Closed by |
|---|---|
| Anyone marks a fine paid by changing a dropdown | Payments only from signed confirmations or reviewed receipts (§5–6) |
| Paying a smaller amount | Amount fixed by the notice (P1) |
| A confirmation replayed to mark other notices paid | Reference used once; signature checked (P2, P5) |
| Payment records quietly edited | Records are append-only (P6) |
| Money kept for a withdrawn notice | Refunds (§8), automatic for double payments |
| Guessing notice numbers to see people's fines | Number + ID required, masked name, rate limit (§5.1) |

## 14. Decisions

All decisions agreed on 2026-10-20 as recommended.

| # | Decision | Agreed |
|---|---|---|
| D07-1 | Public look-up | **Notice number + addressee's ID number**; masked name; 5 failed tries per 10 minutes. |
| D07-2 | Recorded receipts | **OIC or HQ, receipt scan required, all reviewed by HQ.** |
| D07-3 | Refund approval | **HQ.** Double payments refunded automatically. |
| D07-4 | Simulator outcomes | **Success, declined, cancel, bank delay.** |
| D07-5 | Confirmation security | **Signed server-to-server confirmation, reference used once.** |
| D07-6 | Payment during an open dispute | **Accepted; the dispute closes.** |
| D07-7 | Reward payout methods | **Bank transfer or mobile wallet, simulated, weekly HQ batches.** |
| D07-8 | Daily reconciliation report | **Yes.** |
