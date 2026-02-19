// src/pages/regionalStations/RegionalStations.jsx
import React from "react";
import { MapPin, Plus, Search } from "lucide-react";
import {
  listRegionalStations,
  createRegionalStation,
} from "../../services/regionalStationsApi";

export default function RegionalStations() {
  const [stations, setStations] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  // filters
  const [q, setQ] = React.useState("");
  const [regionFilter, setRegionFilter] = React.useState("");

  // form state
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [lat, setLat] = React.useState("");
  const [lng, setLng] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function load(filters = {}) {
    try {
      setLoading(true);
      setError("");
      const res = await listRegionalStations(filters);
      // backend may return {data:[...]} or just [...]
      const data = Array.isArray(res) ? res : res?.data;
      setStations(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Failed to load stations");
      setStations([]);
    } finally {
      setLoading(false);
    }
  }

  // initial load
  React.useEffect(() => {
    load();
  }, []);

  // load when filters change (small debounce)
  React.useEffect(() => {
    const t = setTimeout(() => {
      load({ q, region: regionFilter });
    }, 250);
    return () => clearTimeout(t);
  }, [q, regionFilter]);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    // tiny validations
    if (!name.trim()) return setError("Station name is required");
    if (lat === "" || lng === "") return setError("Latitude and Longitude are required");

    const payload = {
      name: name.trim(),
      code: code.trim(),
      region: region.trim(),
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
      latitude: Number(lat),
      longitude: Number(lng),
    };

    if (Number.isNaN(payload.latitude) || Number.isNaN(payload.longitude)) {
      return setError("Latitude/Longitude must be valid numbers");
    }

    try {
      setSubmitting(true);
      await createRegionalStation(payload);

      // reset form
      setName("");
      setCode("");
      setRegion("");
      setAddress("");
      setPhone("");
      setEmail("");
      setLat("");
      setLng("");

      // reload using current filters
      load({ q, region: regionFilter });
    } catch (e) {
      setError(e.message || "Failed to create station");
    } finally {
      setSubmitting(false);
    }
  }

  // regions for dropdown
  const regions = React.useMemo(() => {
    const set = new Set();
    stations.forEach((s) => {
      const r = (s.region || "").trim();
      if (r) set.add(r);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [stations]);

  return (
    <div className="grid gap-4">
      {/* ================= CREATE STATION ================= */}
      <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
        {/* Left card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-cyan-400" />
            <p className="text-sm font-medium text-slate-200">Station Details</p>
          </div>

          <div className="mt-4 space-y-3">
            <Field label="Station Name" value={name} onChange={setName} placeholder="Galle Police Station" />

            <div className="grid grid-cols-2 gap-3">
              <Field label="Station Code" value={code} onChange={setCode} placeholder="GLL-01" />
              <Field label="Region" value={region} onChange={setRegion} placeholder="Galle" />
            </div>

            <Field label="Address" value={address} onChange={setAddress} placeholder="Main Street, Galle" />
          </div>
        </div>

        {/* Right card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm font-medium text-slate-200">Contact & Location</p>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone" value={phone} onChange={setPhone} placeholder="+94 91 222 3344" />
              <Field label="Email" value={email} onChange={setEmail} placeholder="galle@police.lk" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude" value={lat} onChange={setLat} placeholder="6.0535" />
              <Field label="Longitude" value={lng} onChange={setLng} placeholder="80.2210" />
            </div>

            {error ? (
              <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-700 bg-cyan-600/20 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-600/30 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                {submitting ? "Saving..." : "Add Station"}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* ================= LIST STATIONS ================= */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm font-medium text-slate-200">Regional Stations</p>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search station name / code / phone..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2 pl-9 pr-3 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none sm:w-[320px]"
              />
            </div>

            {/* Region filter */}
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
            >
              <option value="">All Regions</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            {(q || regionFilter) && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setRegionFilter("");
                }}
                className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 hover:bg-slate-950/60"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="mt-3">
          {loading ? (
            <p className="text-slate-300">Loading…</p>
          ) : stations.length === 0 ? (
            <p className="text-slate-400">No stations added yet.</p>
          ) : (
            <div className="divide-y divide-slate-800">
              {stations.map((s) => (
                <div key={s.id || s._id || `${s.name}-${s.code}`} className="py-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-slate-100">
                        {s.name}
                        {s.code ? (
                          <span className="ml-2 text-xs text-slate-400">({s.code})</span>
                        ) : null}
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        {(s.region || "—")} · {s.latitude ?? s.lat ?? "—"}, {s.longitude ?? s.lng ?? "—"}
                      </p>

                      {s.address ? <p className="mt-1 text-xs text-slate-500">{s.address}</p> : null}
                    </div>

                    <span className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-300">
                      Station
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================== Small reusable field ================== */
function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <p className="text-sm text-slate-400">{label}</p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
      />
    </div>
  );
}
