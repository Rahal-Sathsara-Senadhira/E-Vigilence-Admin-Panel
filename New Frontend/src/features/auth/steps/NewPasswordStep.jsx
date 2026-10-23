// Step 3: the user's own password, on first sign-in or after a reset.
// The backend also refuses common passwords and ones built from the
// person's name, email or service number (docs/20 §9).

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Circle } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Alert, Button, Field, PasswordInput, cn } from "@/ui/index.js";
import { setFirstPassword } from "../api.js";
import { StepHeading } from "../components/StepHeading.jsx";
import { useStepSubmit } from "../lib/useStepSubmit.js";

const MIN = 12;

const schema = z
  .object({
    newPassword: z.string().min(MIN, `Use at least ${MIN} characters.`).max(128),
    confirm: z.string().min(1, "Type the password again."),
  })
  .refine((v) => v.newPassword === v.confirm, {
    message: "The two passwords don't match.",
    path: ["confirm"],
  });

/**
 * @param {{ challenge: string, onResult: (result: import("../api.js").StepResult) => void }} props
 */
export function NewPasswordStep({ challenge, onResult }) {
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { newPassword: "", confirm: "" } });
  const { formError, run } = useStepSubmit(setError);
  const [password, confirm] = useWatch({ control, name: ["newPassword", "confirm"] });

  const submit = handleSubmit(async ({ newPassword }) => {
    const result = await run(() => setFirstPassword({ challenge, newPassword }));
    if (result) onResult(result);
  });

  return (
    <>
      <StepHeading title="Choose your own password">
        Your account has a temporary password. Choose one that only you know.
      </StepHeading>
      <form onSubmit={submit} noValidate className="space-y-5">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <Field label="New password" error={errors.newPassword?.message}>
          {({ invalid, ...p }) => (
            <PasswordInput
              {...p}
              invalid={invalid}
              autoFocus
              autoComplete="new-password"
              {...register("newPassword")}
            />
          )}
        </Field>
        <Field label="Type it again" error={errors.confirm?.message}>
          {({ invalid, ...p }) => (
            <PasswordInput
              {...p}
              invalid={invalid}
              autoComplete="new-password"
              {...register("confirm")}
            />
          )}
        </Field>
        <ul className="space-y-1.5 text-[13px]" aria-label="Password rules">
          <Rule met={password.length >= MIN}>At least {MIN} characters</Rule>
          <Rule met={password.length > 0 && password === confirm}>Both passwords match</Rule>
          <Rule>Not your name, email or service number, and not a common password</Rule>
        </ul>
        <p className="text-[13px] text-text-muted">
          Tip: a few unrelated words are easy to remember and hard to guess — for example
          “lotus-monsoon-ferry-42”.
        </p>
        <Button type="submit" variant="primary" size="lg" block loading={isSubmitting}>
          Save password
        </Button>
      </form>
    </>
  );
}

/** @param {{ met?: boolean, children: import("react").ReactNode }} props */
function Rule({ met, children }) {
  return (
    <li className={cn("flex items-start gap-2", met ? "text-success" : "text-text-muted")}>
      {met ? (
        <Check className="mt-0.5 size-3.5 shrink-0" aria-label="Done" />
      ) : (
        <Circle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      )}
      <span>{children}</span>
    </li>
  );
}
