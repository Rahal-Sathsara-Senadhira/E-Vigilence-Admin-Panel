// The evidence bundle for court — docs/06 §6: every item on the case, with
// its fingerprint (SHA-256), so the court can check the original files.
// Generating it is logged. A4, black on white.

import { ArrowLeft, Printer } from "lucide-react";
import { Link, useParams } from "react-router";
import { formatDateTime } from "@/lib/format.js";
import { Alert, Button, Skeleton } from "@/ui/index.js";
import { useBundle } from "../api.js";

export function BundlePrintPage() {
  const { id = "" } = useParams();
  const bundle = useBundle(id);
  if (bundle.isPending) return <Skeleton className="m-6 h-[80vh]" />;
  if (bundle.isError)
    return (
      <Alert tone="danger" className="m-6">
        {bundle.error.message}
      </Alert>
    );
  const b = bundle.data;
  return (
    <div className="min-h-dvh bg-sunken py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4 print:hidden">
        <Link
          to={`/court/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to the court case
        </Link>
        <Button
          variant="primary"
          icon={<Printer className="size-4" />}
          onClick={() => window.print()}
        >
          Print
        </Button>
      </div>
      <article className="mx-auto max-w-[210mm] bg-white p-[14mm] text-[12px] leading-relaxed text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="border-b-2 border-black pb-3">
          <p className="text-base font-bold">Sri Lanka Police — Evidence bundle</p>
          <p>
            {b.courtRef}
            {b.courtCaseNumber ? ` · ${b.courtName ?? "Court"} case ${b.courtCaseNumber}` : ""} ·
            police case {b.caseNumber}
          </p>
        </header>
        <section className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase">Accused</p>
            <p>{b.accused ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase">Offence date and place</p>
            <p>
              {formatDateTime(b.occurredAt)}
              {b.place ? `, ${b.place}` : ""}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-[10px] font-bold uppercase">Charges</p>
            <ul>
              {b.charges.map((c) => (
                <li key={c.code}>
                  {c.name} ({c.legalReference})
                </li>
              ))}
            </ul>
          </div>
        </section>
        <table className="mt-5 w-full border-collapse">
          <thead>
            <tr className="border-b border-black text-left text-[10px] uppercase">
              <th className="py-1 pr-2">No.</th>
              <th className="py-1 pr-2">Item</th>
              <th className="py-1 pr-2">Received</th>
              <th className="py-1">Fingerprint (SHA-256)</th>
            </tr>
          </thead>
          <tbody>
            {b.items.map((e) => (
              <tr key={e.id} className="border-b border-gray-300 align-top">
                <td className="py-1.5 pr-2">{e.no}</td>
                <td className="py-1.5 pr-2">
                  {e.kind}, {e.mime}, {Math.ceil(e.size / 1024).toLocaleString()} KB
                  {e.originalName ? <span className="block">{e.originalName}</span> : null}
                  <span className="block text-[10px]">
                    {e.source}
                    {e.capturedInApp === false ? " · picked from the phone's gallery" : ""}
                  </span>
                </td>
                <td className="py-1.5 pr-2">{formatDateTime(e.receivedAt)}</td>
                <td className="py-1.5 font-mono text-[10px] break-all">{e.sha256}</td>
              </tr>
            ))}
            {b.items.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-3">
                  No evidence on this case.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <p className="mt-5 text-[10px]">
          The original files are kept unchanged; each one&apos;s fingerprint above can be recomputed
          to show it is the same file. Generated {formatDateTime(b.generatedAt)} by {b.generatedBy}.
        </p>
      </article>
    </div>
  );
}
