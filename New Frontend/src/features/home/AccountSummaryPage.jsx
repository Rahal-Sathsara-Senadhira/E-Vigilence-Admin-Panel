// Shown after signing in until the app frame and role home pages are built
// (TODO.md, N0 frontend: "App frame"). Confirms who is signed in, their
// role and reach, and lets them sign out.

import { LogOut, ShieldCheck } from "lucide-react";
import { useCurrentUser, useSession } from "@/lib/session-context.js";
import { Button, Logo } from "@/ui/index.js";

const LEVEL = { national: "All of Sri Lanka", division: "Your division", station: "Your station" };

export function AccountSummaryPage() {
  const user = useCurrentUser();
  const { signOut } = useSession();
  const place = user.station?.name ?? user.division?.name ?? "Traffic Headquarters";

  return (
    <div className="min-h-dvh bg-canvas px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <Logo className="h-10 w-16" />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-text">E-Vigilance</p>
            <p className="text-xs text-text-muted">Sri Lanka Police</p>
          </div>
        </div>

        <section className="rounded-2xl border border-border bg-panel p-6 sm:p-8">
          <p className="text-sm text-text-muted">Signed in as</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text">{user.name}</h1>
          <p className="mt-1 text-sm text-text-muted">
            {user.roleLabel} · {place}
            {user.readOnly ? " · Read-only" : ""}
          </p>

          <dl className="mt-6 grid gap-4 border-t border-border pt-6 text-sm sm:grid-cols-2">
            <Item label="Sign-in ID">
              {user.email ?? "—"}
              {user.serviceNumber ? (
                <span className="block font-mono text-text-muted">{user.serviceNumber}</span>
              ) : null}
            </Item>
            <Item label="Reach">{LEVEL[user.level]}</Item>
            <Item label="Two-step sign-in">
              {user.mfa.enabled ? (
                <span className="inline-flex items-center gap-1.5 text-success">
                  <ShieldCheck className="size-4" aria-hidden /> On
                </span>
              ) : (
                "Off"
              )}
            </Item>
            <Item label="Signed out after">{user.idleMinutes} minutes without activity</Item>
            <Item label="Permissions">{Object.keys(user.permissions).length}</Item>
          </dl>

          <div className="mt-8 flex justify-end">
            <Button onClick={() => signOut()} icon={<LogOut className="size-4" />}>
              Sign out
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

/** @param {{ label: string, children: import("react").ReactNode }} props */
function Item({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium text-text-muted">{label}</dt>
      <dd className="mt-1 text-text">{children}</dd>
    </div>
  );
}
