// Divisions & stations — docs/03 §3, docs/20 §5.4.
//   HQ administrator   every station and division; verifies imported stations
//   Division supervisor the division's stations
//   Station OIC        goes straight to their own station ("Station profile")
// Filters, tab and view live in the URL, so a view can be shared.

import { Building2, List, Map as MapIcon, Pencil, Plus, Search } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { StationMap } from "@/domain/map/index.jsx";
import { can } from "@/lib/permissions.js";
import { useCurrentUser } from "@/lib/session-context.js";
import {
  Alert,
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
  cn,
} from "@/ui/index.js";
import {
  useCreateStation,
  useDivisions,
  useSaveDivision,
  useStations,
  useStationsMap,
} from "../api.js";
import { DivisionForm } from "../components/DivisionForm.jsx";
import { StationForm } from "../components/StationForm.jsx";
import { StationStatus } from "../components/StationStatus.jsx";

export function OrganisationPage() {
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const manage = can(user, "stations.manage");

  // A station-level user has one station: show it directly.
  if (user.permissions["stations.view"] === "S" && user.station) {
    return <Navigate to={`/stations/${user.station.id}`} replace />;
  }

  const tab = params.get("tab") === "divisions" ? "divisions" : "stations";
  /** @param {Record<string, string | undefined>} next */
  const update = (next) => {
    const merged = { ...Object.fromEntries(params), ...next };
    if (!("page" in next)) delete merged.page;
    const kept = /** @type {Record<string, string>} */ (
      Object.fromEntries(Object.entries(merged).filter(([, v]) => v))
    );
    setParams(kept, { replace: true });
  };

  return (
    <Page
      title={manage ? "Divisions & stations" : "Stations"}
      description={
        manage
          ? "Territorial divisions and police stations. Imported stations are verified here before cases are dispatched to them."
          : `Police stations in ${user.division?.name ?? "your division"}.`
      }
    >
      <div
        role="tablist"
        aria-label="Divisions and stations"
        className="mb-4 flex gap-1 border-b border-border"
      >
        {[
          ["stations", "Stations"],
          ["divisions", "Divisions"],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParams(key === "stations" ? {} : { tab: key }, { replace: true })}
            className={cn(
              "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium",
              tab === key
                ? "border-action text-action"
                : "border-transparent text-text-muted hover:text-text",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "stations" ? (
        <StationsTab params={params} update={update} manage={manage} />
      ) : (
        <DivisionsTab manage={manage} />
      )}
    </Page>
  );
}

/**
 * @param {{ params: URLSearchParams, update: (next: Record<string, string | undefined>) => void, manage: boolean }} props
 */
function StationsTab({ params, update, manage }) {
  const navigate = useNavigate();
  const view = params.get("view") === "map" ? "map" : "list";
  const filters = {
    q: params.get("q") ?? undefined,
    divisionId: params.get("division") ?? undefined,
    status: params.get("status") ?? undefined,
    page: Number(params.get("page") ?? 1) || 1,
  };
  const stations = useStations(filters);
  const map = useStationsMap(view === "map");
  const divisions = useDivisions();
  const create = useCreateStation();
  const [adding, setAdding] = useState(false);

  const mapStations = (map.data ?? []).filter(
    (s) => !filters.status || s.status === filters.status,
  );

  return (
    <>
      {manage &&
      stations.data &&
      stations.data.unverified > 0 &&
      filters.status !== "unverified" ? (
        <Alert tone="warning" className="mb-4">
          <span>
            {stations.data.unverified} station{stations.data.unverified === 1 ? "" : "s"} need
            {stations.data.unverified === 1 ? "s" : ""} verifying before cases can be dispatched to
            them.{" "}
            <button
              type="button"
              className="font-medium text-action hover:underline"
              onClick={() => update({ status: "unverified" })}
            >
              Review them
            </button>
          </span>
        </Alert>
      ) : null}

      <Panel>
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1 lg:max-w-xs">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              aria-label="Search stations"
              placeholder="Station name or code"
              className="pl-9"
              defaultValue={filters.q}
              onChange={(e) => update({ q: e.target.value || undefined })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            {(divisions.data?.length ?? 0) > 1 ? (
              <Select
                aria-label="Division"
                className="sm:w-52"
                value={filters.divisionId ?? ""}
                onChange={(e) => update({ division: e.target.value || undefined })}
              >
                <option value="">All divisions</option>
                {divisions.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            ) : null}
            <Select
              aria-label="Status"
              className="sm:w-48"
              value={filters.status ?? ""}
              onChange={(e) => update({ status: e.target.value || undefined })}
            >
              <option value="">Any status</option>
              <option value="verified">Verified</option>
              <option value="unverified">Needs verifying</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
          <div className="flex gap-2 lg:ml-auto">
            <div
              role="group"
              aria-label="View"
              className="inline-flex rounded-lg border border-border-strong p-0.5"
            >
              {[
                ["list", "List", List],
                ["map", "Map", MapIcon],
              ].map(([key, label, Icon]) => (
                <button
                  key={/** @type {string} */ (key)}
                  type="button"
                  aria-pressed={view === key}
                  onClick={() =>
                    update({ view: key === "map" ? "map" : undefined, page: undefined })
                  }
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm",
                    view === key
                      ? "bg-sunken font-medium text-text"
                      : "text-text-muted hover:text-text",
                  )}
                >
                  {/* @ts-ignore — icon component from the tuple */}
                  <Icon className="size-4" aria-hidden />
                  {/** @type {string} */ (label)}
                </button>
              ))}
            </div>
            {manage ? (
              <Button
                variant="primary"
                icon={<Plus className="size-4" />}
                onClick={() => setAdding(true)}
              >
                New station
              </Button>
            ) : null}
          </div>
        </div>

        {view === "map" ? (
          <div className="p-4">
            <StationMap
              label="Police stations"
              className="h-[min(70dvh,640px)] w-full overflow-hidden rounded-lg border border-border"
              stations={mapStations}
              onSelect={(id) => navigate(`/stations/${id}`)}
            />
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
              <Legend className="bg-action" label="Verified" />
              <Legend className="bg-attention" label="Needs verifying" />
              <Legend className="bg-[#8a93a0]" label="Inactive" />
              <span>{mapStations.length} on the map. Click a dot to open the station.</span>
            </p>
          </div>
        ) : stations.isPending ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : stations.isError ? (
          <div className="p-4">
            <Alert tone="danger">{stations.error.message}</Alert>
          </div>
        ) : stations.data.items.length === 0 ? (
          <EmptyState
            icon={<Building2 />}
            title="No stations match"
            description="Try a different search or clear the filters."
          />
        ) : (
          <>
            <ul className="divide-y divide-border sm:hidden">
              {stations.data.items.map((s) => (
                <li key={s.id}>
                  <Link to={`/stations/${s.id}`} className="block px-4 py-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-text">{s.name}</p>
                      <StationStatus status={s.status} />
                    </div>
                    <p className="text-sm text-text-muted">
                      {s.division?.name ??
                        (s.suggestedDivision
                          ? `Suggested: ${s.suggestedDivision.name}`
                          : "No division")}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <Table label="Stations" className="hidden sm:block">
              <thead>
                <tr>
                  <Th>Station</Th>
                  <Th>Division</Th>
                  <Th>Status</Th>
                  <Th className="hidden md:table-cell">Area</Th>
                  <Th className="hidden lg:table-cell">Phone</Th>
                </tr>
              </thead>
              <tbody>
                {stations.data.items.map((s) => (
                  <Tr key={s.id} onOpen={() => navigate(`/stations/${s.id}`)}>
                    <Td>
                      <Link
                        to={`/stations/${s.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-text hover:text-action hover:underline"
                      >
                        {s.name}
                      </Link>
                      <p className="font-mono text-xs text-text-muted">{s.code}</p>
                    </Td>
                    <Td>
                      {s.division ? (
                        s.division.name
                      ) : s.suggestedDivision ? (
                        <span className="text-text-muted">
                          Suggested: {s.suggestedDivision.name}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </Td>
                    <Td>
                      <StationStatus status={s.status} />
                    </Td>
                    <Td className="hidden text-text-muted md:table-cell">
                      {s.hasArea ? "Set" : "Not set"}
                    </Td>
                    <Td className="hidden whitespace-nowrap text-text-muted lg:table-cell">
                      {s.phone ?? "—"}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={stations.data.page}
              pageSize={stations.data.pageSize}
              total={stations.data.total}
              noun="stations"
              onPage={(page) => update({ page: String(page) })}
            />
          </>
        )}
      </Panel>

      {manage ? (
        <StationForm
          open={adding}
          onOpenChange={setAdding}
          mode="create"
          onSubmit={async (values) => {
            const created = await create.mutateAsync(values);
            navigate(`/stations/${created.id}`);
          }}
        />
      ) : null}
    </>
  );
}

/** @param {{ className: string, label: string }} props */
function Legend({ className, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("size-2.5 rounded-full ring-1 ring-white", className)} />
      {label}
    </span>
  );
}

/** @param {{ manage: boolean }} props */
function DivisionsTab({ manage }) {
  const divisions = useDivisions();
  const save = useSaveDivision();
  const [editing, setEditing] = useState(
    /** @type {import("../api.js").Division | null | "new"} */ (null),
  );

  return (
    <Panel>
      {manage ? (
        <div className="flex justify-end border-b border-border p-4">
          <Button
            variant="primary"
            icon={<Plus className="size-4" />}
            onClick={() => setEditing("new")}
          >
            New division
          </Button>
        </div>
      ) : null}
      {divisions.isPending ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : divisions.isError ? (
        <div className="p-4">
          <Alert tone="danger">{divisions.error.message}</Alert>
        </div>
      ) : (
        <Table label="Divisions">
          <thead>
            <tr>
              <Th>Division</Th>
              <Th className="hidden sm:table-cell">Range</Th>
              <Th className="hidden md:table-cell">Province</Th>
              <Th className="text-right">Stations</Th>
              {manage ? (
                <Th className="w-12">
                  <span className="sr-only">Edit</span>
                </Th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {divisions.data.map((d) => (
              <Tr key={d.id}>
                <Td>
                  <p className="font-medium text-text">{d.name}</p>
                  <p className="font-mono text-xs text-text-muted">{d.code}</p>
                </Td>
                <Td className="hidden text-text-muted sm:table-cell">{d.range ?? "—"}</Td>
                <Td className="hidden text-text-muted md:table-cell">{d.province ?? "—"}</Td>
                <Td className="text-right tabular-nums">
                  {d.verifiedStations}
                  <span className="text-text-muted"> / {d.stations}</span>
                  <span className="sr-only"> verified</span>
                </Td>
                {manage ? (
                  <Td>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit ${d.name}`}
                      icon={<Pencil className="size-4" />}
                      onClick={() => setEditing(d)}
                    />
                  </Td>
                ) : null}
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="px-4 py-3 text-xs text-text-muted">
        Stations: verified / assigned to the division. Source of the division list: Sri Lanka Police
        Performance Report 2024.
      </p>
      {manage ? (
        <DivisionForm
          open={editing !== null}
          onOpenChange={(o) => !o && setEditing(null)}
          division={editing && editing !== "new" ? editing : undefined}
          onSubmit={(body) =>
            save.mutateAsync({ id: editing && editing !== "new" ? editing.id : undefined, body })
          }
        />
      ) : null}
    </Panel>
  );
}
