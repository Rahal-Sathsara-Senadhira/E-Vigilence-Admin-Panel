// One police station: position and area on the map, contact details,
// staff, and the actions the backend allows (`can`). For an OIC this is
// their "Station profile".

import {
  ArrowLeft,
  Ban,
  ChevronDown,
  CircleCheck,
  ExternalLink,
  MapPinned,
  Pencil,
  Phone,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { StationMap } from "@/domain/map/index.jsx";
import { formatDateTime } from "@/lib/format.js";
import { useCurrentUser } from "@/lib/session-context.js";
import { can } from "@/lib/permissions.js";
import { CourtOptions, useCourts, useStationCourt } from "@/features/court/index.js";
import {
  Alert,
  Button,
  Dialog,
  Menu,
  MenuItem,
  Page,
  Panel,
  ReasonDialog,
  Skeleton,
} from "@/ui/index.js";
import { useStation, useStationChange } from "../api.js";
import { AreaDialog } from "../components/AreaDialog.jsx";
import { ContactForm } from "../components/ContactForm.jsx";
import { StationForm } from "../components/StationForm.jsx";
import { StationStatus } from "../components/StationStatus.jsx";

/** @typedef {"edit" | "verify" | "contact" | "area" | "deactivate" | "reactivate" | null} Open */

export function StationPage() {
  const { id = "" } = useParams();
  const user = useCurrentUser();
  const station = useStation(id);
  const change = useStationChange(id);
  const [open, setOpen] = useState(/** @type {Open} */ (null));
  const [notice, setNotice] = useState(/** @type {string | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const ownStation = user.permissions["stations.view"] === "S";

  if (station.isPending) {
    return (
      <Page title="Station">
        <Skeleton className="h-80" />
      </Page>
    );
  }
  if (station.isError) {
    return (
      <Page title="Station">
        <Alert tone="danger">{station.error.message}</Alert>
      </Page>
    );
  }
  const s = station.data;

  /** @param {{ path?: string, method?: string, body?: any }} input @param {string} done */
  async function run(input, done) {
    setError(null);
    setNotice(null);
    // Forms and dialogs show their own errors; this only reports success.
    await change.mutateAsync(input);
    setNotice(done);
  }

  const more = [
    s.can.editArea && {
      key: "area",
      label: s.hasArea ? "Change area" : "Set area",
      icon: <MapPinned />,
    },
    s.can.reactivate && { key: "reactivate", label: "Reactivate", icon: <RotateCcw /> },
    s.can.deactivate && { key: "deactivate", label: "Deactivate", icon: <Ban />, danger: true },
  ].filter(Boolean);

  return (
    <Page
      title={s.name}
      className="max-w-[1100px]"
      back={
        ownStation ? null : (
          <Link
            to="/stations"
            className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
          >
            <ArrowLeft className="size-4" aria-hidden /> All stations
          </Link>
        )
      }
      description={ownStation ? "Your station's profile." : undefined}
      actions={
        <>
          {s.can.verify ? (
            <Button
              variant="primary"
              icon={<CircleCheck className="size-4" />}
              onClick={() => setOpen("verify")}
            >
              Verify
            </Button>
          ) : null}
          {s.can.edit ? (
            <Button icon={<Pencil className="size-4" />} onClick={() => setOpen("edit")}>
              Edit
            </Button>
          ) : s.can.editContact ? (
            <Button icon={<Phone className="size-4" />} onClick={() => setOpen("contact")}>
              Edit contact
            </Button>
          ) : null}
          {more.length ? (
            <Menu
              trigger={
                <Button>
                  More <ChevronDown className="size-4" aria-hidden />
                </Button>
              }
            >
              {more.map((m) =>
                m ? (
                  <MenuItem
                    key={m.key}
                    icon={m.icon}
                    danger={m.danger}
                    onSelect={() => setOpen(/** @type {Open} */ (m.key))}
                  >
                    {m.label}
                  </MenuItem>
                ) : null,
              )}
            </Menu>
          ) : null}
        </>
      }
    >
      <div className="grid gap-6">
        {notice ? <Alert tone="success">{notice}</Alert> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {s.status === "unverified" ? (
          <Alert tone="warning" title="Needs verifying">
            {s.source === "osm" ? "Imported from OpenStreetMap. " : ""}Cases aren&apos;t dispatched
            here until HQ confirms the division and position.
            {s.suggestedDivision ? ` Suggested division: ${s.suggestedDivision.name}.` : ""}
          </Alert>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Panel>
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
              <StationStatus status={s.status} />
              <span className="text-sm text-text-muted">
                {s.division?.name ?? "No division yet"} ·{" "}
                <span className="font-mono">{s.code}</span>
              </span>
            </div>
            <div className="p-4">
              {s.location ? (
                <StationMap
                  label={`Map of ${s.name}`}
                  className="h-[360px] w-full overflow-hidden rounded-lg border border-border"
                  pick={s.location}
                  area={s.area}
                />
              ) : (
                <p className="rounded-lg bg-sunken p-6 text-center text-sm text-text-muted">
                  No position yet.
                </p>
              )}
              <p className="mt-2 text-xs text-text-muted">
                {s.hasArea
                  ? "The shaded area is the station's area of responsibility."
                  : "No area of responsibility yet. Until one is set, cases are dispatched to the nearest station."}
              </p>
            </div>
          </Panel>

          <div className="grid content-start gap-6">
            <Panel title="Contact">
              <dl className="grid gap-4 p-5 text-sm">
                <Item label="Address">{s.address ?? "—"}</Item>
                <Item label="Phone">{s.phone ?? "—"}</Item>
                <Item label="Email">{s.email ?? "—"}</Item>
              </dl>
            </Panel>
            <Panel title="Staff">
              {s.staff.length ? (
                <ul className="divide-y divide-border text-sm">
                  {s.staff.map((r) => (
                    <li key={r.role} className="flex justify-between px-5 py-2.5">
                      <span className="text-text">{r.label}</span>
                      <span className="tabular-nums text-text-muted">{r.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-5 text-sm text-text-muted">No active accounts at this station.</p>
              )}
            </Panel>
            {can(user, "stations.manage") ? (
              <DefaultCourt stationId={s.id} courtId={s.defaultCourtId} />
            ) : null}
            <Panel title="Record">
              <dl className="grid gap-4 p-5 text-sm">
                <Item label="Source">
                  {s.source === "osm" && s.osmId ? (
                    <a
                      href={`https://www.openstreetmap.org/${s.osmId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-action hover:underline"
                    >
                      OpenStreetMap <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  ) : s.source === "manual" ? (
                    "Added by HQ"
                  ) : (
                    "Initial set-up"
                  )}
                </Item>
                {s.verifiedAt ? (
                  <Item label="Verified">
                    {formatDateTime(s.verifiedAt)}
                    {s.verifiedBy ? ` by ${s.verifiedBy}` : ""}
                  </Item>
                ) : null}
              </dl>
            </Panel>
          </div>
        </div>
      </div>

      {s.can.edit ? (
        <StationForm
          open={open === "edit"}
          onOpenChange={(o) => setOpen(o ? "edit" : null)}
          mode="edit"
          station={s}
          onSubmit={(body) => run({ method: "PUT", body }, "Changes saved.")}
        />
      ) : null}
      {s.can.verify ? (
        <StationForm
          open={open === "verify"}
          onOpenChange={(o) => setOpen(o ? "verify" : null)}
          mode="verify"
          station={s}
          onSubmit={(body) => run({ path: "/verify", body }, "Station verified.")}
        />
      ) : null}
      {s.can.editContact ? (
        <ContactForm
          open={open === "contact"}
          onOpenChange={(o) => setOpen(o ? "contact" : null)}
          station={s}
          onSubmit={(body) =>
            run({ path: "/contact", method: "PUT", body }, "Contact details saved.")
          }
        />
      ) : null}
      {s.can.editArea ? (
        <AreaDialog
          open={open === "area"}
          onOpenChange={(o) => setOpen(o ? "area" : null)}
          hasArea={s.hasArea}
          onSave={(area) =>
            run(
              { path: "/area", method: "PUT", body: { area } },
              area ? "Area saved." : "Area removed.",
            )
          }
        />
      ) : null}
      <ReasonDialog
        open={open === "deactivate"}
        onOpenChange={(o) => setOpen(o ? "deactivate" : null)}
        title="Deactivate station?"
        description={`Cases won't be dispatched to ${s.name}. A station with active staff can't be deactivated — move or deactivate them first.`}
        confirmLabel="Deactivate"
        danger
        onConfirm={(reason) =>
          run({ path: "/deactivate", body: { reason } }, "Station deactivated.")
        }
      />
      <Dialog
        open={open === "reactivate"}
        onOpenChange={(o) => setOpen(o ? "reactivate" : null)}
        title="Reactivate station?"
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={change.isPending}
              onClick={() =>
                run({ path: "/reactivate" }, "Station reactivated.")
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : "Please try again."),
                  )
                  .finally(() => setOpen(null))
              }
            >
              Reactivate
            </Button>
          </>
        }
      />
    </Page>
  );
}

/** @param {{ label: string, children: import("react").ReactNode }} props */
function Item({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-text-muted">{label}</dt>
      <dd className="mt-1 break-words text-text">{children}</dd>
    </div>
  );
}

/**
 * The station's default Magistrate's Court (docs/06 D06-1): new court
 * cases start with it; the officer can change it when preparing.
 * @param {{ stationId: string, courtId: string | null }} props
 */
function DefaultCourt({ stationId, courtId }) {
  const courts = useCourts();
  const save = useStationCourt();
  const [value, setValue] = useState(courtId ?? "");
  const [saved, setSaved] = useState(false);
  return (
    <Panel title="Default court">
      <div className="grid gap-2 p-5 text-sm">
        <select
          aria-label="Default court"
          className="h-10 rounded-lg border border-border bg-panel px-3 text-text"
          value={value}
          onChange={async (e) => {
            setValue(e.target.value);
            setSaved(false);
            await save.mutateAsync({ stationId, courtId: e.target.value || null });
            setSaved(true);
          }}
        >
          <option value="">None</option>
          <CourtOptions courts={courts.data?.items} />
        </select>
        {saved ? <p className="text-xs text-success">Saved.</p> : null}
        {save.isError ? <p className="text-xs text-danger">{save.error.message}</p> : null}
      </div>
    </Panel>
  );
}
