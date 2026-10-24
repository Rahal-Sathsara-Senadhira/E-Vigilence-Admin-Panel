// Record a fine paid at a cash agent, post office or bank (docs/07 §6):
// the receipt number, the full amount, the date, and a photo of the
// receipt (required). HQ reviews every one.

import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { ApiError } from "@/lib/api.js";
import { Alert, Button, Dialog, Field, Input, Select } from "@/ui/index.js";
import { useRecordReceipt } from "../api.js";
import { rupees } from "../lib/labels.js";

/** Today as a date input value, in Sri Lanka. */
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });

/** @param {{ noticeId: string, amount: number, onClose: () => void, onDone: (m: string) => void }} props */
export function RecordReceiptDialog({ noticeId, amount, onClose, onDone }) {
  const record = useRecordReceipt(noticeId);
  const input = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [file, setFile] = useState(/** @type {File | null} */ (null));
  const [v, setV] = useState({
    method: "receipt_post_office",
    receiptNumber: "",
    amount: String(amount),
    paidOn: today(),
    payerName: "",
  });
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  /** @param {keyof typeof v} k */
  const set = (k) => (/** @type {any} */ e) => setV({ ...v, [k]: e.target.value });

  async function save() {
    if (!file) return;
    setErrors({});
    try {
      await record.mutateAsync({
        file,
        fields: Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "")),
      });
      onClose();
      onDone("Receipt recorded; the notice is paid. HQ will review the receipt.");
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
      onOpenChange={(o) => !o && onClose()}
      title="Record a receipt"
      description={`The full amount, ${rupees(amount)}, paid elsewhere. A photo of the receipt is required.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={record.isPending}
            disabled={!file || !v.receiptNumber.trim()}
            onClick={save}
          >
            Record receipt
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {errors.root ? <Alert tone="danger">{errors.root}</Alert> : null}
        <Field label="Paid at" error={errors.method}>
          {(p) => (
            <Select {...p} value={v.method} onChange={set("method")}>
              <option value="receipt_post_office">Post office</option>
              <option value="receipt_bank">Bank</option>
              <option value="receipt_cash_agent">Cash agent</option>
            </Select>
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Receipt number" error={errors.receiptNumber}>
            {({ invalid, ...p }) => (
              <Input
                {...p}
                invalid={invalid}
                className="font-mono uppercase"
                value={v.receiptNumber}
                onChange={set("receiptNumber")}
              />
            )}
          </Field>
          <Field label="Amount (Rs.)" error={errors.amount}>
            {({ invalid, ...p }) => (
              <Input
                {...p}
                invalid={invalid}
                inputMode="numeric"
                value={v.amount}
                onChange={set("amount")}
              />
            )}
          </Field>
          <Field label="Paid on" error={errors.paidOn}>
            {({ invalid, ...p }) => (
              <Input
                {...p}
                invalid={invalid}
                type="date"
                max={today()}
                value={v.paidOn}
                onChange={set("paidOn")}
              />
            )}
          </Field>
          <Field label="Payer (optional)">
            {(p) => <Input {...p} value={v.payerName} onChange={set("payerName")} />}
          </Field>
        </div>
        <div>
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button icon={<Upload className="size-4" />} onClick={() => input.current?.click()}>
            {file ? file.name : "Photo of the receipt"}
          </Button>
          {errors.file ? <p className="mt-1 text-sm text-danger">{errors.file}</p> : null}
        </div>
      </div>
    </Dialog>
  );
}
