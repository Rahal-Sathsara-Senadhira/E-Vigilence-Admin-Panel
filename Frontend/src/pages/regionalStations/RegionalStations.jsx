// src/pages/regionalStations/RegionalStations.jsx
import React from "react";
import { MapPin, Plus, Search } from "lucide-react";
import {
  listRegionalStations,
  createRegionalStation,
} from "../../services/regionalStationsApi";
import { api } from "../../services/api"; // ✅ added (for fallback fetch)

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

      // ✅ 1) Try existing endpoint (your app logic)
      let data = [];
      try {
        const res = await listRegionalStations(filters);
        const tmp = Array.isArray(res) ? res : res?.data;
        data = Array.isArray(tmp) ? tmp : [];
      } catch (e) {
        // ignore here; we'll fallback below
        data = [];
      }

      // ✅ 2) If empty, fallback to Mongo seeded police stations endpoint
      if (!Array.isArray(data) || data.length === 0) {
        try {
          const res2 = await api.get("/api/police-stations");
          const tmp2 = Array.isArray(res2) ? res2 : res2?.data;
          data = Array.isArray(tmp2) ? tmp2 : [];
        } catch (e2) {
          // Optional extra fallback if your backend uses different path
          // (won't break anything)
          try {
            const res3 = await api.get("/api/police-stations/all");
            const tmp3 = Array.isArray(res3) ? res3 : res3?.data;
            data = Array.isArray(tmp3) ? tmp3 : [];
          } catch {
            // keep empty, throw original later if needed
            data = [];
          }
        }
      }

      // ✅ 3) Client-side filtering (works for both schemas)
      const query = (filters?.q || "").toString().trim().toLowerCase();
      const regionQ = (filters?.region || "").toString().trim();

      const filtered = (Array.isArray(data) ? data : []).filter((s) => {
        const nameV = (s?.name || "").toString().toLowerCase();
        const codeV = (s?.code || "").toString().toLowerCase();
        const phoneV = (s?.phone || "").toString().toLowerCase();

        // RegionalStation: region | PoliceStation: area
        const regionV = (s?.region ?? s?.area ?? "").toString().trim();
        const regionLower = regionV.toLowerCase();

        const matchesQuery = query
          ? nameV.includes(query) ||
            codeV.includes(query) ||
            phoneV.includes(query) ||
            regionLower.includes(query)
          : true;

        const matchesRegion = regionQ ? regionV === regionQ : true;

        return matchesQuery && matchesRegion;
      });

      setStations(filtered);
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
    if (lat === "" || lng === "")
      return setError("Latitude and Longitude are required");

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

  // helpers to support both RegionalStation docs and PoliceStation docs
  const getStationRegion = (s) => {
    // RegionalStation uses `region`, PoliceStation uses `area`
    const r = (s?.region ?? s?.area ?? "").toString().trim();
    return r || "—";
  };

  const getStationLatLng = (s) => {
    // RegionalStation: latitude/longitude OR lat/lng
    const lat =
      s?.latitude ??
      s?.lat ??
      (Array.isArray(s?.location?.coordinates)
        ? s.location.coordinates[1]
        : undefined);
    const lng =
      s?.longitude ??
      s?.lng ??
      (Array.isArray(s?.location?.coordinates)
        ? s.location.coordinates[0]
        : undefined);

    return { lat, lng };
  };

  // regions/areas for dropdown
  const regions = React.useMemo(() => {
    const set = new Set();
    stations.forEach((s) => {
      const r = (s?.region ?? s?.area ?? "").toString().trim();
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
            <Field
              label="Station Name"
              value={name}
              onChange={setName}
              placeholder="Galle Police Station"
            />

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Station Code"
                value={code}
                onChange={setCode}
                placeholder="GLL-01"
              />
              <Field
                label="Region"
                value={region}
                onChange={setRegion}
                placeholder="Galle"
              />
            </div>

            <Field
              label="Address"
              value={address}
              onChange={setAddress}
              placeholder="Main Street, Galle"
            />
          </div>
        </div>

        {/* Right card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm font-medium text-slate-200">Contact & Location</p>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Phone"
                value={phone}
                onChange={setPhone}
                placeholder="091-1234567"
              />
              <Field
                label="Email"
                value={email}
                onChange={setEmail}
                placeholder="station@email.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Latitude"
                value={lat}
                onChange={setLat}
                placeholder="6.0535"
              />
              <Field
                label="Longitude"
                value={lng}
                onChange={setLng}
                placeholder="80.2210"
              />
            </div>

            {error ? (
              <p className="text-xs text-red-400">{error}</p>
            ) : null}

            <button
              disabled={submitting}
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {submitting ? "Adding..." : "Add Station"}
            </button>
          </div>
        </div>
      </form>

      {/* ================= LIST + FILTERS ================= */}
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
                className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 hover:border-slate-700"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="mt-4">
          {loading ? (
            <p className="text-slate-400">Loading...</p>
          ) : error ? (
            <p className="text-red-400">{error}</p>
          ) : stations.length === 0 ? (
            <p className="text-slate-400">No stations added yet.</p>
          ) : (
            <div className="divide-y divide-slate-800">
              {stations.map((s) => (
                <div
                  key={s.id || s._id || `${s.name}-${s.code}`}
                  className="py-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-slate-100">
                        {s.name}
                        {s.code ? (
                          <span className="ml-2 text-xs text-slate-400">
                            ({s.code})
                          </span>
                        ) : null}
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        {getStationRegion(s)} ·{" "}
                        {(() => {
                          const { lat, lng } = getStationLatLng(s);
                          return `${lat ?? "—"}, ${lng ?? "—"}`;
                        })()}
                      </p>

                      {s.address ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {s.address}
                        </p>
                      ) : null}
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

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
      />
    </label>
  );
}