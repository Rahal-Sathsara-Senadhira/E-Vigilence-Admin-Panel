// Step 5: recovery codes, shown once. The user must confirm they saved
// them before continuing.

import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/ui/index.js";
import { StepHeading } from "../components/StepHeading.jsx";

/** @param {{ codes: string[], onContinue: () => void }} props */
export function RecoveryCodesStep({ codes, onContinue }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `E-Vigilance recovery codes\nEach code signs you in once if you lose your phone.\n\n${codes.join("\n")}\n`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the codes are on screen and can be downloaded */
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "e-vigilance-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <StepHeading title="Save your recovery codes">
        If you lose your phone, each code lets you sign in once. Keep them somewhere safe — not on
        the same phone. You won&apos;t see them again.
      </StepHeading>
      <ul
        aria-label="Recovery codes"
        className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-border bg-sunken p-4 font-mono text-[15px] text-text"
      >
        {codes.map((c) => (
          <li key={c} className="tracking-wider select-all">
            {c}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          onClick={copy}
          icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" onClick={download} icon={<Download className="size-3.5" />}>
          Download
        </Button>
      </div>
      <label className="mt-6 flex items-start gap-3 text-sm text-text">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--ev-action)]"
        />
        I have saved these codes somewhere safe.
      </label>
      <Button
        variant="primary"
        size="lg"
        block
        className="mt-5"
        disabled={!saved}
        onClick={onContinue}
      >
        Continue
      </Button>
    </>
  );
}
