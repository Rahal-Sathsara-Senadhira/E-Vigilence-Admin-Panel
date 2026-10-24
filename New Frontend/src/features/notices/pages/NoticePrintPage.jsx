// The printable notice — docs/05 §5.2: number, addressee, vehicle, date and
// place, offences with the law, amount, how to respond, still images. No
// reporter details, ever. A4, black on white, whatever the screen theme.

import { ArrowLeft, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { apiBlob } from "@/lib/api.js";
import { formatDateTime } from "@/lib/format.js";
import { Alert, Button, Logo, Skeleton } from "@/ui/index.js";
import { useNoticeDocument } from "../api.js";
import { rupees } from "../lib/labels.js";

export function NoticePrintPage() {
  const { id = "" } = useParams();
  const doc = useNoticeDocument(id);

  if (doc.isPending) return <Skeleton className="m-6 h-[80vh]" />;
  if (doc.isError)
    return (
      <Alert tone="danger" className="m-6">
        {doc.error.message}
      </Alert>
    );
  const d = doc.data;
  const penalty = d.kind === "penalty";

  return (
    <div className="min-h-dvh bg-sunken py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4 print:hidden">
        <Link
          to={`/notices/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to the notice
        </Link>
        <Button
          variant="primary"
          icon={<Printer className="size-4" />}
          onClick={() => window.print()}
        >
          Print
        </Button>
      </div>
      <article className="mx-auto max-w-[210mm] bg-white p-[14mm] text-[13px] leading-relaxed text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
          <div className="flex items-center gap-3">
            <Logo className="h-10 w-16" />
            <div>
              <p className="text-base font-bold">Sri Lanka Police</p>
              <p>{d.station?.name ?? "Traffic Headquarters"}</p>
              {d.station?.address ? <p className="text-xs">{d.station.address}</p> : null}
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase">{penalty ? "Penalty notice" : "Warning"}</p>
            <p className="font-mono text-base">{d.noticeNumber}</p>
            <p className="text-xs">Issued {formatDateTime(d.issuedAt)}</p>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-bold uppercase">To</p>
            <p className="font-medium">{d.addressee.name}</p>
            <p className="whitespace-pre-line">{d.addressee.address.split(", ").join("\n")}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase">Vehicle</p>
            <p className="font-mono">{d.vehicle?.plate ?? "—"}</p>
            <p className="mt-2 text-xs font-bold uppercase">When and where</p>
            <p>
              {formatDateTime(d.occurredAt)}
              {d.place ? `, ${d.place}` : ""}
            </p>
          </div>
        </section>

        <section className="mt-6">
          <p className="text-xs font-bold uppercase">Offences</p>
          <table className="mt-1 w-full border-collapse">
            <thead>
              <tr className="border-b border-black text-left text-xs">
                <th className="py-1 pr-2">Offence</th>
                <th className="py-1 pr-2">Law</th>
                {penalty ? <th className="py-1 text-right">Fine</th> : null}
              </tr>
            </thead>
            <tbody>
              {d.offences.map((o) => (
                <tr key={o.code} className="border-b border-gray-300">
                  <td className="py-1.5 pr-2">{o.name}</td>
                  <td className="py-1.5 pr-2">{o.legalReference}</td>
                  {penalty ? (
                    <td className="py-1.5 text-right tabular-nums">{rupees(o.fine)}</td>
                  ) : null}
                </tr>
              ))}
              {penalty ? (
                <tr>
                  <td className="py-2 font-bold" colSpan={2}>
                    Amount to pay
                  </td>
                  <td className="py-2 text-right font-bold tabular-nums">{rupees(d.amount)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        {d.photoIds.length ? (
          <section className="mt-5 grid grid-cols-2 gap-3">
            {d.photoIds.map((p) => (
              <EvidencePhoto key={p} id={p} />
            ))}
          </section>
        ) : null}

        {penalty ? (
          <section className="mt-6 grid gap-3 border-t-2 border-black pt-4">
            <p>
              <span className="font-bold">Respond within 14 days of service</span>
              {d.dueDate
                ? ` — by ${formatDateTime(d.dueDate)}`
                : " (the date is set when the notice is posted; it is deemed served 3 days after posting)"}
              . You can:
            </p>
            <ol className="list-decimal pl-5">
              <li>
                <span className="font-medium">Pay</span> the full amount, quoting the notice number.
              </li>
              <li>
                <span className="font-medium">Name the driver</span>, if someone else was driving —
                once, with their name, NIC or licence number, and address. Organisations must name
                the driver.
              </li>
              <li>
                <span className="font-medium">Dispute</span> the notice, with your reasons — once.
              </li>
            </ol>
            <p>
              Use the notice number and your vehicle number to respond online, or visit{" "}
              {d.station?.name ?? "your police station"}
              {d.station?.phone ? ` (${d.station.phone})` : ""}. If you don&apos;t respond, a
              reminder follows and then the matter may go to court.
            </p>
          </section>
        ) : (
          <section className="mt-6 border-t-2 border-black pt-4">
            <p>
              This is a formal warning. No fine is payable. It is recorded on the vehicle&apos;s and
              your history; a further offence may lead to a penalty notice or court.
            </p>
          </section>
        )}
      </article>
    </div>
  );
}

/** A still image from the evidence, fetched with the sign-in token. @param {{ id: string }} props */
function EvidencePhoto({ id }) {
  const [url, setUrl] = useState(/** @type {string | null} */ (null));
  useEffect(() => {
    let made = /** @type {string | null} */ (null);
    const controller = new AbortController();
    apiBlob(`/evidence/${id}/view`, { signal: controller.signal })
      .then((blob) => {
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => {});
    return () => {
      controller.abort();
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);
  return url ? (
    <img src={url} alt="From the evidence" className="max-h-[60mm] w-full object-contain" />
  ) : (
    <div className="h-[40mm] bg-gray-100" />
  );
}
