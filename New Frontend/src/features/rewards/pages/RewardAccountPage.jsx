// One citizen's rewards: balance, reporting standing, payout freeze or
// exclusion, and every reward (docs/16 §7, §8). HQ supervisors freeze,
// restore or end an account's rewards with a reason.

import { ArrowLeft, Ban, Lock, LockOpen } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { formatDateTime } from "@/lib/format.js";
import { can } from "@/lib/permissions.js";
import { useCurrentUser } from "@/lib/session-context.js";
import { Alert, Badge, Button, Page, Panel, ReasonDialog, Skeleton } from "@/ui/index.js";
import { useRewardAccount, useSetAccountRewards } from "../api.js";
import { RewardList } from "../components/RewardList.jsx";
import { points } from "../lib/labels.js";

const CHANGES = {
  freeze: {
    to: { frozen: true, excluded: false },
    title: "Freeze payouts",
    description: "Points still build up, but nothing is paid out until payouts are restored.",
    confirmLabel: "Freeze",
    danger: true,
  },
  restore: {
    to: { frozen: false, excluded: false },
    title: "Restore rewards",
    description: "Payouts can go ahead again. Say what the review found.",
    confirmLabel: "Restore",
    danger: false,
  },
  exclude: {
    to: { frozen: true, excluded: true },
    title: "End this citizen's rewards",
    description:
      "For repeated fabricated evidence or staged offences. They can still report, but no report earns again.",
    confirmLabel: "End rewards",
    danger: true,
  },
};

export function RewardAccountPage() {
  const { userId = "" } = useParams();
  const user = useCurrentUser();
  const query = useRewardAccount(userId);
  const change = useSetAccountRewards(userId);
  const [open, setOpen] = useState(/** @type {keyof typeof CHANGES | null} */ (null));

  const back = (
    <Link
      to="/rewards"
      className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
    >
      <ArrowLeft className="size-4" aria-hidden /> All rewards
    </Link>
  );
  if (query.isPending)
    return (
      <Page title="Citizen's rewards" back={back}>
        <Skeleton className="h-80" />
      </Page>
    );
  if (query.isError)
    return (
      <Page title="Citizen's rewards" back={back}>
        <Alert tone="danger">{query.error.message}</Alert>
      </Page>
    );
  const a = query.data;
  const review = can(user, "rewards.review");

  return (
    <Page
      title={a.name ?? "Citizen's rewards"}
      description={`App account ${a.userId}`}
      className="max-w-[1100px]"
      back={back}
      actions={
        review ? (
          <div className="flex flex-wrap gap-2">
            {a.rewards.frozen ? (
              <Button icon={<LockOpen className="size-4" />} onClick={() => setOpen("restore")}>
                Restore
              </Button>
            ) : (
              <Button icon={<Lock className="size-4" />} onClick={() => setOpen("freeze")}>
                Freeze payouts
              </Button>
            )}
            {!a.rewards.excluded ? (
              <Button icon={<Ban className="size-4" />} onClick={() => setOpen("exclude")}>
                End rewards
              </Button>
            ) : null}
          </div>
        ) : null
      }
    >
      <div className="grid gap-5">
        <div className="flex flex-wrap gap-2">
          <Badge
            tone={a.status === "active" ? "success" : a.status === "flagged" ? "warning" : "danger"}
          >
            Reporting: {a.status}
          </Badge>
          {a.rewards.excluded ? (
            <Badge tone="danger">Rewards ended</Badge>
          ) : a.rewards.frozen ? (
            <Badge tone="warning">Payouts frozen</Badge>
          ) : null}
        </div>
        {a.rewards.reason ? (
          <Alert tone={a.rewards.frozen ? "warning" : "info"} title="Rewards">
            {a.rewards.reason}
            {a.rewards.changedBy
              ? ` · ${a.rewards.changedBy}, ${formatDateTime(a.rewards.changedAt)}`
              : ""}
          </Alert>
        ) : null}
        {a.statusReason ? (
          <Alert tone="info" title="Reporting standing">
            {a.statusReason}
          </Alert>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-4">
          <Tile label="Pending" value={a.balance.pending} hint="Includes held points" />
          <Tile label="Available" value={a.balance.available} hint="Confirmed, not held" />
          <Tile label="Expiring in 30 days" value={a.balance.expiringSoon} />
          <Tile label="Paid out" value={a.balance.paidOut} />
        </div>

        <Panel title="Rewards">
          <RewardList
            rows={a.entries}
            showCitizen={false}
            empty={{
              title: "No rewards yet",
              description: "Rewards appear when this citizen's reports lead to action.",
            }}
          />
        </Panel>
      </div>

      {open ? (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setOpen(null)}
          title={CHANGES[open].title}
          description={CHANGES[open].description}
          confirmLabel={CHANGES[open].confirmLabel}
          danger={CHANGES[open].danger}
          minLength={10}
          onConfirm={(reason) => change.mutateAsync({ ...CHANGES[open].to, reason })}
        />
      ) : null}
    </Page>
  );
}

/** @param {{ label: string, value: number, hint?: string }} props */
function Tile({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-text">{points(value)}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-text-faint">{hint}</p> : null}
    </div>
  );
}
