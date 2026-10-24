// A confirmation that needs a short reason, recorded in the audit log.

import { useState } from "react";
import { Alert } from "../primitives/Alert.jsx";
import { Button } from "../primitives/Button.jsx";
import { Field } from "../primitives/Field.jsx";
import { Textarea } from "../primitives/Textarea.jsx";
import { Dialog } from "./Dialog.jsx";

/**
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   title: string,
 *   description: string,
 *   confirmLabel: string,
 *   danger?: boolean,
 *   minLength?: number,
 *   onConfirm: (reason: string) => Promise<unknown>,
 * }} props
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  danger,
  minLength = 5,
  onConfirm,
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (reason.trim().length < minLength) {
      setError(`Give a short reason (at least ${minLength} characters).`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      setReason("");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} loading={busy} onClick={confirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label="Reason" hint="Recorded in the audit log.">
        {({ invalid: _invalid, ...p }) => (
          <Textarea
            {...p}
            rows={3}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </Field>
      {error ? (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}
    </Dialog>
  );
}
