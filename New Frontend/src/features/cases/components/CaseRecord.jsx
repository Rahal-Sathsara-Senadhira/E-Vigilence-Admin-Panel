// One case — where it is, who is responsible, what HQ concluded, its
// reports, notes and history; and the actions the backend allows (`can`).

import {
  CheckCircle2,
  ChevronDown,
  FolderOpen,
  Merge,
  RotateCcw,
  Send,
  Undo2,
  UserRoundCog,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { formatDateTime } from "@/lib/format.js";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Field,
  Input,
  Menu,
  MenuItem,
  Panel,
  ReasonDialog,
  Skeleton,
  Textarea,
} from "@/ui/index.js";
import { useCase, useCaseAction } from "../api.js";
import { AssignOfficerDialog, DispatchDialog } from "../actions/CaseActions.jsx";
import { DISPATCH_METHODS, DISPATCH_WARNINGS, TIMELINE_EVENTS } from "../lib/labels.js";
import { CaseStatus, DeadlineClock, PriorityBadge } from "./CaseBadges.jsx";
import { Investigation } from "./Investigation.jsx";
import { LifecycleBar } from "./LifecycleBar.jsx";
import { Outcome } from "./Outcome.jsx";
import { NoticeList, useNotices } from "@/features/notices/index.js";

/** @typedef {"dispatch" | "return" | "officer" | "override" | "reopen" | "merge" | null} Open */

/** @param {Record<string, string>} map @param {string} key */
const say = (map, key) => map[key] ?? key.replaceAll("_", " ");

