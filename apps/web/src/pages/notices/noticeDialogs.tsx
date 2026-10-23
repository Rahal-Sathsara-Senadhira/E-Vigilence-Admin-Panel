// Notice actions — docs/05 §5–6. Each dialog posts one action; the API checks
// the state, the role and the time limits again.

import { DISPUTE_GROUNDS, type DisputeGround, type NoticeDetail } from "@ev/shared";
import { Alert, Field, Input, Select, Textarea } from "@ev/ui";
import { useState } from "react";
import { fromLocalInput, toLocalInput } from "../../components/reportFields";
import { useNoticeAction } from "../../lib/notices";
import { ActionDialog } from "../cases/caseDialogs";

type Props = { n: NoticeDetail; onClose: () => void };

function PostingFields({
  postedAt,
  setPostedAt,
  reference,
  setReference,
}: {
  postedAt: string;
  setPostedAt: (v: string) => void;
  reference: string;
  setReference: (v: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Posted on">
        {(p) => (
          <Input
            {...p}
            type="datetime-local"
            max={toLocalInput(new Date())}
            value={postedAt}
            onChange={(e) => setPostedAt(e.target.value)}
          />
        )}
      </Field>
      <Field label="Registered-post number" hint="From the post office receipt.">
        {(p) => (
          <Input
            {...p}
            autoFocus
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="RL 123 456 789 LK"
          />
        )}
      </Field>
    </div>
  );
}

export function PostDialog({ n, onClose }: Props) {
  const [postedAt, setPostedAt] = useState(toLocalInput(new Date()));
  const [reference, setReference] = useState("");
  const action = useNoticeAction(n, onClose);
  return (
    <ActionDialog
      title="Record the posting"
      description="The notice counts as served 3 days after posting; the addressee then has 14 days to pay, name the driver or dispute."
      onClose={onClose}
      submitLabel="Record posting"
      pending={action.isPending}
      error={action.error}
      disabled={!postedAt || reference.trim().length < 3}
      submit={() =>
        action.mutate({
          path: "post",
          body: { postedAt: fromLocalInput(postedAt), postReference: reference },
        })
      }
    >
      <p className="text-sm text-muted">
        Sending to <span className="text-ink">{n.service.address}</span>
      </p>
      <PostingFields {...{ postedAt, setPostedAt, reference, setReference }} />
    </ActionDialog>
  );
}

export function ServiceFailedDialog({ n, onClose }: Props) {
  const [reason, setReason] = useState("");
  const action = useNoticeAction(n, onClose);
  return (
    <ActionDialog
      title="Not delivered"
      description="The post office returned the notice. You can re-serve it to a new address afterwards."
      onClose={onClose}
      submitLabel="Record"
      pending={action.isPending}
      error={action.error}
      disabled={reason.trim().length < 5}
      submit={() => action.mutate({ path: "service-failed", body: { reason } })}
    >
      <Field label="What the post office said">
        {(p) => (
          <Input
            {...p}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Addressee not known at this address"
          />
        )}
      </Field>
    </ActionDialog>
  );
}

export function ReserveDialog({ n, onClose }: Props) {
  const [address, setAddress] = useState("");
  const [postedAt, setPostedAt] = useState(toLocalInput(new Date()));
  const [reference, setReference] = useState("");
  const action = useNoticeAction(n, onClose);
  return (
    <ActionDialog
      title="Re-serve to a new address"
      description="The 14 days start again from the new service date."
      onClose={onClose}
      submitLabel="Re-serve"
      pending={action.isPending}
      error={action.error}
      disabled={address.trim().length < 5 || reference.trim().length < 3 || !postedAt}
      submit={() =>
        action.mutate({
          path: "reserve",
          body: { address, postedAt: fromLocalInput(postedAt), postReference: reference },
        })
      }
    >
      <Field label="New postal address">
        {(p) => (
          <Textarea {...p} rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
        )}
      </Field>
      <PostingFields {...{ postedAt, setPostedAt, reference, setReference }} />
    </ActionDialog>
  );
}

export function WithdrawDialog({ n, onClose }: Props) {
  const [reason, setReason] = useState("");
  const action = useNoticeAction(n, onClose);
  return (
    <ActionDialog
      title="Withdraw the notice"
      description="The addressee is told by letter. If it was paid, a refund is raised for approval. The case closes if nothing else is running."
      onClose={onClose}
      submitLabel="Withdraw"
      danger
      pending={action.isPending}
      error={action.error}
      disabled={reason.trim().length < 10}
      submit={() => action.mutate({ path: "withdraw", body: { reason } })}
    >
      <Field label="Reason" hint="At least 10 characters; recorded in the audit log.">
        {(p) => (
          <Textarea
            {...p}
            rows={3}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </Field>
    </ActionDialog>
  );
}

export function NominationDialog({ n, onClose }: Props) {
  const [driverName, setName] = useState("");
  const [driverId, setId] = useState("");
  const [driverAddress, setAddress] = useState("");
  const [driverPhone, setPhone] = useState("");
  const [declaration, setDeclaration] = useState(false);
  const action = useNoticeAction(n, onClose);
  return (
    <ActionDialog
      title="Record a named driver"
      description="Received by post or at the counter. The owner can name the driver once, before the due date."
      onClose={onClose}
      submitLabel="Record"
      size="lg"
      pending={action.isPending}
      error={action.error}
      disabled={
        driverName.trim().length < 2 ||
        driverId.trim().length < 6 ||
        driverAddress.trim().length < 5 ||
        !declaration
      }
      submit={() =>
        action.mutate({
          path: "nomination",
          body: {
            driverName,
            driverId,
            driverAddress,
            driverPhone: driverPhone.trim() || undefined,
            declaration,
          },
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Driver's name">
          {(p) => (
            <Input {...p} autoFocus value={driverName} onChange={(e) => setName(e.target.value)} />
          )}
        </Field>
        <Field label="NIC or driving licence number">
          {(p) => <Input {...p} value={driverId} onChange={(e) => setId(e.target.value)} />}
        </Field>
        <Field label="Postal address" className="sm:col-span-2">
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              value={driverAddress}
              onChange={(e) => setAddress(e.target.value)}
            />
          )}
        </Field>
        <Field label="Phone (optional)">
          {(p) => <Input {...p} value={driverPhone} onChange={(e) => setPhone(e.target.value)} />}
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={declaration}
          onChange={(e) => setDeclaration(e.target.checked)}
          className="mt-0.5 accent-[var(--ev-primary)]"
        />
        The owner signed the declaration that this person was driving.
      </label>
    </ActionDialog>
  );
}

export function ReviewNominationDialog({ n, onClose }: Props) {
  const [mode, setMode] = useState<"accept" | "reject">("accept");
  const [reason, setReason] = useState("");
  const action = useNoticeAction(n, onClose);
  const nom = n.nomination!;
  return (
    <ActionDialog
      title="Review the named driver"
      description="Accepting closes this notice as transferred and issues a new one to the driver, with a new 14 days."
      onClose={onClose}
      submitLabel={mode === "accept" ? "Accept and issue to the driver" : "Reject"}
      danger={mode === "reject"}
      pending={action.isPending}
      error={action.error}
      disabled={mode === "reject" && reason.trim().length < 10}
      submit={() =>
        action.mutate({
          path: "nomination/review",
          body: mode === "accept" ? { action: "accept" } : { action: "reject", reason },
        })
      }
    >
      <dl className="grid gap-2 rounded-lg border border-line p-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">Driver</dt>
          <dd className="text-ink">{nom.driverName}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">ID number</dt>
          <dd className="font-mono text-ink">{nom.driverId}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted">Address</dt>
          <dd className="text-ink">{nom.driverAddress}</dd>
        </div>
      </dl>
      <ChoiceRow
        value={mode}
        onChange={setMode}
        options={[
          ["accept", "Accept"],
          ["reject", "Reject"],
        ]}
      />
      {mode === "reject" ? (
        <Field label="Reason" hint="Sent to the owner; the original notice runs on.">
          {(p) => (
            <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
      ) : null}
    </ActionDialog>
  );
}

export function DisputeDialog({ n, onClose }: Props) {
  const [ground, setGround] = useState<DisputeGround>("evidence_wrong");
  const [explanation, setExplanation] = useState("");
  const action = useNoticeAction(n, onClose);
  return (
    <ActionDialog
      title="Record a dispute"
      description="Received by post or at the counter. One dispute per notice; the OIC reviews it."
      onClose={onClose}
      submitLabel="Record dispute"
      pending={action.isPending}
      error={action.error}
      disabled={explanation.trim().length < 20}
      submit={() => action.mutate({ path: "dispute", body: { ground, explanation } })}
    >
      <Field label="Ground">
        {(p) => (
          <Select
            {...p}
            value={ground}
            onChange={(e) => setGround(e.target.value as DisputeGround)}
          >
            {Object.entries(DISPUTE_GROUNDS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="What the addressee says" hint="At least 20 characters.">
        {(p) => (
          <Textarea
            {...p}
            rows={4}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
          />
        )}
      </Field>
    </ActionDialog>
  );
}

export function ReviewDisputeDialog({ n, onClose }: Props) {
  const [mode, setMode] = useState<"uphold" | "reject">("reject");
  const [reason, setReason] = useState("");
  const action = useNoticeAction(n, onClose);
  const d = n.dispute!;
  return (
    <ActionDialog
      title="Review the dispute"
      description="Upholding withdraws the notice and sends the case back for a new decision. Rejecting gives the addressee 7 more days."
      onClose={onClose}
      submitLabel={mode === "uphold" ? "Uphold and withdraw" : "Reject the dispute"}
      danger={mode === "uphold"}
      pending={action.isPending}
      error={action.error}
      disabled={reason.trim().length < 10}
      submit={() => action.mutate({ path: "dispute/review", body: { action: mode, reason } })}
    >
      <div className="rounded-lg border border-line p-3 text-sm">
        <p className="text-xs text-muted">{DISPUTE_GROUNDS[d.ground]}</p>
        <p className="mt-1 whitespace-pre-line text-ink">{d.explanation}</p>
      </div>
      <ChoiceRow
        value={mode}
        onChange={setMode}
        options={[
          ["reject", "Reject"],
          ["uphold", "Uphold"],
        ]}
      />
      <Field label="Reason" hint="Sent to the addressee by letter.">
        {(p) => (
          <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        )}
      </Field>
    </ActionDialog>
  );
}

export function CourtDialog({ n, onClose }: Props) {
  const action = useNoticeAction(n, onClose);
  return (
    <ActionDialog
      title="Refer to court"
      description="The addressee did not pay or respond by the final date."
      onClose={onClose}
      submitLabel="Confirm court referral"
      danger
      pending={action.isPending}
      error={action.error}
      submit={() => action.mutate({ path: "court" })}
    >
      <Alert tone="info">
        The addressee can still pay the notice until the court records a result.
      </Alert>
    </ActionDialog>
  );
}

function ChoiceRow<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="flex gap-4 text-sm">
      {options.map(([k, label]) => (
        <label key={k} className="flex items-center gap-2">
          <input
            type="radio"
            checked={value === k}
            onChange={() => onChange(k)}
            className="accent-[var(--ev-primary)]"
          />
          {label}
        </label>
      ))}
    </div>
  );
}
