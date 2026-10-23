// Audit log — docs/10. Who did what and when, newest first; each viewer sees
// their own area (docs/20 §5.4). National roles can check that the log has
// not been tampered with (hash chain).

import { useMutation, useQuery, keepPreviousData } from "@tanstack/react-query";
import { BookOpenText, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { api } from "@/lib/api.js";
import { formatDateTime, formatRelative } from "@/lib/format.js";
import { can } from "@/lib/permissions.js";
import { useCurrentUser } from "@/lib/session-context.js";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  Page,
  Pagination,
  Panel,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from "@/ui/index.js";

const CATEGORIES = [
  ["auth", "Sign-in"],
  ["users", "Accounts"],
  ["stations", "Stations"],
  ["divisions", "Divisions"],
  ["organisation", "Reference data"],
];

/**
 * @typedef {object} AuditItem
 * @property {string} id
 * @property {number} seq
 * @property {string} at
 * @property {string} action
 * @property {string} category
 * @property {string} summary
 * @property {{ kind: string, id: string | null, name: string, roleLabel: string | null }} actor
 * @property {{ type: string, id: string | null, label: string | null } | null} target
 * @property {string | null} ip
 */

export function AuditPage() {
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const national = ["N", "R"].includes(user.permissions["audit.view"] ?? "");
  const filters = {
    q: params.get("q") ?? undefined,
    category: params.get("category") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ? `${params.get("to")}T23:59:59+05:30` : undefined,
    page: Number(params.get("page") ?? 1) || 1,
  };
  const entries = useQuery({
    queryKey: ["audit", filters],
    queryFn: () =>
      /** @type {Promise<{ items: AuditItem[], total: number, page: number, pageSize: number }>} */ (
        api("/audit", {
          query: { ...filters, from: filters.from ? `${filters.from}T00:00:00+05:30` : undefined },
        })
      ),
    placeholderData: keepPreviousData,
  });
  const integrity = useMutation({
    mutationFn: () =>
      /** @type {Promise<{ ok: boolean, brokenAt: number | null, entries: number, checkedAt: string }>} */ (
        api("/audit/integrity")
      ),
  });

  /** @param {Record<string, string | undefined>} next */
  const update = (next) => {
    const merged = { ...Object.fromEntries(params), ...next };
    if (!("page" in next)) delete merged.page;
    setParams(
      /** @type {Record<string, string>} */ (
        Object.fromEntries(Object.entries(merged).filter(([, v]) => v))
      ),
      { replace: true },
    );
  };

  /** Where an entry's target opens, if the viewer can open it. @param {AuditItem["target"]} target */
  const linkFor = (target) => {
    if (!target?.id) return null;
    if (target.type === "user" && can(user, "users.view")) return `/accounts/${target.id}`;
    if (target.type === "station" && can(user, "stations.view")) return `/stations/${target.id}`;
    if (target.type === "division" && can(user, "stations.view")) return "/stations?tab=divisions";
    return null;
  };

  return (
    <Page
      title="Audit log"
      description={
        national
          ? "Every sign-in and change in the system, newest first. Entries can't be edited or deleted."
          : `Sign-ins and changes concerning ${user.station?.name ?? user.division?.name ?? "your area"}.`
      }
      actions={
        national ? (
          <Button
            loading={integrity.isPending}
            icon={<ShieldCheck className="size-4" />}
            onClick={() => integrity.mutate()}
          >
            Check integrity
          </Button>
        ) : null
      }
    >
      {integrity.data ? (
        integrity.data.ok ? (
          <Alert tone="success" className="mb-4" title="The log is intact">
            All {integrity.data.entries} entries checked at{" "}
            {formatDateTime(integrity.data.checkedAt)}: none has been changed or removed.
          </Alert>
        ) : (
          <Alert tone="danger" className="mb-4" title="The log has been tampered with">
            The chain breaks at entry {integrity.data.brokenAt}. Report this to the system
            administrator and the auditor at once.
          </Alert>
        )
      ) : integrity.isError ? (
        <Alert tone="danger" className="mb-4">
          {integrity.error.message}
        </Alert>
      ) : null}

      <Panel>
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:flex">
          <div className="relative sm:col-span-2 lg:max-w-xs lg:flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              aria-label="Search the log"
              placeholder="Name, record or words"
              className="pl-9"
              defaultValue={filters.q}
              onChange={(e) => update({ q: e.target.value || undefined })}
            />
          </div>
          <Select
            aria-label="Kind of entry"
            className="lg:w-44"
            value={filters.category ?? ""}
            onChange={(e) => update({ category: e.target.value || undefined })}
          >
            <option value="">All kinds</option>
            {CATEGORIES.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="date"
              aria-label="From date"
              value={params.get("from") ?? ""}
              onChange={(e) => update({ from: e.target.value || undefined })}
            />
            <Input
              type="date"
              aria-label="To date"
              value={params.get("to") ?? ""}
              onChange={(e) => update({ to: e.target.value || undefined })}
            />
          </div>
        </div>

        {entries.isPending ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : entries.isError ? (
          <div className="p-4">
            <Alert tone="danger">{entries.error.message}</Alert>
          </div>
        ) : entries.data.items.length === 0 ? (
          <EmptyState
            icon={<BookOpenText />}
            title="No entries"
            description="Nothing matches these filters."
          />
        ) : (
          <>
            <ul className="divide-y divide-border md:hidden">
              {entries.data.items.map((e) => (
                <li key={e.id} className="px-4 py-3.5 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-text">{e.summary}</p>
                    <Badge className="shrink-0">{e.category}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    {e.actor.name}
                    {e.target?.label ? ` · ${e.target.label}` : ""} ·{" "}
                    <time dateTime={e.at}>{formatDateTime(e.at)}</time>
                  </p>
                </li>
              ))}
            </ul>
            <Table label="Audit log" className="hidden md:block">
              <thead>
                <tr>
                  <Th className="w-40">When</Th>
                  <Th>Who</Th>
                  <Th>What</Th>
                  <Th>Record</Th>
                </tr>
              </thead>
              <tbody>
                {entries.data.items.map((e) => {
                  const href = linkFor(e.target);
                  return (
                    <Tr key={e.id}>
                      <Td className="whitespace-nowrap text-text-muted">
                        <time dateTime={e.at} title={formatDateTime(e.at)}>
                          {formatRelative(e.at)}
                        </time>
                        <p className="text-xs">{formatDateTime(e.at)}</p>
                      </Td>
                      <Td>
                        <p className="font-medium text-text">{e.actor.name}</p>
                        <p className="text-xs text-text-muted">
                          {e.actor.roleLabel ??
                            (e.actor.kind === "system" ? "System" : "Not signed in")}
                          {e.ip ? ` · ${e.ip}` : ""}
                        </p>
                      </Td>
                      <Td>
                        <Badge className="mb-1">{e.category}</Badge>
                        <p className="text-text">{e.summary}</p>
                      </Td>
                      <Td className="text-text-muted">
                        {e.target?.label ? (
                          href ? (
                            <Link to={href} className="text-action hover:underline">
                              {e.target.label}
                            </Link>
                          ) : (
                            e.target.label
                          )
                        ) : (
                          "—"
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination
              page={entries.data.page}
              pageSize={entries.data.pageSize}
              total={entries.data.total}
              noun="entries"
              onPage={(page) => update({ page: String(page) })}
            />
          </>
        )}
      </Panel>
      {!national ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-text-muted">
          <ShieldAlert className="size-3.5" aria-hidden /> The log can&apos;t be edited or deleted
          by anyone. HQ checks its integrity.
        </p>
      ) : null}
    </Page>
  );
}
