// Step 4: set up two-step sign-in — required for national and division
// roles (docs/20 D20-2). Scan a QR code, then prove it works with one code.

import { zodResolver } from "@hookform/resolvers/zod";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, Button, Field, Input, Spinner } from "@/ui/index.js";
import { confirmMfaSetup, startMfaSetup } from "../api.js";
import { StepHeading } from "../components/StepHeading.jsx";
import { useStepSubmit } from "../lib/useStepSubmit.js";

// One set-up request per challenge: a second request would store a new key
// and the QR code on screen would no longer match it.
/** @type {Map<string, Promise<{ secret: string, otpauthUri: string }>>} */
const setupRequests = new Map();
/** @param {string} challenge */
function startOnce(challenge) {
  let request = setupRequests.get(challenge);
  if (!request) {
    request = startMfaSetup({ challenge });
    setupRequests.set(challenge, request);
    request.catch(() => setupRequests.delete(challenge));
  }
  return request;
}

const schema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6 digits shown in your authenticator app."),
});

/**
 * @param {{
 *   challenge: string,
 *   onDone: (result: import("../api.js").StepResult, recoveryCodes: string[]) => void,
 * }} props
 */
export function SetUpTwoStepStep({ challenge, onDone }) {
  const [setup, setSetup] = useState(
    /** @type {{ secret: string, qr: string } | { error: string } | null} */ (null),
  );
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { code: "" } });
  const { formError, run } = useStepSubmit(setError);

  useEffect(() => {
    let cancelled = false;
    startOnce(challenge)
      .then(async ({ secret, otpauthUri }) => {
        const qr = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 192 });
        if (!cancelled) setSetup({ secret, qr });
      })
      .catch((err) => {
        if (!cancelled) setSetup({ error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [challenge]);

  const submit = handleSubmit(async ({ code }) => {
    const result = await run(() => confirmMfaSetup({ challenge, code }));
    if (result) onDone(result, result.recoveryCodes);
  });

  return (
    <>
      <StepHeading title="Set up two-step sign-in">
        Your role needs a code from an authenticator app each time you sign in. This takes about a
        minute.
      </StepHeading>

      {setup && "error" in setup ? (
        <Alert tone="danger">{setup.error}</Alert>
      ) : (
        <ol className="space-y-6">
          <Step n={1} title="Install an authenticator app">
            Google Authenticator or Microsoft Authenticator, free from your phone&apos;s app store.
          </Step>
          <Step n={2} title="Scan this code with the app">
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="grid size-[200px] shrink-0 place-items-center rounded-lg border border-border bg-white p-1">
                {setup ? (
                  <img src={setup.qr} alt="QR code to add E-Vigilance to your authenticator app" />
                ) : (
                  <Spinner className="size-6 text-text-muted" label="Preparing the QR code" />
                )}
              </div>
              {setup ? (
                <div className="text-[13px] text-text-muted">
                  Can&apos;t scan it? In the app, choose “Enter a setup key” and type:
                  <p className="mt-1.5 font-mono text-sm break-all text-text select-all">
                    {setup.secret.match(/.{1,4}/g)?.join(" ")}
                  </p>
                </div>
              ) : null}
            </div>
          </Step>
          <Step n={3} title="Enter the 6-digit code the app shows">
            <form onSubmit={submit} noValidate className="mt-3 space-y-4">
              {formError ? <Alert tone="danger">{formError}</Alert> : null}
              <Field label="6-digit code" error={errors.code?.message}>
                {({ invalid, ...p }) => (
                  <Input
                    {...p}
                    invalid={invalid}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="h-12 max-w-[220px] text-center font-mono text-xl tracking-[0.4em]"
                    {...register("code")}
                  />
                )}
              </Field>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                block
                loading={isSubmitting}
                disabled={!setup}
              >
                Turn on two-step sign-in
              </Button>
            </form>
          </Step>
        </ol>
      )}
    </>
  );
}

/** @param {{ n: number, title: string, children: import("react").ReactNode }} props */
function Step({ n, title, children }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="grid size-6 shrink-0 place-items-center rounded-full bg-action-soft text-xs font-semibold text-action"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-text">{title}</p>
        <div className="mt-0.5 text-sm text-text-muted">{children}</div>
      </div>
    </li>
  );
}
