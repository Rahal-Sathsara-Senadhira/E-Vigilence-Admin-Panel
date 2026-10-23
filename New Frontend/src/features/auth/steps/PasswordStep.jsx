// Step 1: email or service number, and password.

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, Button, Field, Input, PasswordInput } from "@/ui/index.js";
import { signIn } from "../api.js";
import { StepHeading } from "../components/StepHeading.jsx";
import { useStepSubmit } from "../lib/useStepSubmit.js";

const schema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or service number."),
  password: z.string().min(1, "Enter your password."),
});

/**
 * @param {{
 *   notice: string | null,
 *   onResult: (result: import("../api.js").StepResult) => void,
 * }} props
 */
export function PasswordStep({ notice, onResult }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { identifier: "", password: "" } });
  const { formError, run } = useStepSubmit(setError);

  const submit = handleSubmit(async (values) => {
    const result = await run(() => signIn(values));
    if (result) onResult(result);
  });

  return (
    <>
      <StepHeading title="Sign in">Use your email address or police service number.</StepHeading>
      <form onSubmit={submit} noValidate className="space-y-5">
        {notice && !formError ? <Alert tone="info">{notice}</Alert> : null}
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <Field label="Email or service number" error={errors.identifier?.message}>
          {({ invalid, ...p }) => (
            <Input
              {...p}
              invalid={invalid}
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              {...register("identifier")}
            />
          )}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {({ invalid, ...p }) => (
            <PasswordInput
              {...p}
              invalid={invalid}
              autoComplete="current-password"
              {...register("password")}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={isSubmitting}>
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-[13px] text-text-muted">
        Forgot your password? Your account manager — your OIC, or the HQ administrator — can reset
        it for you.
      </p>
    </>
  );
}
