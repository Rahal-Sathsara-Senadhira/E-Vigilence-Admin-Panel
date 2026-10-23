// "My account" — profile, password, two-step sign-in, devices (docs/18 §7.1).

import { ShieldCheck, ShieldOff } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "react-router";
import { useCurrentUser } from "@/lib/session-context.js";
import { Avatar, Badge, Page, Panel } from "@/ui/index.js";
import { ChangePasswordPanel } from "../components/ChangePasswordPanel.jsx";
import { DevicesPanel } from "../components/DevicesPanel.jsx";

const REACH = {
  national: "All of Sri Lanka",
  division: "The stations in your division",
  station: "Your station",
};

export function MePage() {
  const user = useCurrentUser();
  const { hash } = useLocation();
  const place = user.station?.name ?? user.division?.name ?? "Traffic Headquarters";

  // "Change password" from the search box jumps straight to the form.
  useEffect(() => {
    if (hash) document.querySelector(hash)?.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <Page title="My account" description="Your details, password and where you are signed in.">
      <div className="grid gap-6">
        <Panel>
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
            <Avatar name={user.name} className="size-14 text-lg" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-text">{user.name}</h2>
              <p className="text-sm text-text-muted">
                {user.roleLabel} · {place}
              </p>
            </div>
            {user.readOnly ? <Badge tone="warning">Read-only role</Badge> : null}
          </div>
          <dl className="grid gap-x-6 gap-y-4 border-t border-border p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Item label="Email">{user.email ?? "—"}</Item>
            <Item label="Service number">
              {user.serviceNumber ? <span className="font-mono">{user.serviceNumber}</span> : "—"}
            </Item>
            <Item label="Can see">{REACH[user.level]}</Item>
            <Item label="Signed out after">{user.idleMinutes} minutes without activity</Item>
          </dl>
          <p className="border-t border-border px-5 py-3 text-[13px] text-text-muted">
            To change your name, role or station, ask your account manager.
          </p>
        </Panel>

        <ChangePasswordPanel />

        <Panel
          title="Two-step sign-in"
          description="A code from an authenticator app each time you sign in."
        >
          <div className="flex items-start gap-3 p-5 text-sm">
            {user.mfa.enabled ? (
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            ) : (
              <ShieldOff className="mt-0.5 size-5 shrink-0 text-text-muted" aria-hidden />
            )}
            <div>
              <p className="font-medium text-text">{user.mfa.enabled ? "On" : "Off"}</p>
              <p className="mt-0.5 text-text-muted">
                {user.mfa.enabled
                  ? "New phone, or lost this one? Sign in with a recovery code, then ask your account manager to reset two-step sign-in so you can set it up again."
                  : user.mfa.required
                    ? "Your role requires it; you'll set it up at your next sign-in."
                    : "Optional for your role."}
              </p>
            </div>
          </div>
        </Panel>

        <DevicesPanel />
      </div>
    </Page>
  );
}

/** @param {{ label: string, children: import("react").ReactNode }} props */
function Item({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-text-muted">{label}</dt>
      <dd className="mt-1 truncate text-text">{children}</dd>
    </div>
  );
}
