// Courts — the Magistrate's Courts cases go to (docs/06 D06-1). Each
// station's default court is set on the station's page.

import { Pencil, Phone, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ApiError } from "@/lib/api.js";
import { DISTRICTS } from "@/lib/srilanka.js";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Field,
  Input,
  Page,
  Panel,
  Select,
  Skeleton,
} from "@/ui/index.js";
import { useCourts, useSaveCourt } from "../api.js";
import { COURT_TYPE_LABELS, byDistrict } from "../lib/courts.js";

/** @typedef {import("../api.js").CourtRow} CourtRow */

export function CourtsPage() {
  const courts = useCourts();
  const [editing, setEditing] = useState(/** @type {CourtRow | "new" | null} */ (null));
  const [q, setQ] = useState("");
  const [district, setDistrict] = useState("");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const shown = (courts.data?.items ?? []).filter(
      (c) =>
        (!district || c.district === district) &&
        (!needle ||
          [c.name, c.code, c.address ?? ""].some((s) => s.toLowerCase().includes(needle))),
    );
    return { count: shown.length, list: byDistrict(shown) };
  }, [courts.data, q, district]);

  return (
    <Page
      title="Courts"
      description="Magistrate's Courts. Set each station's default court on the station's page."
      actions={
        <Button
          variant="primary"
          icon={<Plus className="size-4" />}
          onClick={() => setEditing("new")}
        >
          Add court
        </Button>
      }
    >
      <Panel>
        {courts.isPending ? (
          <Skeleton className="m-4 h-40" />
        ) : courts.isError ? (
          <Alert tone="danger" className="m-4">
            {courts.error.message}
          </Alert>
        ) : courts.data.items.length === 0 ? (
          <p className="p-5 text-sm text-text-muted">
            No courts yet. Add the Magistrate&apos;s Courts your stations use.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-center">
              <div className="relative grow">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
                  aria-hidden
                />
                <Input
                  aria-label="Search courts"
                  placeholder="Search by name, code or address"
                  className="pl-9"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <Select
                aria-label="District"
                className="sm:w-56"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
              >
                <option value="">All districts</option>
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
              <span className="text-xs text-text-muted sm:w-20 sm:text-right">
                {groups.count} {groups.count === 1 ? "court" : "courts"}
              </span>
            </div>
            {groups.count === 0 ? (
              <p className="p-5 text-sm text-text-muted">No court matches.</p>
            ) : (
              groups.list.map(([name, list]) => (
                <section key={name}>
                  <h3 className="bg-sunken px-5 py-1.5 text-xs font-semibold tracking-wide text-text-muted uppercase">
                    {name}
                  </h3>
                  <ul className="divide-y divide-border text-sm">
                    {list.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <span className="min-w-0">
                          <span className="font-medium text-text">{c.name}</span>
                          <span className="ml-2 font-mono text-xs text-text-muted">{c.code}</span>
                          {!c.isActive ? <Badge className="ml-2">Inactive</Badge> : null}
                          <span className="block text-xs text-text-muted">
                            {COURT_TYPE_LABELS[c.type] ?? c.type}
                            {c.address ? ` · ${c.address}` : ""}
                          </span>
                          {c.phone ? (
                            <span className="mt-0.5 flex items-center gap-1 text-xs text-text-muted">
                              <Phone className="size-3" aria-hidden /> {c.phone}
                            </span>
                          ) : null}
                        </span>
                        <Button
                          size="sm"
                          icon={<Pencil className="size-4" />}
                          onClick={() => setEditing(c)}
                        >
                          Edit
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </>
        )}
      </Panel>
      {editing ? (
        <CourtDialog court={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
    </Page>
  );
}

/** @param {{ court: CourtRow | null, onClose: () => void }} props */
function CourtDialog({ court, onClose }) {
  const save = useSaveCourt();
  const [v, setV] = useState({
    name: court?.name ?? "",
    code: court?.code ?? "",
    type: court?.type ?? "magistrate",
    // A district typed before the list existed has to be chosen again.
    district: court?.district && DISTRICTS.includes(court.district) ? court.district : "",
    address: court?.address ?? "",
    phone: court?.phone ?? "",
    isActive: court?.isActive ?? true,
  });
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  /** @param {"name" | "code" | "type" | "district" | "address" | "phone"} k */
  const set = (k) => (/** @type {any} */ e) => setV({ ...v, [k]: e.target.value });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={court ? "Edit court" : "Add court"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={async () => {
              setErrors({});
              try {
                await save.mutateAsync({
                  id: court?.id,
                  body: Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "")),
                });
                onClose();
              } catch (err) {
                setErrors(
                  err instanceof ApiError && Object.keys(err.fields).length
                    ? err.fields
                    : { root: err instanceof Error ? err.message : "Please try again." },
                );
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {errors.root ? <Alert tone="danger">{errors.root}</Alert> : null}
        <Field label="Name" error={errors.name}>
          {({ invalid, ...p }) => (
            <Input {...p} invalid={invalid} value={v.name} onChange={set("name")} />
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code" hint="e.g. MC-KANDY" error={errors.code}>
            {({ invalid, ...p }) => (
              <Input
                {...p}
                invalid={invalid}
                className="font-mono uppercase"
                value={v.code}
                onChange={set("code")}
              />
            )}
          </Field>
          <Field label="Kind of court" error={errors.type}>
            {({ invalid, ...p }) => (
              <Select {...p} invalid={invalid} value={v.type} onChange={set("type")}>
                {Object.entries(COURT_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="District" error={errors.district}>
          {({ invalid, ...p }) => (
            <Select {...p} invalid={invalid} value={v.district} onChange={set("district")}>
              <option value="">Choose the district</option>
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Address">
          {(p) => <Input {...p} value={v.address} onChange={set("address")} />}
        </Field>
        <Field label="Phone" hint="More than one: separate with /" error={errors.phone}>
          {({ invalid, ...p }) => (
            <Input
              {...p}
              invalid={invalid}
              type="tel"
              inputMode="tel"
              value={v.phone}
              onChange={set("phone")}
            />
          )}
        </Field>
        {court ? (
          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              className="size-4 accent-[var(--ev-action)]"
              checked={v.isActive}
              onChange={(e) => setV({ ...v, isActive: e.target.checked })}
            />
            In use
          </label>
        ) : null}
      </div>
    </Dialog>
  );
}
