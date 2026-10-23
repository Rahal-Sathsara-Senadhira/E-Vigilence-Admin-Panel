// Vehicle and person records — docs/04 §3–4, §7. Person records are
// personal data: every view is logged (D04-7).

import { CASE_STATUS_LABELS, type CaseStatus } from "@ev/shared";
import { Alert, Card, CardHeader, PageHeader, Skeleton, Table, Td, Th, Tr } from "@ev/ui";
import { ArrowLeft, Eye } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CaseFlags, CaseStatusBadge } from "../../components/caseBits";
import { usePerson, useVehicle } from "../../lib/cases";
import { formatDateTime } from "../../lib/format";

function Back() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(-1)}
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
    >
      <ArrowLeft className="size-4" /> Back
    </button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line px-5 py-3 text-sm last:border-b-0">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{children ?? "—"}</span>
    </div>
  );
}

function CasesTable({
  rows,
}: {
  rows: { id: string; caseNumber: string; status: string; occurredAt: string; role?: string }[];
}) {
  if (rows.length === 0) return <p className="p-5 text-sm text-muted">No cases.</p>;
  return (
    <Table>
      <thead>
        <tr>
          <Th>Case</Th>
          <Th>Date</Th>
          {rows.some((r) => r.role) ? <Th>As</Th> : null}
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.id}>
            <Td>
              <Link
                to={`/cases/${r.id}`}
                className="font-mono text-[13px] font-semibold text-primary hover:underline"
              >
                {r.caseNumber}
              </Link>
            </Td>
            <Td className="text-muted">{formatDateTime(r.occurredAt)}</Td>
            {r.role ? <Td className="text-muted">{r.role}</Td> : null}
            <Td>
              {r.status in CASE_STATUS_LABELS ? (
                <CaseStatusBadge status={r.status as CaseStatus} />
              ) : (
                r.status
              )}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

export function VehiclePage() {
  const { id = "" } = useParams();
  const v = useVehicle(id);
  if (v.isPending) return <Skeleton className="h-64" />;
  if (v.isError) return <Alert tone="danger">{(v.error as Error).message}</Alert>;
  const d = v.data;
  return (
    <>
      <Back />
      <PageHeader
        title={d.plate}
        description={[d.colour, d.make, d.model].filter(Boolean).join(" ") || "Vehicle record"}
      />
      {d.flags.length ? (
        <div className="mb-4">
          <CaseFlags flags={d.flags} />
        </div>
      ) : null}
      {d.enforcementLast12Months >= 3 ? (
        <div className="mb-4">
          <Alert tone="warning" title="Repeat offender">
            {d.enforcementLast12Months} enforcement outcomes in the last 12 months.
          </Alert>
        </div>
      ) : null}
      {d.currentOwner?.needsRecheck ? (
        <div className="mb-4">
          <Alert tone="warning">
            The owner was recorded more than 6 months ago — re-check it before using it on a new
            case.
          </Alert>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Ownership"
            description="Added, never overwritten — the owner on the offence date is responsible."
          />
          <ol className="divide-y divide-line">
            {d.ownership
              .slice()
              .reverse()
              .map((o, i) => (
                <li key={i} className="px-5 py-3 text-sm">
                  <Link
                    to={`/persons/${o.personId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {o.personName}
                  </Link>
                  <p className="text-xs text-muted">
                    {o.from ? `From ${formatDateTime(o.from)}` : "From: not known"}
                    {o.to ? ` · until ${formatDateTime(o.to)}` : " · current"}
                  </p>
                  <p className="text-xs text-muted">
                    DMT {o.dmtReference} · recorded by {o.recordedBy},{" "}
                    {formatDateTime(o.recordedAt)}
                  </p>
                </li>
              ))}
          </ol>
        </Card>
        <Card>
          <CardHeader
            title="Cases"
            description={`${d.enforcementLast12Months} enforcement outcome(s) in the last 12 months`}
          />
          <CasesTable rows={d.cases} />
        </Card>
      </div>
    </>
  );
}

export function PersonPage() {
  const { id = "" } = useParams();
  const p = usePerson(id);
  if (p.isPending) return <Skeleton className="h-64" />;
  if (p.isError) return <Alert tone="danger">{(p.error as Error).message}</Alert>;
  const d = p.data;
  return (
    <>
      <Back />
      <PageHeader
        title={d.name}
        description={d.type === "organisation" ? "Organisation" : "Person"}
      />
      <p className="mb-4 flex items-center gap-1.5 text-xs text-muted">
        <Eye className="size-3.5" /> Your view of this record is logged.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Details" />
          <Row label="NIC">{d.nic ? <span className="font-mono">{d.nic}</span> : null}</Row>
          {d.type === "organisation" ? (
            <Row label="Business registration">{d.businessRegNo}</Row>
          ) : (
            <Row label="Driving licence">{d.licenceNumber}</Row>
          )}
          <Row label="Postal address">
            {d.address ?? (
              <span className="text-danger">Not recorded — needed to serve a notice</span>
            )}
          </Row>
          <Row label="Phone">{d.phone}</Row>
          <Row label="In the register since">{formatDateTime(d.createdAt)}</Row>
        </Card>
        <Card>
          <CardHeader
            title="Cases"
            description={`${d.enforcementLast12Months} enforcement outcome(s) in the last 12 months`}
          />
          <CasesTable rows={d.cases} />
        </Card>
      </div>
    </>
  );
}
