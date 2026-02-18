import React from "react";
import { useNavigate, useParams } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

async function fetchJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg =
      json?.message ||
      json?.error ||
      (text && text.length < 250 ? text : "") ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

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

  React.useEffect(() => {
    (async () => {
      try {
        setError("");
        setLoading(true);
        const data = await fetchJson(`/api/violations/${id}`);
        setItem(data);
      } catch (e) {
        setError(e.message || "Failed to load violation");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

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

        <button
          onClick={() => nav("/violations")}
          className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-2 text-sm text-slate-200 hover:bg-slate-950/70"
        >
          Back
        </button>
      </div>

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
            <p className="text-sm text-slate-400">Location (DMS)</p>
            <p className="mt-2 font-mono text-sm text-slate-100">{dms || "—"}</p>

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
