import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  dispatchNearest,
  getViolation,
  updateViolation,
  deleteViolation,
} from "../../services/violationsApi";
import { getDispatchByViolation } from "../../services/dispatchesApi";
import EvidenceViewer from "../../components/EvidenceViewer";
import StatusBadge from "../../components/StatusBadge";
import ViolationLocationPreview from "../../components/ViolationLocationPreview";
import ConfirmButton from "../../components/ConfirmButton";
import SearchMultiSelect from "../../components/SearchMultiSelect";
import { VIOLATIONS, asyncFilter } from "../../utils/violationOptions";
import { STATUS_OPTIONS } from "../../utils/violationStatus";
import { showToast } from "../../utils/toastBus";
import { Pencil, Save, X, Trash2 } from "lucide-react";
import { Card, Button, ErrorState, LoadingState } from "../../components/ui";

function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

export default function ViolationDetails() {
  const nav = useNavigate();
  const { id } = useParams();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [item, setItem] = React.useState(null);

  const [dispatching, setDispatching] = React.useState(false);
  const [dispatchMsg, setDispatchMsg] = React.useState("");
  const [dispatchErr, setDispatchErr] = React.useState("");

  // ✅ Persisted dispatch info from DB
  const [latestDispatch, setLatestDispatch] = React.useState(null);

  // Edit mode
  const [editing, setEditing] = React.useState(false);
  const [editForm, setEditForm] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [saveErr, setSaveErr] = React.useState("");

  const [deleting, setDeleting] = React.useState(false);

  async function loadViolation() {
    const data = await getViolation(id);
    return data?.data ? data.data : data;
  }

  async function loadDispatch() {
    try {
      const res = await getDispatchByViolation(id);

      // axios style: res.data is the payload; fetch style: res itself is payload
      const top = res?.data ? res.data : res;
      const payload = top?.data ? top.data : top;

      // Normalize the handful of shapes this endpoint has returned over time.
      let dispatchDoc = null;
      if (payload?.dispatch) dispatchDoc = payload.dispatch;
      else if (payload?.data?.dispatch) dispatchDoc = payload.data.dispatch;
      else if (Array.isArray(payload?.items) && payload.items.length > 0) {
        const first = payload.items[0];
        dispatchDoc = first?.dispatch ? first.dispatch : first;
      } else if (Array.isArray(payload) && payload.length > 0) {
        const first = payload[0];
        dispatchDoc = first?.dispatch ? first.dispatch : first;
      } else {
        dispatchDoc = payload || null;
      }
      if (dispatchDoc?.dispatch) dispatchDoc = dispatchDoc.dispatch;

      setLatestDispatch(dispatchDoc);
    } catch {
      // No dispatch yet (or lookup failed) — just show "Not assigned yet."
      setLatestDispatch(null);
    }
  }

  async function loadAll() {
    try {
      setError("");
      setLoading(true);

      const v = await loadViolation();
      setItem(v || null);

      await loadDispatch();
    } catch (e) {
      setError(e?.message || "Failed to load violation");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onDispatchNearest() {
    try {
      setDispatchErr("");
      setDispatchMsg("");
      setDispatching(true);

      const res = await dispatchNearest(id);
      const payloadTop = res?.data ? res.data : res;
      const payload = payloadTop?.data ? payloadTop.data : payloadTop;

      const station = payload?.station || payload?.data?.station || null;

      setDispatchMsg(
        station?.name
          ? `Dispatched successfully to: ${station.name}`
          : "Dispatched successfully."
      );

      await loadAll();
    } catch (e) {
      setDispatchErr(e?.message || "Dispatch failed");
    } finally {
      setDispatching(false);
    }
  }

  function startEdit() {
    setSaveErr("");
    setEditForm({
      title: item.title || "",
      type: item.type || item.category || "",
      status: item.status || "open",
      violations: Array.isArray(item.violations) ? item.violations : [],
      description: item.description || "",
    });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditForm(null);
    setSaveErr("");
  }

  async function saveEdit() {
    if (!editForm.title.trim()) {
      setSaveErr("Title is required.");
      return;
    }

    try {
      setSaving(true);
      setSaveErr("");

      await updateViolation(id, {
        title: editForm.title.trim(),
        type: editForm.type.trim(),
        status: editForm.status,
        violations: editForm.violations,
        description: editForm.description,
      });

      showToast("Violation updated", "success");
      setEditing(false);
      setEditForm(null);
      await loadAll();
    } catch (e) {
      setSaveErr(e?.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    try {
      setDeleting(true);
      await deleteViolation(id);
      showToast("Violation deleted", "success");
      nav("/violations");
    } catch (e) {
      setDeleting(false);
      showToast(e?.message || "Failed to delete violation", "error");
    }
  }

  const stationName =
    latestDispatch?.station?.name ||
    latestDispatch?.stationName ||
    latestDispatch?.station?.title ||
    null;

  const stationArea = latestDispatch?.station?.area || latestDispatch?.stationArea || null;

  const lat = item?.location?.lat;
  const lng = item?.location?.lng;
  const dms = item?.location?.dms;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Violation Details</h2>
          <p className="text-sm text-slate-700 dark:text-slate-400">Full record view</p>
        </div>

        <div className="flex items-center gap-2">
          {!editing && item ? (
            <Button variant="secondary" onClick={startEdit} icon={Pencil}>
              Edit
            </Button>
          ) : null}

          <ConfirmButton
            onConfirm={onDispatchNearest}
            disabled={dispatching || loading || editing}
            className="rounded-xl border border-transparent bg-brand-blue px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
            armedClassName="rounded-xl border border-amber-700 bg-amber-600/20 px-4 py-2 text-sm text-amber-800 dark:text-amber-200 hover:bg-amber-600/30"
          >
            {dispatching
              ? "Dispatching..."
              : stationName
              ? "Re-dispatch to Nearest Station"
              : "Send to Nearest Station"}
          </ConfirmButton>

          <ConfirmButton
            onConfirm={onDelete}
            disabled={deleting || loading || editing}
            className="inline-flex items-center gap-2 rounded-xl border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-4 py-2 text-sm text-red-700 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-950/50 disabled:opacity-60"
            armedClassName="inline-flex items-center gap-2 rounded-xl border border-red-700 bg-red-600/30 px-4 py-2 text-sm text-red-100 hover:bg-red-600/40"
            confirmChildren={
              <>
                <Trash2 className="h-4 w-4" />
                Confirm delete?
              </>
            }
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? "Deleting..." : "Delete"}
          </ConfirmButton>

          <Button variant="secondary" onClick={() => nav(-1)}>
            Back
          </Button>
        </div>
      </div>

      {dispatchMsg ? (
        <div className="rounded-2xl border border-emerald-300 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-sm text-emerald-700 dark:text-emerald-200">
          {dispatchMsg}
        </div>
      ) : null}

      {dispatchErr ? <ErrorState message={dispatchErr} /> : null}

      {loading ? (
        <Card><LoadingState /></Card>
      ) : error ? (
        <ErrorState message={error} />
      ) : !item ? (
        <Card>
          <p className="text-slate-600 dark:text-slate-300">Not found.</p>
        </Card>
      ) : editing ? (
        <Card className="border-brand-blue/40 dark:border-brand-blue/40 space-y-4">
          <p className="text-sm font-medium text-brand-blue dark:text-blue-300">Editing violation</p>

          {saveErr ? <ErrorState message={saveErr} /> : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-400">Title</p>
              <input
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:border-brand-blue focus:outline-none"
              />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-400">Category</p>
              <input
                value={editForm.type}
                onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:border-brand-blue focus:outline-none"
              />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-400">Status</p>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-brand-blue focus:outline-none"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s === "in_review" ? "In Review" : s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <SearchMultiSelect
            label="Violations"
            placeholder="Type to search & press Enter…"
            values={editForm.violations}
            onChange={(v) => setEditForm((f) => ({ ...f, violations: v }))}
            fetcher={asyncFilter(VIOLATIONS)}
          />

          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-400">Description</p>
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:border-brand-blue focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={cancelEdit} disabled={saving} icon={X}>
              Cancel
            </Button>
            <Button type="button" onClick={saveEdit} disabled={saving} icon={Save}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <InfoCard label="Title" value={item.title} />
            <InfoCard label="Category" value={item.type} />
            <InfoCard label="Status" value={<StatusBadge status={item.status} />} />
            <InfoCard label="Created" value={fmtDateTime(item.createdAt)} />
          </div>

          {/* ✅ Dispatch / Assignment */}
          <Card>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-400">Dispatch / Assignment</p>

            <div className="mt-2 text-sm text-slate-800 dark:text-slate-200">
              {stationName ? (
                <p>
                  Latest dispatch result:{" "}
                  <span className="text-slate-900 dark:text-slate-100 font-semibold">{stationName}</span>
                  {stationArea ? ` (${stationArea})` : ""}
                </p>
              ) : (
                <p className="text-slate-600 dark:text-slate-400">Not assigned yet.</p>
              )}
            </div>
          </Card>

          <Card>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-400">Violations</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Array.isArray(item.violations) && item.violations.length > 0 ? (
                item.violations.map((v) => (
                  <span
                    key={v}
                    className="rounded-full border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-950/50 px-3 py-1 text-xs text-slate-700 dark:text-slate-200"
                  >
                    {v}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">—</span>
              )}
            </div>
          </Card>

          <Card>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-400">Description</p>
            <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">{item.description || "—"}</p>
          </Card>

          {/* ✅ Evidence Viewer: Images, Videos, Audios */}
          <EvidenceViewer
            images={item.images || []}
            videos={item.videos || []}
            audios={item.audios || []}
          />

          <Card>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-400">Location</p>

            <div className="mt-3">
              <ViolationLocationPreview lat={lat} lng={lng} />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-500">Latitude</p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{lat != null ? String(lat) : "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-500">Longitude</p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{lng != null ? String(lng) : "—"}</p>
              </div>
            </div>

            <div className="mt-3">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-500">DMS (entered)</p>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{dms || "—"}</p>
            </div>

            {lat != null && lng != null ? (
              <div className="mt-3">
                <a
                  href={`https://www.google.com/maps?q=${lat},${lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-brand-blue dark:text-blue-300 underline hover:text-blue-700 dark:hover:text-blue-200"
                >
                  Open in Google Maps
                </a>
              </div>
            ) : null}
          </Card>
        </>
      )}
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <Card>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-400">{label}</p>
      <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100 break-words">{value || "—"}</div>
    </Card>
  );
}



