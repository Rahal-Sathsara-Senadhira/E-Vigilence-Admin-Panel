// Step 2: the code from the authenticator app, or a recovery code.

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, Button, Field, Input } from "@/ui/index.js";
import { verifyMfa } from "../api.js";
import { StepHeading } from "../components/StepHeading.jsx";
import { useStepSubmit } from "../lib/useStepSubmit.js";

const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6 digits shown in your authenticator app."),
});
const recoverySchema = z.object({
  recoveryCode: z.string().trim().min(8, "Enter one of your recovery codes, like 7KQ4-M2XD."),
});

/**
 * @param {{
 *   challenge: string,
 *   onResult: (result: import("../api.js").StepResult) => void,
 *   onCancel: () => void,
 * }} props
 */
export function TwoStepCodeStep({ challenge, onResult, onCancel }) {
  const [useRecovery, setUseRecovery] = useState(false);
  return useRecovery ? (
    <RecoveryForm challenge={challenge} onResult={onResult} onBack={() => setUseRecovery(false)} />
  ) : (
    <CodeForm
      challenge={challenge}
      onResult={onResult}
      onRecovery={() => setUseRecovery(true)}
      onCancel={onCancel}
    />
  );
}

/**
 * @param {{ challenge: string, onResult: (r: any) => void, onRecovery: () => void, onCancel: () => void }} props
 */
function CodeForm({ challenge, onResult, onRecovery, onCancel }) {
  const {
    register,
    handleSubmit,
    setError,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(codeSchema), defaultValues: { code: "" } });
  const { formError, run } = useStepSubmit(setError);

  const submit = handleSubmit(async ({ code }) => {
    const result = await run(() => verifyMfa({ challenge, code }));
    if (result) onResult(result);
    else resetField("code", { keepError: true });
  });

  const field = register("code", {
    // Most people paste or type all six digits; send as soon as they're there.
    onChange: (e) => {
      if (/^\d{6}$/.test(e.target.value)) void submit();
    },
  });

  return (
    <>
      <StepHeading title="Two-step sign-in">
        Open your authenticator app and enter the 6-digit code for E-Vigilance.
      </StepHeading>
      <form onSubmit={submit} noValidate className="space-y-5">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <Field label="6-digit code" error={errors.code?.message}>
          {({ invalid, ...p }) => (
            <Input
              {...p}
              invalid={invalid}
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="h-12 text-center font-mono text-xl tracking-[0.4em]"
              {...field}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={isSubmitting}>
          Continue
        </Button>
      </form>
      <div className="mt-6 flex flex-col items-start gap-2 text-sm">
        <button type="button" onClick={onRecovery} className="text-action hover:underline">
          Lost your phone? Use a recovery code
        </button>
        <button type="button" onClick={onCancel} className="text-text-muted hover:text-text">
          Sign in with a different account
        </button>
      </div>
    </>
  );
}

/** @param {{ challenge: string, onResult: (r: any) => void, onBack: () => void }} props */
function RecoveryForm({ challenge, onResult, onBack }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(recoverySchema), defaultValues: { recoveryCode: "" } });
  const { formError, run } = useStepSubmit(setError);

  const submit = handleSubmit(async ({ recoveryCode }) => {
    const result = await run(() => verifyMfa({ challenge, recoveryCode }));
    if (result) onResult(result);
  });

  return (
    <>
      <StepHeading title="Use a recovery code">
        Enter one of the codes you saved when you set up two-step sign-in. Each code works once.
      </StepHeading>
      <form onSubmit={submit} noValidate className="space-y-5">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <Field
          label="Recovery code"
          hint="After signing in, ask your account manager to reset two-step sign-in so you can set up your new phone."
          error={errors.recoveryCode?.message}
        >
          {({ invalid, ...p }) => (
            <Input
              {...p}
              invalid={invalid}
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="font-mono uppercase tracking-wider"
              {...register("recoveryCode")}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={isSubmitting}>
          Continue
        </Button>
      </form>
      <button type="button" onClick={onBack} className="mt-6 text-sm text-action hover:underline">
        Use the code from my app instead
      </button>
    </>
  );
}
