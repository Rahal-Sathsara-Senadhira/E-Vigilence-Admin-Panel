import { zodResolver } from "@hookform/resolvers/zod";
import { PASSWORD_MIN_LENGTH, changePasswordSchema, type ChangePasswordInput } from "@ev/shared";
import { Alert, Button, Card, Field, Input, PageHeader } from "@ev/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ApiError } from "../lib/api";
import { AuthLayout } from "./LoginPage";
import { useAuth } from "./AuthProvider";

function PasswordForm({ onDone }: { onDone: () => void }) {
  const { changePassword } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      toast.success("Password changed. Other devices have been signed out.");
      onDone();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        for (const [field, message] of Object.entries(err.fields)) {
          form.setError(field as keyof ChangePasswordInput, { message });
        }
      } else {
        setError(
          err instanceof ApiError ? err.message : "Couldn't change the password. Try again.",
        );
      }
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Current password" error={form.formState.errors.currentPassword?.message}>
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete="current-password"
            {...form.register("currentPassword")}
          />
        )}
      </Field>
      <Field
        label="New password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short sentence is easier to remember.`}
        error={form.formState.errors.newPassword?.message}
      >
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete="new-password"
            {...form.register("newPassword")}
          />
        )}
      </Field>
      <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
        Change password
      </Button>
    </form>
  );
}

/** Shown instead of the app until a temporary password is replaced. */
export function ForcedPasswordChange() {
  const { logout } = useAuth();
  return (
    <AuthLayout>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Choose your password</h1>
        <p className="mt-1 text-sm text-muted">
          You signed in with a temporary password. Replace it to continue.
        </p>
      </div>
      <PasswordForm onDone={() => {}} />
      <button onClick={() => void logout()} className="mt-6 text-sm text-muted hover:text-ink">
        Sign out instead
      </button>
    </AuthLayout>
  );
}

export function ChangePasswordPage() {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        title="Change password"
        description="Changing your password signs you out on every other device."
      />
      <Card className="max-w-lg p-6">
        <PasswordForm onDone={() => navigate("/")} />
      </Card>
    </>
  );
}
