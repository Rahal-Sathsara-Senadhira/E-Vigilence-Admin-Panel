// Courts — the Magistrate's Courts cases go to (docs/06 D06-1). Each
// station's default court is set on the station's page.

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/lib/api.js";
import { Alert, Badge, Button, Dialog, Field, Input, Page, Panel, Skeleton } from "@/ui/index.js";
import { useCourts, useSaveCourt } from "../api.js";

/** @typedef {import("../api.js").CourtRow} CourtRow */

export function CourtsPage() {
  const courts = useCourts();
  const [editing, setEditing] = useState(/** @type {CourtRow | "new" | null} */ (null));
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
          <ul className="divide-y divide-border text-sm">
            {courts.data.items.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span>
                  <span className="font-medium text-text">{c.name}</span>
                  <span className="ml-2 font-mono text-xs text-text-muted">{c.code}</span>
                  {c.district ? (
                    <span className="ml-2 text-xs text-text-muted">{c.district}</span>
                  ) : null}
                  {!c.isActive ? <Badge className="ml-2">Inactive</Badge> : null}
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
    district: court?.district ?? "",
    address: court?.address ?? "",
    isActive: court?.isActive ?? true,
  });
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  /** @param {"name" | "code" | "district" | "address"} k */
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
          <Field label="Code" hint="e.g. MC-KDY" error={errors.code}>
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
          <Field label="District">
            {(p) => <Input {...p} value={v.district} onChange={set("district")} />}
          </Field>
        </div>
        <Field label="Address">
          {(p) => <Input {...p} value={v.address} onChange={set("address")} />}
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
