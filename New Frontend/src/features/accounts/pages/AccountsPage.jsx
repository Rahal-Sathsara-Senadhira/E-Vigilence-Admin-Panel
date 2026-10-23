// Accounts list — docs/20 §6. HQ administrators see everyone they manage;
// an OIC sees their station's staff; auditors and division supervisors read.
// Filters live in the URL, so a view can be shared (docs/18 §11).

import { Plus, Search, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { formatDateTime, formatRelative } from "@/lib/format.js";
import { can } from "@/lib/permissions.js";
import { useCurrentUser } from "@/lib/session-context.js";
import {
  Alert,
  Avatar,
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
import { useAccountOptions, useAccounts, useCreateAccount } from "../api.js";
import { AccountForm } from "../components/AccountForm.jsx";
import { AccountStatus } from "../components/AccountStatus.jsx";
import { TemporaryPasswordDialog } from "../components/TemporaryPasswordDialog.jsx";

export function AccountsPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canManage = can(user, "users.manage");
  const stationLevel = user.permissions["users.view"] === "S";

  const filters = {
    q: params.get("q") ?? undefined,
    role: params.get("role") ?? undefined,
    status: params.get("status") ?? undefined,
    page: Number(params.get("page") ?? 1) || 1,
  };
  const accounts = useAccounts(filters);
  const options = useAccountOptions(canManage);
  const create = useCreateAccount();
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState(
    /** @type {{ name: string, signInId: string, password: string } | null} */ (null),
  );

  /** @param {Record<string, string | undefined>} next */
  const setFilters = (next) => {
    const merged = { ...Object.fromEntries(params), ...next };
    if (!("page" in next)) delete merged.page;
    const kept = /** @type {Record<string, string>} */ (
      Object.fromEntries(Object.entries(merged).filter(([, v]) => v))
    );
    setParams(kept, { replace: true });
  };

  return (
    <Page
      title={stationLevel ? "Station staff" : "Accounts"}
      description={
        stationLevel
          ? `Officers and clerks at ${user.station?.name ?? "your station"}.`
          : "Staff accounts, their roles and sign-in status."
      }
      actions={
        canManage ? (
          <Button
            variant="primary"
            icon={<Plus className="size-4" />}
            onClick={() => setCreating(true)}
          >
            New account
          </Button>
        ) : null
      }
    >
      <Panel>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
          <div className="relative flex-1 sm:max-w-sm">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              aria-label="Search by name, email or service number"
              placeholder="Name, email or service number"
              className="pl-9"
              defaultValue={filters.q}
              onChange={(e) => setFilters({ q: e.target.value || undefined })}
            />
          </div>
          {options.data && options.data.roles.length > 1 ? (
            <Select
              aria-label="Role"
              className="sm:w-52"
              value={filters.role ?? ""}
              onChange={(e) => setFilters({ role: e.target.value || undefined })}
            >
              <option value="">All roles</option>
              {options.data.roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </Select>
          ) : null}
          <Select
            aria-label="Status"
            className="sm:w-44"
            value={filters.status ?? ""}
            onChange={(e) => setFilters({ status: e.target.value || undefined })}
          >
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="locked">Locked</option>
            <option value="inactive">Deactivated</option>
          </Select>
        </div>

        {accounts.isPending ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : accounts.isError ? (
          <div className="p-4">
            <Alert tone="danger">{accounts.error.message}</Alert>
          </div>
        ) : accounts.data.items.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={
              filters.q || filters.role || filters.status ? "No accounts match" : "No accounts yet"
            }
            description={
              filters.q || filters.role || filters.status
                ? "Try a different search or clear the filters."
                : canManage
                  ? "Create the first account with “New account”."
                  : undefined
            }
          />
        ) : (
          <>
            {/* Phone: cards. */}
            <ul className="divide-y divide-border sm:hidden">
              {accounts.data.items.map((a) => (
                <li key={a.id}>
                  <Link to={`/accounts/${a.id}`} className="flex items-start gap-3 px-4 py-3.5">
                    <Avatar name={a.name} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate font-medium text-text">{a.name}</p>
                        <AccountStatus status={a.status} />
                      </div>
                      <p className="truncate text-sm text-text-muted">
                        {a.roleLabel}
                        {a.station
                          ? ` · ${a.station.name}`
                          : a.division
                            ? ` · ${a.division.name}`
                            : ""}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Tablet and up: table. */}
            <Table label="Accounts" className="hidden sm:block">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Role</Th>
                  <Th className="hidden lg:table-cell">Station or division</Th>
                  <Th>Status</Th>
                  <Th className="hidden md:table-cell">Last sign-in</Th>
                </tr>
              </thead>
              <tbody>
                {accounts.data.items.map((a) => (
                  <Tr key={a.id} onOpen={() => navigate(`/accounts/${a.id}`)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={a.name} />
                        <div className="min-w-0">
                          <Link
                            to={`/accounts/${a.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium text-text hover:text-action hover:underline"
                          >
                            {a.name}
                          </Link>
                          <p className="truncate text-xs text-text-muted">
                            {a.email ?? ""}
                            {a.email && a.serviceNumber ? " · " : ""}
                            {a.serviceNumber ? (
                              <span className="font-mono">{a.serviceNumber}</span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">{a.roleLabel}</Td>
                    <Td className="hidden text-text-muted lg:table-cell">
                      {a.station?.name ?? a.division?.name ?? "National"}
                    </Td>
                    <Td>
                      <AccountStatus status={a.status} />
                    </Td>
                    <Td className="hidden whitespace-nowrap text-text-muted md:table-cell">
                      {a.lastSignInAt ? (
                        <time dateTime={a.lastSignInAt} title={formatDateTime(a.lastSignInAt)}>
                          {formatRelative(a.lastSignInAt)}
                        </time>
                      ) : (
                        "Never"
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={accounts.data.page}
              pageSize={accounts.data.pageSize}
              total={accounts.data.total}
              noun="accounts"
              onPage={(page) => setFilters({ page: String(page) })}
            />
          </>
        )}
      </Panel>

      {canManage ? (
        <AccountForm
          open={creating}
          onOpenChange={setCreating}
          onSubmit={async (values) => {
            const result = await create.mutateAsync(values);
            setIssued({
              name: result.account.name,
              signInId: result.account.email ?? result.account.serviceNumber ?? "",
              password: result.temporaryPassword,
            });
          }}
        />
      ) : null}
      {issued ? (
        <TemporaryPasswordDialog
          open
          created
          onClose={() => setIssued(null)}
          name={issued.name}
          signInId={issued.signInId}
          password={issued.password}
        />
      ) : null}
    </Page>
  );
}
