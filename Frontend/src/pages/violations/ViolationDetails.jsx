import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { dispatchNearest, getViolation } from "../../services/violationsApi";
import { getDispatchByViolation } from "../../services/dispatchesApi";

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
  const [dispatchLoadErr, setDispatchLoadErr] = React.useState("");

  async function loadViolation() {
    const data = await getViolation(id);
    return data?.data ? data.data : data;
  }

  async function loadDispatch() {
    try {
      setDispatchLoadErr("");

      const res = await getDispatchByViolation(id);

      // axios style: res.data is the payload; fetch style: res itself is payload
      const top = res?.data ? res.data : res;

      // sometimes backend wraps again: { data: ... }
      const payload = top?.data ? top.data : top;

      // Normalize ALL possible shapes into the dispatch document
      // Possible shapes we handle:
      // 1) { dispatch: {...} }
      // 2) { data: { dispatch: {...} } } (extra wrap)
      // 3) { items: [...] }
      // 4) { items: [{dispatch:{...}}] }
      // 5) [...] (array)
      let dispatchDoc = null;

      if (payload?.dispatch) {
        dispatchDoc = payload.dispatch;
      } else if (payload?.data?.dispatch) {
        dispatchDoc = payload.data.dispatch;
      } else if (Array.isArray(payload?.items) && payload.items.length > 0) {
        const first = payload.items[0];
        dispatchDoc = first?.dispatch ? first.dispatch : first;
      } else if (Array.isArray(payload) && payload.length > 0) {
        const first = payload[0];
        dispatchDoc = first?.dispatch ? first.dispatch : first;
      } else {
        // if payload is already the dispatch doc
        // (e.g. directly returned dispatch object)
        dispatchDoc = payload || null;
      }

      // If we accidentally got {dispatch:{...}} still, unwrap safely
      if (dispatchDoc?.dispatch) dispatchDoc = dispatchDoc.dispatch;

      setLatestDispatch(dispatchDoc);
    } catch (e) {
      setLatestDispatch(null);
      setDispatchLoadErr(e?.message || "Could not load dispatch info");
    }
  }

  async function loadAll() {
    try {
      setError("");
      setLoading(true);

      const v = await loadViolation();
      setItem(v || null);

      // ✅ also load dispatch info so refresh keeps showing station
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

      // ✅ refresh both violation + dispatch from DB
      await loadAll();
    } catch (e) {
      setDispatchErr(e?.message || "Dispatch failed");
    } finally {
      setDispatching(false);
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
          <h2 className="text-lg font-semibold text-slate-100">Violation Details</h2>
          <p className="text-sm text-slate-400">Full record view</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onDispatchNearest}
            disabled={dispatching || loading}
            className="rounded-xl border border-cyan-700 bg-cyan-600/20 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-600/30 disabled:opacity-60"
          >
            {dispatching ? "Dispatching..." : "Send to Nearest Station"}
          </button>

          <button
            onClick={() => nav("/violations")}
            className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-2 text-sm text-slate-200 hover:bg-slate-950/70"
          >
            Back
          </button>
        </div>
      </div>

      {dispatchMsg ? (
        <div className="rounded-2xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-sm text-emerald-200">
          {dispatchMsg}
        </div>
      ) : null}

      {dispatchErr ? (
        <div className="rounded-2xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200">
          {dispatchErr}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300">
          Loading…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : !item ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300">
          Not found.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <InfoCard label="Title" value={item.title} />
            <InfoCard label="Category" value={item.type} />
            <InfoCard label="Status" value={item.status} />
            <InfoCard label="Created" value={fmtDateTime(item.createdAt)} />
          </div>

          {/* ✅ Dispatch / Assignment */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-sm text-slate-400">Dispatch / Assignment</p>

            <div className="mt-2 text-sm text-slate-200">
              {stationName ? (
                <p>
                  Latest dispatch result:{" "}
                  <span className="text-slate-100 font-semibold">{stationName}</span>
                  {stationArea ? ` (${stationArea})` : ""}
                </p>
              ) : (
                <p className="text-slate-400">Not assigned yet.</p>
              )}

              {/* If endpoint missing, show small hint for you (dev) */}
              {!stationName && dispatchLoadErr ? (
                <p className="mt-2 text-xs text-slate-500">
                  Dispatch exists but UI can’t fetch it yet. Backend needs a dispatch lookup endpoint.
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-sm text-slate-400">Violations</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Array.isArray(item.violations) && item.violations.length > 0 ? (
                item.violations.map((v) => (
                  <span
                    key={v}
                    className="rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1 text-xs text-slate-200"
                  >
                    {v}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">—</span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-sm text-slate-400">Description</p>
            <p className="mt-2 text-sm text-slate-100">{item.description || "—"}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <InfoCard label="Latitude" value={lat != null ? String(lat) : "—"} />
            <InfoCard label="Longitude" value={lng != null ? String(lng) : "—"} />
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-sm text-slate-400">DMS (entered)</p>
            <p className="mt-2 text-sm text-slate-100">{dms || "—"}</p>

            {lat != null && lng != null ? (
              <div className="mt-3">
                <a
                  href={`https://www.google.com/maps?q=${lat},${lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-cyan-300 underline hover:text-cyan-200"
                >
                  Open in Google Maps
                </a>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-100 break-words">{value || "—"}</p>
    </div>
  );
}