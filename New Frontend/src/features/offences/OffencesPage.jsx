// The offence schedule — read by everyone who handles reports and cases;
// changed only by the HQ administrator, one version at a time.

import { Gavel, History, Pencil, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { formatDateTime } from "@/lib/format.js";
import { can } from "@/lib/permissions.js";
import { useCurrentUser } from "@/lib/session-context.js";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  Page,
  Panel,
  Select,
  Sheet,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from "@/ui/index.js";
import { SEVERITY_LABELS, VEHICLE_LABELS, useOffence, useOffences, useSaveOffence } from "./api.js";
import { OffenceForm } from "./OffenceForm.jsx";

const rupees = (/** @type {number} */ n) => `Rs ${n.toLocaleString("en-LK")}`;
const SEVERITY_TONE = /** @type {const} */ ({
  severe: "danger",
  moderate: "warning",
  minor: "neutral",
});

export function OffencesPage() {
  const user = useCurrentUser();
  const manage = can(user, "offences.manage");
  const [params, setParams] = useSearchParams();
  const filters = {
    q: params.get("q") ?? undefined,
    outcome: params.get("outcome") ?? undefined,
    severity: params.get("severity") ?? undefined,
    status: params.get("status") ?? (manage ? undefined : "active"),
  };
  const offences = useOffences(filters);
  const save = useSaveOffence();
  const [open, setOpen] = useState(/** @type {string | null} */ (null));
  const [editing, setEditing] = useState(
    /** @type {import("./api.js").Offence | "new" | null} */ (null),
  );

  /** @param {Record<string, string | undefined>} next */
  const update = (next) =>
    setParams(
      /** @type {Record<string, string>} */ (
        Object.fromEntries(
          Object.entries({ ...Object.fromEntries(params), ...next }).filter(([, v]) => v),
        )
      ),
      { replace: true },
    );

  return (
    <Page
      title="Offence schedule"
      description="Offences, their legal references and spot fines. Changes create new versions; notices keep the fine in force when they were issued."
      actions={
        manage ? (
          <Button
            variant="primary"
            icon={<Plus className="size-4" />}
            onClick={() => setEditing("new")}
          >
            New offence
          </Button>
        ) : null
      }
    >
      <Panel>
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:flex">
          <div className="relative sm:col-span-2 lg:max-w-xs lg:flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              aria-label="Search offences"
              placeholder="Code, offence or section"
              className="pl-9"
              defaultValue={filters.q}
              onChange={(e) => update({ q: e.target.value || undefined })}
            />
          </div>
          <Select
            aria-label="Dealt with by"
            className="lg:w-48"
            value={filters.outcome ?? ""}
            onChange={(e) => update({ outcome: e.target.value || undefined })}
          >
            <option value="">Spot fine or court</option>
            <option value="spot_fine">Spot fine</option>
            <option value="court">Court only</option>
          </Select>
          <Select
            aria-label="Severity"
            className="lg:w-40"
            value={filters.severity ?? ""}
            onChange={(e) => update({ severity: e.target.value || undefined })}
          >
            <option value="">Any severity</option>
            {Object.entries(SEVERITY_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
          {manage ? (
            <Select
              aria-label="Status"
              className="lg:w-44"
              value={filters.status ?? ""}
              onChange={(e) => update({ status: e.target.value || undefined })}
            >
              <option value="">In force or not</option>
              <option value="active">In force</option>
              <option value="inactive">No longer used</option>
            </Select>
          ) : null}
        </div>
        {offences.isPending ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : offences.isError ? (
          <div className="p-4">
            <Alert tone="danger">{offences.error.message}</Alert>
          </div>
        ) : offences.data.length === 0 ? (
          <EmptyState
            icon={<Gavel />}
            title="No offences match"
            description="Try a different search."
          />
        ) : (
          <>
            <ul className="divide-y divide-border md:hidden">
              {offences.data.map((o) => (
                <li key={o.code}>
                  <button
                    type="button"
                    onClick={() => setOpen(o.code)}
                    className="block w-full px-4 py-3.5 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-text">{o.name}</p>
                      <span className="shrink-0 text-sm tabular-nums text-text">
                        {o.spotFine !== null ? rupees(o.spotFine) : "Court"}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted">
                      <span className="font-mono">{o.code}</span> · {o.legalReference}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
            <Table label="Offence schedule" className="hidden md:block">
              <thead>
                <tr>
                  <Th>Offence</Th>
                  <Th>Severity</Th>
                  <Th className="text-right">Spot fine</Th>
                  <Th className="hidden lg:table-cell">Applies to</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {offences.data.map((o) => (
                  <Tr key={o.code} onOpen={() => setOpen(o.code)}>
                    <Td>
                      <button
                        type="button"
                        className="text-left font-medium text-text hover:text-action hover:underline"
                        onClick={(e) => (e.stopPropagation(), setOpen(o.code))}
                      >
                        {o.name}
                      </button>
                      <p className="text-xs text-text-muted">
                        <span className="font-mono">{o.code}</span> · {o.legalReference}
                      </p>
                    </Td>
                    <Td>
                      <Badge tone={SEVERITY_TONE[o.severity]}>{SEVERITY_LABELS[o.severity]}</Badge>
                    </Td>
                    <Td className="text-right whitespace-nowrap tabular-nums">
                      {o.spotFine !== null ? (
                        rupees(o.spotFine)
                      ) : (
                        <span className="text-text-muted">Court only</span>
                      )}
                    </Td>
                    <Td className="hidden text-text-muted lg:table-cell">
                      {o.vehicleTypes.length
                        ? o.vehicleTypes
                            .map(
                              (v) =>
                                VEHICLE_LABELS[/** @type {keyof typeof VEHICLE_LABELS} */ (v)] ?? v,
                            )
                            .join(", ")
                        : "Any vehicle"}
                    </Td>
                    <Td>
                      {o.active ? (
                        <Badge tone="success">In force</Badge>
                      ) : (
                        <Badge>No longer used</Badge>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <p className="px-4 py-3 text-xs text-text-muted">
              {offences.data.length} offence{offences.data.length === 1 ? "" : "s"}. Source: Gazette
              2054/9 (2018) and Act No. 10 of 2019 — to be confirmed by HQ&apos;s legal officers.
            </p>
          </>
        )}
      </Panel>

      <OffenceDetail
        code={open}
        onClose={() => setOpen(null)}
        onEdit={manage ? (o) => (setOpen(null), setEditing(o)) : undefined}
      />
      {manage ? (
        <OffenceForm
          open={editing !== null}
          onOpenChange={(o) => !o && setEditing(null)}
          offence={editing && editing !== "new" ? editing : undefined}
          onSubmit={(body) =>
            save.mutateAsync({
              code: editing && editing !== "new" ? editing.code : undefined,
              body,
            })
          }
        />
      ) : null}
    </Page>
  );
}

/**
 * One offence with its history, in a side sheet.
 * @param {{ code: string | null, onClose: () => void, onEdit?: (o: import("./api.js").Offence) => void }} props
 */
function OffenceDetail({ code, onClose, onEdit }) {
  const offence = useOffence(code);
  const o = offence.data;
  return (
    <Sheet
      open={Boolean(code)}
      onOpenChange={(open) => !open && onClose()}
      title={o ? o.name : "Offence"}
      description={o ? `${o.code} · ${o.legalReference}` : undefined}
      footer={
        o && onEdit ? (
          <Button variant="primary" icon={<Pencil className="size-4" />} onClick={() => onEdit(o)}>
            Change
          </Button>
        ) : undefined
      }
    >
      {!o ? (
        <div className="p-5">
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="grid gap-6 p-5 text-sm">
          <dl className="grid grid-cols-2 gap-4">
            <Item label="Dealt with by">
              {o.outcome === "spot_fine" ? "Spot fine" : "Court only"}
            </Item>
            <Item label="Spot fine">{o.spotFine !== null ? rupees(o.spotFine) : "—"}</Item>
            <Item label="Severity">{SEVERITY_LABELS[o.severity]}</Item>
            <Item label="Demerit points">{o.demeritPoints ?? "Not set yet"}</Item>
            <Item label="Applies to">
              {o.vehicleTypes.length
                ? o.vehicleTypes
                    .map((v) => VEHICLE_LABELS[/** @type {keyof typeof VEHICLE_LABELS} */ (v)] ?? v)
                    .join(", ")
                : "Any vehicle"}
            </Item>
            <Item label="Status">{o.active ? "In force" : "No longer used"}</Item>
          </dl>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs font-medium text-text-muted">In the public mobile app</p>
            {o.citizenReportable ? (
              <>
                <p className="mt-1 font-medium text-text">{o.publicName}</p>
                <p className="text-text-muted">{o.publicDescription}</p>
              </>
            ) : (
              <p className="mt-1 text-text-muted">
                Not shown — citizens can&apos;t report this offence.
              </p>
            )}
          </div>
          <div>
            <p className="mb-3 flex items-center gap-1.5 font-medium text-text">
              <History className="size-4" aria-hidden /> Versions
            </p>
            <ol className="grid gap-3">
              {o.history.map((v) => (
                <li key={v.version} className="border-l-2 border-border pl-3">
                  <p className="text-text">
                    Version {v.version}
                    {v.spotFine !== null ? ` · ${rupees(v.spotFine)}` : " · Court only"}
                    {v.active ? "" : " · no longer used"}
                  </p>
                  <p className="text-xs text-text-muted">
                    From {formatDateTime(v.effectiveFrom)}
                    {v.effectiveTo ? ` to ${formatDateTime(v.effectiveTo)}` : " — in force"} ·{" "}
                    {v.changedBy}
                  </p>
                  <p className="text-xs text-text-muted">{v.reason}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** @param {{ label: string, children: import("react").ReactNode }} props */
function Item({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium text-text-muted">{label}</dt>
      <dd className="mt-1 text-text">{children}</dd>
    </div>
  );
}
