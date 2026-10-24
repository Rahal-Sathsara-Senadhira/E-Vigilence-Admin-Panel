// One reward: how its points were worked out, what the citizen was told,
// why it is held or not eligible (staff only), and its history. HQ
// supervisors hold, release or reverse it, always with a reason (docs/16 §7).

import { ArrowLeft, PauseCircle, PlayCircle, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { formatDateTime } from "@/lib/format.js";
import { can } from "@/lib/permissions.js";
import { useCurrentUser } from "@/lib/session-context.js";
import { Alert, Badge, Button, Page, Panel, ReasonDialog, Skeleton } from "@/ui/index.js";
import { useReward, useRewardAction } from "../api.js";
import { STATUS, points, shareLabel } from "../lib/labels.js";

const DIALOGS = {
  hold: {
    title: "Hold this reward",
    description:
      "It stays pending or confirmed but can't be paid out until released. The citizen is told only that it is being checked.",
    confirmLabel: "Hold",
    danger: false,
  },
  release: {
    title: "Release the hold",
    description: "Say what you checked. The points carry on as before.",
    confirmLabel: "Release",
    danger: false,
  },
  reverse: {
    title: "Reverse this reward",
    description:
      "For staged offences, collusion and similar findings. Points already paid out are recovered from the citizen's future rewards.",
    confirmLabel: "Reverse",
    danger: true,
  },
};

export function RewardPage() {
  const { id = "" } = useParams();
  const user = useCurrentUser();
  const query = useReward(id);
  const action = useRewardAction(id);
  const [open, setOpen] = useState(/** @type {keyof typeof DIALOGS | null} */ (null));

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
      <Page title="Reward" back={back}>
        <Skeleton className="h-80" />
      </Page>
    );
  if (query.isError)
    return (
      <Page title="Reward" back={back}>
        <Alert tone="danger">{query.error.message}</Alert>
      </Page>
    );
  const e = query.data;
  const [label, tone] = STATUS[e.status];
  const live = e.status === "pending" || e.status === "confirmed";
  const review = can(user, "rewards.review") && e.kind === "award";

  return (
    <Page title="Reward" className="max-w-[1100px]" back={back}>
      <div className="grid gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tabular-nums text-text">{points(e.points)}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={/** @type {any} */ (tone)}>{label}</Badge>
              {e.hold && live ? (
                <Badge tone="warning">
                  <PauseCircle className="size-3" aria-hidden /> Held
                </Badge>
              ) : null}
              {e.recovered ? <Badge tone="danger">Recovered</Badge> : null}
            </div>
            <p className="mt-2 text-xs text-text-muted">
              Report{" "}
              <Link to={`/reports/${e.reportId}`} className="font-mono hover:underline">
                {e.reportNumber}
              </Link>{" "}
              · case{" "}
              <Link to={`/cases/${e.caseId}`} className="font-mono hover:underline">
                {e.caseNumber}
              </Link>
              {e.plate ? ` · ${e.plate}` : ""}
            </p>
          </div>
          {review ? (
            <div className="flex flex-wrap gap-2">
              {live && !e.hold ? (
                <Button icon={<PauseCircle className="size-4" />} onClick={() => setOpen("hold")}>
                  Hold
                </Button>
              ) : null}
              {live && e.hold ? (
                <Button
                  variant="primary"
                  icon={<PlayCircle className="size-4" />}
                  onClick={() => setOpen("release")}
                >
                  Release
                </Button>
              ) : null}
              {(live || e.status === "paid") && !e.recovered ? (
                <Button icon={<Undo2 className="size-4" />} onClick={() => setOpen("reverse")}>
                  Reverse
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {e.hold && live ? (
          <Alert
            tone="warning"
            title={e.hold.by === "Rewards" ? "Held by the reward checks" : `Held by ${e.hold.by}`}
          >
            {e.hold.reason} · {formatDateTime(e.hold.at)}
          </Alert>
        ) : null}
        {e.staffNote ? (
          <Alert tone="info" title="Why it can't earn (staff only)">
            {e.staffNote}
          </Alert>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Points">
            <dl className="grid gap-3 p-5 text-sm sm:grid-cols-2">
              <Item label="Case points">{points(e.basePoints)}</Item>
              <Item label="Share">{e.kind === "recovery" ? "Recovery" : shareLabel(e.share)}</Item>
              <Item label="Confirmed">{formatDateTime(e.confirmedAt)}</Item>
              <Item label="Expires">{formatDateTime(e.expiresAt)}</Item>
            </dl>
          </Panel>
          <Panel title="Citizen">
            <dl className="grid gap-3 p-5 text-sm">
              <Item label="Reporter">
                <Link
                  to={`/rewards/accounts/${encodeURIComponent(e.userId)}`}
                  className="text-action hover:underline"
                >
                  {e.reporterName ?? "Citizen"}
                </Link>
              </Item>
              <Item label="What they were told">{e.citizenMessage ?? "—"}</Item>
            </dl>
          </Panel>
        </div>

        <Panel title="History">
          <ol className="grid gap-3 p-5">
            {[...(e.history ?? [])].reverse().map((h, i) => (
              <li key={i} className="border-l-2 border-border pl-3 text-sm">
                <p className="text-text first-letter:uppercase">
                  {h.event.replaceAll("_", " ")}
                  {h.note ? <span className="text-text-muted"> — {h.note}</span> : null}
                </p>
                <p className="text-xs text-text-muted">
                  {h.by} · {formatDateTime(h.at)}
                </p>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      {open ? (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setOpen(null)}
          {...DIALOGS[open]}
          minLength={10}
          onConfirm={(reason) => action.mutateAsync({ action: open, reason })}
        />
      ) : null}
    </Page>
  );
}

/** @param {{ label: string, children: import("react").ReactNode }} props */
function Item({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-text">{children}</dd>
    </div>
  );
}
