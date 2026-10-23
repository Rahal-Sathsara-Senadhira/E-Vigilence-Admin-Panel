// Sign-in — password, then the authenticator code (or its first-time set-up
// for HQ and dev). docs/17 §6.

import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, otpCodeSchema, type LoginInput } from "@ev/shared";
import { Alert, Button, Field, Input } from "@ev/ui";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "../lib/api";
import { useAuth } from "./AuthProvider";

type Step =
  | { kind: "password" }
  | { kind: "code"; challengeToken: string }
  | { kind: "setup"; challengeToken: string };

export function LoginPage() {
  const [step, setStep] = useState<Step>({ kind: "password" });
  const back = () => setStep({ kind: "password" });

  return (
    <AuthLayout>
      {step.kind === "password" ? (
        <PasswordStep onNext={setStep} />
      ) : step.kind === "code" ? (
        <CodeStep challengeToken={step.challengeToken} onBack={back} />
      ) : (
        <SetupStep challengeToken={step.challengeToken} onBack={back} />
      )}
    </AuthLayout>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-frame p-10 text-frame-muted lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-white p-1.5">
            <img src="/logo.svg" alt="" className="size-full object-contain" />
          </span>
          <div className="leading-tight">
            <p className="text-lg font-semibold text-white">E-Vigilance</p>
            <p className="text-sm">Sri Lanka Police</p>
          </div>
        </div>
        <div className="max-w-md">
          <p className="text-2xl leading-snug font-semibold text-white">
            Traffic enforcement, from a citizen's report to a lawful outcome.
          </p>
          <p className="mt-3 text-sm leading-relaxed">
            Reports from the public and officers are checked, sent to the right station,
            investigated and closed with a recorded decision. Every action is logged.
          </p>
        </div>
        <p className="text-xs text-frame-muted/80">
          Authorised police personnel only. Activity is recorded.
        </p>
        <span
          aria-hidden
          className="absolute -right-24 -bottom-24 size-80 rounded-full border-[40px] border-white/5"
        />
      </section>

      <section className="flex items-center justify-center bg-canvas px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-frame p-1.5">
              <img src="/logo.svg" alt="" className="size-full object-contain" />
            </span>
            <div className="leading-tight">
              <p className="font-semibold text-ink">E-Vigilance</p>
              <p className="text-sm text-muted">Sri Lanka Police</p>
            </div>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}

function PasswordStep({ onNext }: { onNext: (step: Step) => void }) {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const result = await login(values.email, values.password);
      if (result.status === "mfaRequired")
        onNext({ kind: "code", challengeToken: result.challengeToken });
      if (result.status === "mfaSetupRequired")
        onNext({ kind: "setup", challengeToken: result.challengeToken });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Can't reach the server. Check your connection and try again.",
      );
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-muted">Use your official E-Vigilance account.</p>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Email" error={form.formState.errors.email?.message}>
        {(p) => (
          <Input
            {...p}
            type="email"
            autoComplete="username"
            autoFocus
            {...form.register("email")}
          />
        )}
      </Field>
      <Field label="Password" error={form.formState.errors.password?.message}>
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete="current-password"
            {...form.register("password")}
          />
        )}
      </Field>
      <Button
        type="submit"
        variant="primary"
        className="w-full"
        loading={form.formState.isSubmitting}
      >
        Continue
      </Button>
      <p className="text-center text-xs text-muted">
        Forgot your password? Ask your OIC or HQ to reset it.
      </p>
    </form>
  );
}

const codeForm = z.object({ code: otpCodeSchema });

function CodeForm({
  submitLabel,
  onSubmit,
}: {
  submitLabel: string;
  onSubmit: (code: string) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ code: string }>({
    resolver: zodResolver(codeForm),
    defaultValues: { code: "" },
  });
  const submit = form.handleSubmit(async ({ code }) => {
    setError(null);
    try {
      await onSubmit(code);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Can't reach the server. Try again.");
      form.reset({ code: "" });
    }
  });
  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="6-digit code" error={form.formState.errors.code?.message}>
        {(p) => (
          <Input
            {...p}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            className="text-center font-mono text-lg tracking-[0.4em]"
            {...form.register("code")}
          />
        )}
      </Field>
      <Button
        type="submit"
        variant="primary"
        className="w-full"
        loading={form.formState.isSubmitting}
      >
        {submitLabel}
      </Button>
    </form>
  );
}

function StepHeader({
  title,
  description,
  onBack,
}: {
  title: string;
  description: string;
  onBack: () => void;
}) {
  return (
    <div className="mb-5">
      <button
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Back
      </button>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </div>
  );
}

function CodeStep({ challengeToken, onBack }: { challengeToken: string; onBack: () => void }) {
  const { verifyCode } = useAuth();
  return (
    <>
      <StepHeader
        title="Two-step sign-in"
        description="Enter the code shown in your authenticator app."
        onBack={onBack}
      />
      <CodeForm submitLabel="Sign in" onSubmit={(code) => verifyCode(challengeToken, code)} />
    </>
  );
}

function SetupStep({ challengeToken, onBack }: { challengeToken: string; onBack: () => void }) {
  const { beginSetup, confirmSetup } = useAuth();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    beginSetup(challengeToken)
      .then(async ({ secret, otpauthUri }) => {
        const qr = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 200 });
        if (!cancelled) setSetup({ secret, qr });
      })
      .catch(
        (err) =>
          !cancelled &&
          setError(err instanceof ApiError ? err.message : "Couldn't start the set-up."),
      );
    return () => {
      cancelled = true;
    };
  }, [beginSetup, challengeToken]);

  return (
    <>
      <StepHeader
        title="Set up two-step sign-in"
        description="Your role needs an authenticator app (Google Authenticator, Microsoft Authenticator or similar)."
        onBack={onBack}
      />
      {error ? (
        <Alert tone="danger">{error}</Alert>
      ) : (
        <div className="space-y-5">
          <ol className="space-y-1.5 text-sm text-ink">
            <li>1. Open the app and add a new account.</li>
            <li>2. Scan this QR code, or type the key.</li>
            <li>3. Enter the 6-digit code it shows.</li>
          </ol>
          <div className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4">
            {setup ? (
              <img
                src={setup.qr}
                alt="QR code for your authenticator app"
                className="size-32 rounded-md bg-white p-1"
              />
            ) : (
              <div className="size-32 animate-pulse rounded-md bg-raised" />
            )}
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <ShieldCheck className="size-4 text-success" /> Set-up key
              </p>
              <p className="mt-1 font-mono text-sm break-all text-ink">
                {setup?.secret.match(/.{1,4}/g)?.join(" ") ?? "…"}
              </p>
            </div>
          </div>
          <CodeForm
            submitLabel="Confirm and sign in"
            onSubmit={(code) => confirmSetup(challengeToken, code)}
          />
        </div>
      )}
    </>
  );
}
