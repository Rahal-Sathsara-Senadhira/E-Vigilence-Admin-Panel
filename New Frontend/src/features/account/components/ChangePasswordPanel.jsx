// Change password. Other devices are signed out by the backend; this one
// stays signed in.

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/lib/api.js";
import { Alert, Button, Field, Panel, PasswordInput } from "@/ui/index.js";
import { useChangePassword } from "../api.js";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(12, "Use at least 12 characters.").max(128),
    confirm: z.string().min(1, "Type the new password again."),
  })
  .refine((v) => v.newPassword === v.confirm, {
    message: "The two passwords don't match.",
    path: ["confirm"],
  });

export function ChangePasswordPanel() {
  const change = useChangePassword();
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
  });

  const submit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setDone(false);
    try {
      await change.mutateAsync({ currentPassword, newPassword });
      reset();
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        for (const [field, message] of Object.entries(err.fields)) {
          setError(/** @type {any} */ (field), { type: "server", message });
        }
      } else {
        setError("root", { message: err instanceof Error ? err.message : "Please try again." });
      }
    }
  });

  return (
    <Panel
      title="Password"
      description="At least 12 characters. Not your name, email or service number."
    >
      <form
        id="password"
        onSubmit={submit}
        noValidate
        className="grid max-w-xl scroll-mt-20 gap-4 p-5"
      >
        {done ? (
          <Alert tone="success">Password changed. Your other devices have been signed out.</Alert>
        ) : null}
        {errors.root?.message ? <Alert tone="danger">{errors.root.message}</Alert> : null}
        <Field label="Current password" error={errors.currentPassword?.message}>
          {({ invalid, ...p }) => (
            <PasswordInput
              {...p}
              invalid={invalid}
              autoComplete="current-password"
              {...register("currentPassword")}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password" error={errors.newPassword?.message}>
            {({ invalid, ...p }) => (
              <PasswordInput
                {...p}
                invalid={invalid}
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
        </div>
        <div>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            Change password
          </Button>
        </div>
      </form>
    </Panel>
  );
}
