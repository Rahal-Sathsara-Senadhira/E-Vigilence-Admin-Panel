// On the notice record: the named driver and the dispute, their reviews,
// and recording a response received at the station.

import { CheckCircle2, MessageSquareWarning, UserRoundCheck, XCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { ApiError } from "@/lib/api.js";
import { formatDateTime } from "@/lib/format.js";
import { Alert, Badge, Button, Dialog, Panel, ReasonDialog, cn } from "@/ui/index.js";
import { useNoticeAction } from "../api.js";
import { DISPUTE_GROUNDS } from "../lib/labels.js";
import { EMPTY_DISPUTE, EMPTY_DRIVER, driverBody } from "../lib/responses.js";
import { DisputeFields, DriverFields } from "./ResponseForms.jsx";

/** @typedef {import("../api.js").NoticeRecord} NoticeRecord */

/** @param {{ n: NoticeRecord, onDone: (m: string) => void, onOpenNotice: (id: string) => void }} props */
export function Responses({ n, onDone, onOpenNotice }) {
  const action = useNoticeAction(n.id);
  const [open, setOpen] = useState(
    /** @type {"record" | "rejectNomination" | "uphold" | "rejectDispute" | null} */ (null),
  );
  const nom = n.nomination;
  const dis = n.dispute;
  if (!nom && !dis && !n.can.recordNomination && !n.can.recordDispute && !n.parentNoticeId)
    return null;

  return (
    <Panel title="Responses" description="Naming the driver and disputes (docs/05 §6.2, §6.3).">
      <div className="grid gap-4 p-5 text-sm">
        {n.parentNoticeId ? (
          <p className="text-text-muted">
            Reissued to the driver named on{" "}
            <Link to={`/notices/${n.parentNoticeId}`} className="text-action hover:underline">
              the owner&apos;s notice
            </Link>
            . The driver can pay or dispute; they can&apos;t name someone else.
          </p>
        ) : null}

        {nom ? (
          <section className="grid gap-1 rounded-lg border border-border p-4">
            <p className="flex items-center gap-2 font-medium text-text">
              <UserRoundCheck className="size-4 text-text-muted" aria-hidden /> Driver named by the
              owner
              {nom.review ? (
                <Badge tone={nom.review.result === "accepted" ? "success" : "neutral"}>
                  {nom.review.result === "accepted" ? "Accepted" : "Rejected"}
                </Badge>
              ) : (
                <Badge tone="warning">To review</Badge>
              )}
            </p>
            <p>
              {nom.driver.name}
              {nom.driver.nic ? (
                <span className="ml-2 font-mono text-xs">NIC {nom.driver.nic}</span>
              ) : null}
              {nom.driver.licenceNumber ? (
                <span className="ml-2 font-mono text-xs">Licence {nom.driver.licenceNumber}</span>
              ) : null}
            </p>
            {nom.driver.address ? <p className="text-text-muted">{nom.driver.address}</p> : null}
            <p className="text-xs text-text-muted">
              {nom.via === "online" ? "Online" : `At the station, recorded by ${nom.recordedBy}`} ·{" "}
              {formatDateTime(nom.at)}
            </p>
            {nom.review ? (
              <p className="text-xs text-text-muted">
                {nom.review.by}, {formatDateTime(nom.review.at)}
                {nom.review.reason ? ` — “${nom.review.reason}”` : ""}
                {nom.childNoticeId ? (
                  <button
                    type="button"
                    className="ml-2 text-action underline"
                    onClick={() => onOpenNotice(nom.childNoticeId ?? "")}
                  >
                    Open the driver&apos;s notice
                  </button>
                ) : null}
              </p>
            ) : null}
            {n.can.reviewNomination ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  icon={<CheckCircle2 className="size-4" />}
                  loading={action.isPending}
                  onClick={async () => {
                    const child = /** @type {{ id: string }} */ (
                      await action.mutateAsync({
                        action: "nomination-review",
                        body: { result: "accepted" },
                      })
                    );
                    onDone("Driver accepted; the notice is reissued to them.");
                    onOpenNotice(child.id);
                  }}
                >
                  Accept — reissue to the driver
                </Button>
                <Button
                  size="sm"
                  icon={<XCircle className="size-4" />}
                  onClick={() => setOpen("rejectNomination")}
                >
                  Can&apos;t identify — reject
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}

        {dis ? (
          <section className="grid gap-1 rounded-lg border border-border p-4">
            <p className="flex items-center gap-2 font-medium text-text">
              <MessageSquareWarning className="size-4 text-text-muted" aria-hidden /> Disputed:{" "}
              {DISPUTE_GROUNDS[/** @type {keyof typeof DISPUTE_GROUNDS} */ (dis.grounds)] ??
                dis.grounds}
              {dis.review ? (
                <Badge tone={dis.review.result === "upheld" ? "success" : "neutral"}>
                  {dis.review.result === "upheld" ? "Upheld" : "Rejected"}
                </Badge>
              ) : (
                <Badge tone="warning">Review by {formatDateTime(dis.reviewBy)}</Badge>
              )}
            </p>
            <p className="whitespace-pre-line text-text">{dis.explanation}</p>
            <p className="text-xs text-text-muted">
              {dis.via === "online" ? "Online" : `At the station, recorded by ${dis.recordedBy}`} ·{" "}
              {formatDateTime(dis.at)}
            </p>
            {dis.review ? (
              <p className="text-xs text-text-muted">
                {dis.review.by}, {formatDateTime(dis.review.at)} — “{dis.review.reasons}”
              </p>
            ) : null}
            {n.can.disputeReviewBlocked ? (
              <Alert tone="info" className="mt-2">
                You decided or served this notice, so someone else reviews the dispute (S8).
              </Alert>
            ) : null}
            {n.can.reviewDispute ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="primary" onClick={() => setOpen("uphold")}>
                  Uphold — withdraw the notice
                </Button>
                <Button size="sm" onClick={() => setOpen("rejectDispute")}>
                  Reject — 7 more days
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}

        {n.can.recordNomination || n.can.recordDispute ? (
          <div>
            <Button size="sm" onClick={() => setOpen("record")}>
              Record a response received at the station
            </Button>
          </div>
        ) : null}
      </div>

      {open === "record" ? (
        <RecordDialog n={n} onClose={() => setOpen(null)} onDone={onDone} />
      ) : null}
      <ReasonDialog
        open={open === "rejectNomination"}
        onOpenChange={(o) => setOpen(o ? "rejectNomination" : null)}
        title="Reject the named driver?"
        description="The owner's notice continues with its due date."
        confirmLabel="Reject"
        minLength={10}
        onConfirm={async (reason) => {
          await action.mutateAsync({
            action: "nomination-review",
            body: { result: "rejected", reason },
          });
          onDone("Named driver rejected.");
        }}
      />
      <ReasonDialog
        open={open === "uphold"}
        onOpenChange={(o) => setOpen(o ? "uphold" : null)}
        title="Uphold the dispute?"
        description="The notice is withdrawn and the case goes back for a new decision."
        confirmLabel="Uphold"
        minLength={10}
        onConfirm={async (reasons) => {
          await action.mutateAsync({
            action: "dispute-review",
            body: { result: "upheld", reasons },
          });
          onDone("Dispute upheld; the notice is withdrawn.");
        }}
      />
      <ReasonDialog
        open={open === "rejectDispute"}
        onOpenChange={(o) => setOpen(o ? "rejectDispute" : null)}
        title="Reject the dispute?"
        description="Your reasons are shown to the addressee, who has 7 more days to pay before court."
        confirmLabel="Reject"
        minLength={10}
        onConfirm={async (reasons) => {
          await action.mutateAsync({
            action: "dispute-review",
            body: { result: "rejected", reasons },
          });
          onDone("Dispute rejected; 7 more days to pay.");
        }}
      />
    </Panel>
  );
}

/** @param {{ n: NoticeRecord, onClose: () => void, onDone: (m: string) => void }} props */
function RecordDialog({ n, onClose, onDone }) {
  const action = useNoticeAction(n.id);
  const [type, setType] = useState(n.can.recordNomination ? "nomination" : "dispute");
  const [driver, setDriver] = useState(EMPTY_DRIVER);
  const [dispute, setDispute] = useState(EMPTY_DISPUTE);
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));

  async function save() {
    setErrors({});
    try {
      await action.mutateAsync({
        action: "responses",
        body: type === "nomination" ? { type, driver: driverBody(driver) } : { type, ...dispute },
      });
      onClose();
      onDone(
        type === "nomination"
          ? "Named driver recorded for review."
          : "Dispute recorded for review.",
      );
    } catch (err) {
      setErrors(
        err instanceof ApiError && Object.keys(err.fields).length
          ? err.fields
          : { root: err instanceof Error ? err.message : "Please try again." },
      );
    }
  }

  return (
    <Dialog
      open
      size="md"
      onOpenChange={(o) => !o && onClose()}
      title="Record a response"
      description="Received at the counter or by post."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={action.isPending} onClick={save}>
            Record
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {errors.root ? <Alert tone="danger">{errors.root}</Alert> : null}
        <div className="flex gap-2" role="radiogroup" aria-label="Response">
          {[
            ["nomination", "The owner names the driver", n.can.recordNomination],
            ["dispute", "A dispute", n.can.recordDispute],
          ].map(([k, l, ok]) => (
            <button
              key={String(k)}
              type="button"
              role="radio"
              aria-checked={type === k}
              disabled={!ok}
              onClick={() => setType(String(k))}
              className={cn(
                "flex-1 rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40",
                type === k && "border-action bg-action-soft font-medium",
              )}
            >
              {l}
            </button>
          ))}
        </div>
        {type === "nomination" ? (
          <DriverFields value={driver} onChange={setDriver} errors={errors} />
        ) : (
          <DisputeFields value={dispute} onChange={setDispute} errors={errors} />
        )}
      </div>
    </Dialog>
  );
}
