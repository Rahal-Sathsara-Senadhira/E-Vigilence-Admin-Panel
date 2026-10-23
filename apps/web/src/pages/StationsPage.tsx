// Police stations — read-only in phase 0. Verification, divisions and
// jurisdictions are edited in phase 2 (docs/15).

import {
  Alert,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
  StatusBadge,
  Table,
  Td,
  Th,
  Tr,
} from "@ev/ui";
import { Building2, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { useCurrentUser } from "../auth/AuthProvider";
import { useStations } from "../lib/queries";

export function StationsPage() {
  const me = useCurrentUser();
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q.trim());
  const stations = useStations(deferred || undefined);
  const national = me.role === "hq" || me.role === "dev";

  return (
    <>
      <PageHeader
        title="Police stations"
        description={national ? "Every station and its territorial division." : "Your station."}
      />
      <Card>
        {national ? (
          <div className="border-b border-line p-4">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <Input
                aria-label="Search stations"
                placeholder="Search stations"
                className="pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
        ) : null}
        {stations.isPending ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : stations.isError ? (
          <div className="p-4">
            <Alert tone="danger">{(stations.error as Error).message}</Alert>
          </div>
        ) : stations.data.length === 0 ? (
          <EmptyState
            icon={<Building2 className="size-5" />}
            title="No stations found"
            description="Try a different name."
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Station</Th>
                  <Th>Division</Th>
                  <Th>Data</Th>
                </tr>
              </thead>
              <tbody>
                {stations.data.map((s) => (
                  <Tr key={s.id}>
                    <Td className="font-medium">{s.name}</Td>
                    <Td className="text-muted">{s.divisionName ?? "Not assigned"}</Td>
                    <Td>
                      {s.verified ? (
                        <StatusBadge family="good">Verified</StatusBadge>
                      ) : (
                        <StatusBadge family="waiting">Awaiting verification</StatusBadge>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <p className="px-4 py-3 text-sm text-muted tabular-nums">
              {stations.data.length} station{stations.data.length === 1 ? "" : "s"} · station data ©
              OpenStreetMap contributors (ODbL)
            </p>
          </>
        )}
      </Card>
    </>
  );
}
