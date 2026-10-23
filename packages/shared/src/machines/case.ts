// Case states — docs/03-cases-and-dispatch.md §4.

import { defineMachine } from "../stateMachine.js";

export const caseMachine = defineMachine({
  name: "case",
  initial: "open",
  transitions: {
    // "closed" from the early states: a station case HQ rejects or merges at
    // review (02 §7, C6), or a case merged into another (03 §7).
    // "dispatched" again from dispatched/accepted/investigating: re-dispatch (03 §5.4).
    open: ["dispatched", "closed"],
    dispatched: ["accepted", "returned", "dispatched", "closed"],
    returned: ["dispatched", "closed"],
    accepted: ["investigating", "returned", "dispatched", "closed"], // return before work starts (03 §5.3)
    investigating: ["recommended", "dispatched", "closed"],
    recommended: ["decided", "investigating"], // decide, or send back (C3)
    decided: ["closed", "recommended"], // outcomes finish (C4), or HQ override (03 §8)
    closed: ["investigating"], // reopen: HQ only, with a reason (C5)
  },
});

export type CaseStatus = (typeof caseMachine.states)[number];

/** Status family for colour and grouping — docs/13-design-system.md §3.4. */
export const CASE_STATUS_FAMILY: Record<CaseStatus, StatusFamily> = {
  open: "new",
  dispatched: "new",
  accepted: "progress",
  investigating: "progress",
  recommended: "waiting",
  decided: "good",
  closed: "closed",
  returned: "problem",
};

export type StatusFamily = "new" | "progress" | "waiting" | "good" | "legal" | "closed" | "problem";
