// The temporary password, shown once after creating an account or resetting
// a password. The account manager gives it to the person directly; they
// choose their own at the next sign-in (docs/20 §9).

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Dialog } from "@/ui/index.js";

/**
 * @param {{ open: boolean, onClose: () => void, name: string, signInId: string, password: string, created: boolean }} props
 */
export function TemporaryPasswordDialog({ open, onClose, name, signInId, password, created }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the password is on screen to read out */
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={created ? "Account created" : "Password reset"}
      description={`Give ${name} this temporary password in person or by phone. They'll choose their own when they sign in.`}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <dl className="grid gap-3 rounded-lg border border-border bg-sunken p-4 text-sm">
        <div>
          <dt className="text-xs text-text-muted">Sign in with</dt>
          <dd className="mt-0.5 font-medium text-text">{signInId}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Temporary password</dt>
          <dd className="mt-1 flex items-center justify-between gap-3">
            <span className="font-mono text-lg tracking-wider text-text select-all">
              {password}
            </span>
            <Button
              size="sm"
              onClick={copy}
              icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </dd>
        </div>
      </dl>
      <Alert tone="warning" className="mt-4">
        This password won&apos;t be shown again. Don&apos;t send it by email or leave it in a chat.
      </Alert>
    </Dialog>
  );
}
