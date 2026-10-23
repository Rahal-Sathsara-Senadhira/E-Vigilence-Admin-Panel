// System health for dev — docs/12 §4.5. Technical figures only, no case data.
// Job queues and the mobile-app import are added in phase 5.

import { Alert, Card, CardHeader, PageHeader, Skeleton, StatusBadge } from "@ev/ui";
import type { ReactNode } from "react";
import { formatDateTime } from "../lib/format";
import { useSystemHealth } from "../lib/queries";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3 last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-medium text-ink tabular-nums">{children}</span>
    </div>
  );
}

function uptime(seconds: number) {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  return d > 0 ? `${d} d ${h} h` : h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function SystemPage() {
  const health = useSystemHealth();

  return (
    <>
      <PageHeader title="System health" description="Refreshes every 30 seconds." />
      {health.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : health.isError ? (
        <Alert tone="danger">{(health.error as Error).message}</Alert>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader title="API server" />
            <Row label="Uptime">{uptime(health.data.uptimeSeconds)}</Row>
            <Row label="Node.js">{health.data.node}</Row>
            <Row label="Memory">{health.data.memoryMb} MB</Row>
          </Card>
          <Card>
            <CardHeader title="Data" />
            <Row label="Database">
              {health.data.database.state === "connected" ? (
                <StatusBadge family="good">Connected</StatusBadge>
              ) : (
                <StatusBadge family="problem">Disconnected</StatusBadge>
              )}
            </Row>
            <Row label="Audit chain">
              {!health.data.auditChain ? (
                <span className="text-muted">Not checked yet</span>
              ) : health.data.auditChain.ok ? (
                <StatusBadge family="good">Intact</StatusBadge>
              ) : (
                <StatusBadge family="problem">
                  Broken at {health.data.auditChain.brokenAtSeq}
                </StatusBadge>
              )}
            </Row>
            <Row label="Last chain check">{formatDateTime(health.data.auditChain?.checkedAt)}</Row>
          </Card>
        </div>
      )}
    </>
  );
}
