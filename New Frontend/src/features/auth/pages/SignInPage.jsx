// The sign-in page — docs/20 §9. One page, several steps:
//
//   password ─► two-step code ─► new password ─► set up two-step ─► recovery codes
//
// Each step is skipped when it doesn't apply; the backend decides which comes
// next. The challenge that links the steps is kept in memory only.

import { useState } from "react";
import { takeEndedReason } from "@/lib/api.js";
import { useSession } from "@/lib/session-context.js";
import { NewPasswordStep } from "../steps/NewPasswordStep.jsx";
import { PasswordStep } from "../steps/PasswordStep.jsx";
import { RecoveryCodesStep } from "../steps/RecoveryCodesStep.jsx";
import { SetUpTwoStepStep } from "../steps/SetUpTwoStepStep.jsx";
import { TwoStepCodeStep } from "../steps/TwoStepCodeStep.jsx";

/**
 * @typedef {{ step: "password" }
 *   | { step: "mfa" | "new_password" | "mfa_setup", challenge: string }
 *   | { step: "recovery_codes", codes: string[], result: import("../api.js").StepResult }} State
 */

/** @type {Record<string, "mfa" | "new_password" | "mfa_setup">} */
const NEXT = {
  mfa_required: "mfa",
  password_change_required: "new_password",
  mfa_setup_required: "mfa_setup",
};

export function SignInPage() {
  const { start } = useSession();
  const [state, setState] = useState(/** @type {State} */ ({ step: "password" }));
  // Why the last session ended (idle, 12 hours…), shown once above the form.
  const [notice] = useState(takeEndedReason);

  /** @param {import("../api.js").StepResult} result */
  function onResult(result) {
    if (result.status === "signed_in") {
      start(result.session);
      return;
    }
    setState({ step: NEXT[result.status], challenge: result.challenge });
  }

  const restart = () => setState({ step: "password" });

  switch (state.step) {
    case "password":
      return <PasswordStep notice={notice} onResult={onResult} />;
    case "mfa":
      return <TwoStepCodeStep challenge={state.challenge} onResult={onResult} onCancel={restart} />;
    case "new_password":
      return <NewPasswordStep challenge={state.challenge} onResult={onResult} />;
    case "mfa_setup":
      return (
        <SetUpTwoStepStep
          challenge={state.challenge}
          onDone={(result, codes) => setState({ step: "recovery_codes", codes, result })}
        />
      );
    case "recovery_codes":
      return <RecoveryCodesStep codes={state.codes} onContinue={() => onResult(state.result)} />;
  }
}
