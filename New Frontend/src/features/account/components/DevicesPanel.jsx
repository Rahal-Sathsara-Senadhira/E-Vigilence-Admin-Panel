// Signed-in devices, with "sign out everywhere" (docs/20 §9).

import { Laptop, Smartphone } from "lucide-react";
import { useState } from "react";
import { formatDateTime, formatRelative } from "@/lib/format.js";
import { useSession } from "@/lib/session-context.js";
import { Alert, Badge, Button, Dialog, Panel, Spinner } from "@/ui/index.js";
import { useSessions, useSignOutEverywhere } from "../api.js";
import { describeDevice, isPhone } from "../lib/device.js";

export function DevicesPanel() {
  const sessions = useSessions();
  const everywhere = useSignOutEverywhere();
  const { signOut } = useSession();
  const [confirming, setConfirming] = useState(false);

  async function signOutEverywhere() {
    await everywhere.mutateAsync();
    await signOut("You signed out on every device.");
  }

  return (
    <Panel
      title="Signed-in devices"
      description="Where your account is signed in now. Sessions end after 12 hours."
      actions={
        <Button size="sm" onClick={() => setConfirming(true)}>
          Sign out everywhere
        </Button>
      }
    >
      {sessions.isPending ? (
        <div className="flex items-center gap-2 p-5 text-sm text-text-muted">
          <Spinner /> Loading devices
        </div>
      ) : sessions.isError ? (
        <div className="p-5">
          <Alert tone="danger">{sessions.error.message}</Alert>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {sessions.data.map((s) => {
            const Icon = isPhone(s.userAgent) ? Smartphone : Laptop;
            return (
              <li key={s.id} className="flex items-start gap-3 px-5 py-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sunken text-text-muted">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text">
                    {describeDevice(s.userAgent)}
                    {s.current ? <Badge tone="success">This device</Badge> : null}
                  </p>
                  <p className="mt-0.5 text-[13px] text-text-muted">
                    Signed in {formatDateTime(s.signedInAt)} · active{" "}
                    <time dateTime={s.lastActiveAt} title={formatDateTime(s.lastActiveAt)}>
                      {formatRelative(s.lastActiveAt)}
                    </time>
                    {s.ip ? ` · ${s.ip}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Sign out everywhere?"
        description="Every device signed in to your account, including this one, will be signed out."
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="danger" loading={everywhere.isPending} onClick={signOutEverywhere}>
              Sign out everywhere
            </Button>
          </>
        }
      />
    </Panel>
  );
}