/** @param {{ id: string, onGone?: () => void }} props */
export function CaseRecord({ id, onGone }) {
  const query = useCase(id);
  const action = useCaseAction(id);
  const [open, setOpen] = useState(/** @type {Open} */ (null));
  const [notice, setNotice] = useState(/** @type {string | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));

  if (query.isPending) return <Skeleton className="h-96" />;
  if (query.isError) return <Alert tone="danger">{query.error.message}</Alert>;
  const c = query.data;
  const current = c.dispatches.at(-1);
  const atStation = current && !current.endedAt ? current : null;

  async function accept() {
    setError(null);
    try {
      await action.mutateAsync({ action: "accept" });
      setNotice("Accepted. You are the investigating officer.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-mono text-xl font-semibold text-text">{c.caseNumber}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <CaseStatus status={c.status} disputed={c.disputed} />
            <PriorityBadge priority={c.priority} />
            <DeadlineClock deadline={c.deadline} />
          </div>
          <p className="mt-2 text-xs text-text-muted">
            Opened {formatDateTime(c.openedAt)}
            {c.openedBy ? ` by ${c.openedBy}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.can.accept ? (
            <Button
              variant="primary"
              icon={<CheckCircle2 className="size-4" />}
              loading={action.isPending}
              onClick={accept}
            >
              Accept
            </Button>
          ) : null}
          {c.can.return ? (
            <Button icon={<Undo2 className="size-4" />} onClick={() => setOpen("return")}>
              Return to HQ
            </Button>
          ) : null}
          {c.can.dispatch ? (
            <Button
              variant={c.station ? "secondary" : "primary"}
              icon={<Send className="size-4" />}
              onClick={() => setOpen("dispatch")}
            >
              {c.station ? "Re-dispatch" : "Dispatch"}
            </Button>
          ) : null}
          {c.can.assignOfficer ? (
            <Button
              variant={c.officer?.active ? "secondary" : "primary"}
              icon={<UserRoundCog className="size-4" />}
              onClick={() => setOpen("officer")}
            >
              {c.officer ? "Change officer" : "Assign officer"}
            </Button>
          ) : null}
          {c.can.override || c.can.reopen || c.can.merge ? (
            <Menu
              trigger={
                <Button>
                  HQ <ChevronDown className="size-4" aria-hidden />
                </Button>
              }
            >
              {c.can.override ? (
                <MenuItem icon={<RotateCcw />} onSelect={() => setOpen("override")}>
                  Override the decision
                </MenuItem>
              ) : null}
              {c.can.reopen ? (
                <MenuItem icon={<FolderOpen />} onSelect={() => setOpen("reopen")}>
                  Reopen the case
                </MenuItem>
              ) : null}
              {c.can.merge ? (
                <MenuItem icon={<Merge />} onSelect={() => setOpen("merge")}>
                  Merge into another case
                </MenuItem>
              ) : null}
            </Menu>
          ) : null}
        </div>
      </div>

      <LifecycleBar status={c.status} />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {c.mergedInto ? (
        <Alert tone="info" title="Merged">
          This case was merged into{" "}
          <Link to={`/cases/${c.mergedInto.id}`} className="font-mono font-medium hover:underline">
            {c.mergedInto.caseNumber}
          </Link>
          .
        </Alert>
      ) : null}
      {c.repeatOffender ? (
        <Alert tone="danger" title="Repeat offender">
          {[
            c.repeatOffender.vehicle >= 3
              ? `The vehicle has ${c.repeatOffender.vehicle} enforcement outcomes in the last 12 months.`
              : null,
            c.repeatOffender.person >= 3
              ? `The person has ${c.repeatOffender.person} enforcement outcomes in the last 12 months.`
              : null,
          ]
            .filter(Boolean)
            .join(" ")}{" "}
          Consider this in the outcome.
        </Alert>
      ) : null}
      {c.disputed ? (
        <Alert tone="warning" title="Disputed jurisdiction">
          Returned by two stations. HQ chooses the station; it can&apos;t be returned again — the
          station can write a note to HQ instead.
        </Alert>
      ) : null}
      {c.status === "returned" && current?.endNote ? (
        <Alert tone="danger" title={`Returned by ${current.station.name}`}>
          “{current.endNote}”
        </Alert>
      ) : null}
      {atStation && atStation.warnings.length ? (
        <Alert tone="warning" title="Dispatch warnings">
          {atStation.warnings.map((w) => say(DISPATCH_WARNINGS, w)).join(" · ")}
        </Alert>
      ) : null}
      {["accepted", "investigating"].includes(c.status) && !c.officer?.active ? (
        <Alert tone="warning" title="Needs an investigating officer">
          {c.officer
            ? `${c.officer.name} is no longer active at this station.`
            : c.can.assignOfficer
              ? "Choose one with “Assign officer”."
              : "The OIC assigns one."}
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="What HQ concluded">
          <dl className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2">
            <Item label="Offences" wide>
              <ul className="flex flex-wrap gap-1.5">
                {c.facts.offenceCodes.map((code) => (
                  <li key={code}>
                    <Badge className="font-mono">{code}</Badge>
                  </li>
                ))}
              </ul>
            </Item>
            <Item label="Vehicle">
              {c.facts.plateUnknown ? (
                "Plate unknown"
              ) : (
                <span className="font-mono">{c.facts.vehicleNumber}</span>
              )}
              {c.facts.vehicleType ? ` · ${c.facts.vehicleType.replace("_", "-")}` : ""}
            </Item>
            <Item label="When">{formatDateTime(c.facts.occurredAt)}</Item>
            <Item label="Where" wide>
              {c.facts.address ?? "—"}
              {c.facts.location ? (
                <span className="ml-2 font-mono text-xs text-text-muted">
                  {c.facts.location.lat.toFixed(5)}, {c.facts.location.lng.toFixed(5)}
                </span>
              ) : (
                <span className="ml-2 text-xs text-warning">No map position</span>
              )}
            </Item>
            {c.noEvidenceReason ? (
              <Item label="Accepted without evidence because" wide>
                {c.noEvidenceReason}
              </Item>
            ) : null}
          </dl>
        </Panel>

        <Panel title="Responsibility">
          <dl className="grid gap-4 p-5 text-sm">
            <Item label="Station">
              {c.station?.name ?? (c.status === "returned" ? "Returned to HQ" : "Not dispatched")}
            </Item>
            {atStation ? (
              <Item label="How it got there">
                {say(DISPATCH_METHODS, atStation.method)}
                {atStation.distanceKm !== null ? ` · ${atStation.distanceKm} km` : ""}
                <span className="block text-xs text-text-muted">
                  {formatDateTime(atStation.at)} · {atStation.by}
                </span>
              </Item>
            ) : null}
            <Item label="Investigating officer">
              {c.officer ? (
                <>
                  {c.officer.name}
                  {!c.officer.active ? (
                    <Badge tone="warning" className="ml-2">
                      Not active
                    </Badge>
                  ) : null}
                </>
              ) : (
                "—"
              )}
            </Item>
            <Item label="Reports">
              <ul className="grid gap-1">
                {c.reports.map((r) => (
                  <li key={r.id}>
                    <Link to={`/reports/${r.id}`} className="font-mono text-action hover:underline">
                      {r.reportNumber}
                    </Link>
                  </li>
                ))}
              </ul>
            </Item>
          </dl>
        </Panel>
      </div>

      {["accepted", "investigating", "recommended", "decided", "closed"].includes(c.status) ? (
        <Investigation c={c} />
      ) : null}

      <Outcome c={c} onNotice={setNotice} />

      {c.decision && ["penalty_notice", "warning"].includes(c.decision.outcome) ? (
        <CaseNotices caseNumber={c.caseNumber} />
      ) : null}

      <Notes c={c} onError={setError} />

      {c.dispatches.length ? (
        <Panel title="Dispatches">
          <ol className="divide-y divide-border text-sm">
            {c.dispatches.map((d, i) => (
              <li key={i} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:justify-between">
                <span>
                  <span className="font-medium text-text">{d.station.name}</span>
                  <span className="ml-2 text-xs text-text-muted">
                    {say(DISPATCH_METHODS, d.method)}
                    {d.reason ? ` — ${d.reason}` : ""}
                  </span>
                </span>
                <span className="text-xs text-text-muted">
                  {formatDateTime(d.at)}
                  {d.acceptedAt ? ` · accepted by ${d.acceptedBy}` : ""}
                  {d.endReason
                    ? ` · ${d.endReason === "redispatched" ? "moved" : d.endReason}`
                    : ""}
                  {d.endNote && d.endReason === "returned" ? `: “${d.endNote}”` : ""}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}

      <Panel title="History">
        <ol className="grid gap-3 p-5">
          {[...c.timeline].reverse().map((e, i) => (
            <li key={i} className="border-l-2 border-border pl-3 text-sm">
              <p className="text-text">
                {say(TIMELINE_EVENTS, e.event)}
                {e.note ? <span className="text-text-muted"> — {e.note}</span> : null}
              </p>
              <p className="text-xs text-text-muted">
                {e.by} · {formatDateTime(e.at)}
              </p>
            </li>
          ))}
        </ol>
      </Panel>

      {c.can.dispatch ? (
        <DispatchDialog
          key={`dispatch-${open === "dispatch"}`}
          c={c}
          open={open === "dispatch"}
          onOpenChange={(o) => setOpen(o ? "dispatch" : null)}
          onDone={setNotice}
        />
      ) : null}
      {c.can.assignOfficer ? (
        <AssignOfficerDialog
          key={`officer-${open === "officer"}`}
          c={c}
          open={open === "officer"}
          onOpenChange={(o) => setOpen(o ? "officer" : null)}
          onDone={setNotice}
        />
      ) : null}
      <ReasonDialog
        open={open === "return"}
        onOpenChange={(o) => setOpen(o ? "return" : null)}
        title="Return this case to HQ?"
        description="Only if it isn't your station's area, and before any work is recorded. A case returned twice becomes “disputed” and HQ chooses the station."
        confirmLabel="Return to HQ"
        danger
        minLength={10}
        onConfirm={async (reason) => {
          await action.mutateAsync({ action: "return", body: { reason } });
          onGone?.();
        }}
      />
      <ReasonDialog
        open={open === "override"}
        onOpenChange={(o) => setOpen(o ? "override" : null)}
        title="Override the decision?"
        description="The case returns to “waiting for decision”. A running outcome stops (a penalty notice is withdrawn)."
        confirmLabel="Override"
        danger
        minLength={10}
        onConfirm={async (reason) => {
          await action.mutateAsync({ action: "override", body: { reason } });
          setNotice("Decision overridden.");
        }}
      />
      <ReasonDialog
        open={open === "reopen"}
        onOpenChange={(o) => setOpen(o ? "reopen" : null)}
        title="Reopen this case?"
        description="It goes back to the station for more investigation. Finished outcomes stay as they are."
        confirmLabel="Reopen"
        minLength={10}
        onConfirm={async (reason) => {
          await action.mutateAsync({ action: "reopen", body: { reason } });
          setNotice("Case reopened.");
        }}
      />
      {open === "merge" ? <MergeDialog c={c} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

/**
 * HQ merges this case into another describing the same incident
 * (docs/03 §7). This case closes; its reports and work move.
 * @param {{ c: import("../api.js").CaseRecord, onClose: () => void }} props
 */
function MergeDialog({ c, onClose }) {
  const action = useCaseAction(c.id);
  const navigate = useNavigate();
  const [into, setInto] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState(/** @type {string | null} */ (null));
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Merge ${c.caseNumber} into another case`}
      description="Both cases must be undecided. This one closes; its reports, evidence, statements and notes move."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={action.isPending}
            disabled={!into.trim() || reason.trim().length < 10}
            onClick={async () => {
              setError(null);
              try {
                const merged = /** @type {{ id: string }} */ (
                  await action.mutateAsync({
                    action: "merge",
                    body: { intoCaseNumber: into.trim(), reason: reason.trim() },
                  })
                );
                onClose();
                navigate(`/cases/${merged.id}`);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Please try again.");
              }
            }}
          >
            Merge
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Case to keep" hint="e.g. TC-2026-000123">
          {(p) => (
            <Input
              {...p}
              className="font-mono uppercase"
              value={into}
              onChange={(e) => setInto(e.target.value)}
            />
          )}
        </Field>
        <Field label="Reason" hint="10 characters or more.">
          {(p) => (
            <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

/**
 * Notes: the officer's and OIC's work on the case, and HQ's messages.
 * @param {{ c: import("../api.js").CaseRecord, onError: (m: string | null) => void }} props
 */
function Notes({ c, onError }) {
  const action = useCaseAction(c.id);
  const [text, setText] = useState("");
  async function add() {
    onError(null);
    try {
      await action.mutateAsync({ action: "notes", body: { text } });
      setText("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Please try again.");
    }
  }
  if (!c.notes.length && !c.can.addNote) return null;
  return (
    <Panel title="Notes" description="Visible to the station and HQ.">
      {c.notes.length ? (
        <ul className="divide-y divide-border">
          {c.notes.map((n, i) => (
            <li key={i} className="px-5 py-3 text-sm">
              <p className="whitespace-pre-line text-text">{n.text}</p>
              <p className="mt-1 text-xs text-text-muted">
                {n.side === "hq" ? <Badge className="mr-1.5">HQ</Badge> : null}
                {n.by} · {formatDateTime(n.at)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {c.can.addNote ? (
        <div className="grid gap-2 border-t border-border p-4">
          <Textarea
            aria-label="New note"
            rows={2}
            placeholder={
              c.can.addNote === "hq"
                ? "A note to the station…"
                : c.status === "accepted"
                  ? "What you did or found — your first note starts the investigation."
                  : "What you did or found…"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="primary"
              loading={action.isPending}
              disabled={text.trim().length < 2}
              onClick={add}
            >
              Add note
            </Button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

/** @param {{ label: string, children: import("react").ReactNode, wide?: boolean }} props */
function Item({ label: l, children, wide }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-medium text-text-muted">{l}</dt>
      <dd className="mt-1 text-text">{children}</dd>
    </div>
  );
}

/** The notices and warning letters issued on the case. @param {{ caseNumber: string }} props */
function CaseNotices({ caseNumber }) {
  const navigate = useNavigate();
  const list = useNotices({ view: "all", q: caseNumber, page: 1 });
  return (
    <Panel title="Notices">
      <NoticeList
        query={list}
        onSelect={(id) => navigate(`/notices/${id}`)}
        onPage={() => {}}
        empty={{
          title: "No notice yet",
          description: "It is issued when the decision is approved.",
        }}
      />
    </Panel>
  );
}
