// Audit log — docs/10 §4. HQ sees everything, an OIC their station, dev
// technical events only. HQ and dev can run the chain check.

import type { AuditChainStatus, AuditEntryView } from "@ev/shared";
import { ROLE_LABELS, isStaffRole } from "@ev/shared";
import { Alert, Button, Card, EmptyState, PageHeader, Skeleton, Table, Td, Th, Tr } from "@ev/ui";
import { useMutation } from "@tanstack/react-query";
import { Link2, ScrollText, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useCurrentUser } from "../auth/AuthProvider";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { useAudit } from "../lib/queries";

function actorLabel(e: AuditEntryView) {
  const a = e.actor;
  if (a.kind === "system") return `System · ${a.label ?? "job"}`;
  if (a.kind === "anonymous") return a.label ? `Unknown (${a.label})` : "Unknown";
  if (a.role && isStaffRole(a.role)) return ROLE_LABELS[a.role];
  return a.kind;
}

export function AuditPage() {
  const me = useCurrentUser();
  const [page, setPage] = useState(1);
  const audit = useAudit(page);
  const canVerify = me.role === "hq" || me.role === "dev";
  const verify = useMutation({ mutationFn: () => api<AuditChainStatus>("/audit/verify") });
  const totalPages = audit.data
    ? Math.max(1, Math.ceil(audit.data.total / audit.data.pageSize))
    : 1;

  return (
    <>
      <PageHeader
        title="Audit log"
        description={
          me.role === "station_oic"
            ? "Actions taken by your station's staff."
            : me.role === "dev"
              ? "Technical events: sign-ins, accounts, settings and system jobs."
              : "Every sign-in and change, newest first. Entries can't be edited or deleted."
        }
        actions={
          canVerify ? (
            <Button
              icon={<Link2 className="size-4" />}
              loading={verify.isPending}
              onClick={() => verify.mutate()}
            >
              Check the chain
            </Button>
          ) : null
        }
      />

      {verify.data ? (
        <div className="mb-4">
          {verify.data.ok ? (
            <Alert tone="success" title="Chain intact">
              All {verify.data.checked.toLocaleString("en-GB")} entries match their fingerprints.
              Checked {formatDateTime(verify.data.checkedAt)}.
            </Alert>
          ) : (
            <Alert tone="danger" title="Chain broken">
              Entry {verify.data.brokenAtSeq} doesn't match. An entry may have been edited or
              removed — report this to the developers immediately.
            </Alert>
          )}
        </div>
      ) : verify.isError ? (
        <div className="mb-4">
          <Alert tone="danger">{(verify.error as Error).message}</Alert>
        </div>
      ) : null}

      <Card>
        {audit.isPending ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : audit.isError ? (
          <div className="p-4">
            <Alert tone="danger">{(audit.error as Error).message}</Alert>
          </div>
        ) : audit.data.items.length === 0 ? (
          <EmptyState icon={<ScrollText className="size-5" />} title="No entries yet" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th className="w-16">#</Th>
                  <Th>When</Th>
                  <Th>Who</Th>
                  <Th>What</Th>
                  <Th>Record</Th>
                  <Th>From</Th>
                </tr>
              </thead>
              <tbody>
                {audit.data.items.map((e) => (
                  <Tr key={e.seq}>
                    <Td className="font-mono text-xs text-muted tabular-nums">{e.seq}</Td>
                    <Td className="whitespace-nowrap text-muted">{formatDateTime(e.at)}</Td>
                    <Td className="whitespace-nowrap">{actorLabel(e)}</Td>
                    <Td>
                      <p className="flex items-center gap-1.5">
                        {e.action.endsWith("_failed") || e.action.endsWith("_reuse") ? (
                          <ShieldAlert
                            className="size-4 shrink-0 text-danger"
                            aria-label="Security event"
                          />
                        ) : e.action === "audit.chain_checked" ? (
                          <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden />
                        ) : null}
                        {e.summary}
                      </p>
                      <p className="font-mono text-xs text-muted">{e.action}</p>
                      {e.reason ? (
                        <p className="mt-1 text-xs text-ink">Reason: {e.reason}</p>
                      ) : null}
                    </Td>
                    <Td className="text-muted">
                      {e.target?.label ?? (e.target ? e.target.type : "—")}
                    </Td>
                    <Td className="font-mono text-xs whitespace-nowrap text-muted">
                      {e.source.app ?? "—"}
                      {e.source.ip ? ` · ${e.source.ip}` : ""}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-muted">
              <span className="tabular-nums">
                {audit.data.total.toLocaleString("en-GB")} entries
              </span>
              {totalPages > 1 ? (
                <div className="flex items-center gap-2">
                  <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Newer
                  </Button>
                  <span className="tabular-nums">
                    Page {page} of {totalPages}
                  </span>
                  <Button size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                    Older
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </Card>
    </>
  );
}
