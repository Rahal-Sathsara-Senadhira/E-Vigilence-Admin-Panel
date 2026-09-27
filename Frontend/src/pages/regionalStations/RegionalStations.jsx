// src/pages/regionalStations/RegionalStations.jsx
import React from "react";
import { MapPin, Plus, Search, Pencil, X } from "lucide-react";
import {
  listRegionalStations,
  createRegionalStation,
  updateRegionalStation,
} from "../../services/regionalStationsApi";
import { Card, Button, Input, ErrorState, EmptyState, LoadingState } from "../../components/ui";

export default function RegionalStations() {
  const [stations, setStations] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  // filters
  const [q, setQ] = React.useState("");
  const [regionFilter, setRegionFilter] = React.useState("");

  // editing state
  const [editing, setEditing] = React.useState(null);

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

      // Regional stations only — this page must not silently substitute
      // Police Stations data (a different concept, managed on its own page)
      // just because the regional-stations list happens to be empty.
      let data = [];
      const res = await listRegionalStations(filters);
      const tmp = Array.isArray(res) ? res : res?.data;
      data = Array.isArray(tmp) ? tmp : [];

      // Client-side filtering
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

      if (editing) {
        // UPDATE
        await updateRegionalStation(editing.id || editing._id, payload);
      } else {
        // CREATE
        await createRegionalStation(payload);
      }

      // reset form
      setName("");
      setCode("");
      setRegion("");
      setAddress("");
      setPhone("");
      setEmail("");
      setLat("");
      setLng("");
      setEditing(null);

      // reload using current filters
      load({ q, region: regionFilter });
    } catch (e) {
      setError(e.message || (editing ? "Failed to update station" : "Failed to create station"));
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(s) {
    setEditing(s);
    setName(s.name || "");
    setCode(s.code || "");
    setRegion(s.region || s.area || "");
    setAddress(s.address || "");
    setPhone(s.phone || "");
    setEmail(s.email || "");

    const { lat, lng } = getStationLatLng(s);
    setLat(lat ? String(lat) : "");
    setLng(lng ? String(lng) : "");
    setError("");
  }

  function cancelEdit() {
    setEditing(null);
    setName("");
    setCode("");
    setRegion("");
    setAddress("");
    setPhone("");
    setEmail("");
    setLat("");
    setLng("");
    setError("");
  }

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
      {/* ================= CREATE/EDIT STATION ================= */}
      <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
        <Card
          title={
            <span className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-brand-blue" />
              {editing ? "Edit Station" : "Station Details"}
            </span>
          }
          action={
            editing && (
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            )
          }
        >
          <div className="space-y-3">
            <Input
              label="Station Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Galle Police Station"
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Station Code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="GLL-01"
              />
              <Input
                label="Region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Galle"
              />
            </div>

            <Input
              label="Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Main Street, Galle"
            />
          </div>
        </Card>

        <Card title="Contact & Location">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="091-1234567"
              />
              <Input
                label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="station@email.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Latitude"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="6.0535"
              />
              <Input
                label="Longitude"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="80.2210"
              />
            </div>

            {error ? <ErrorState message={error} /> : null}

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting} icon={Plus} className="flex-1">
                {submitting ? (editing ? "Saving..." : "Adding...") : (editing ? "Save Changes" : "Add Station")}
              </Button>

              {editing && (
                <Button type="button" variant="secondary" disabled={submitting} onClick={cancelEdit}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </Card>
      </form>

      {/* ================= LIST + FILTERS ================= */}
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage and configure regional station data</p>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search station name / code / phone..."
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-white focus:border-brand-blue focus:outline-none sm:w-[320px]"
              />
            </div>

            {/* Region filter */}
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-blue focus:outline-none"
            >
              <option value="">All Regions</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            {(q || regionFilter) && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setQ("");
                  setRegionFilter("");
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4">
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} />
          ) : stations.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No stations added yet."
              description="Use the form above to add the first regional station."
            />
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {stations.map((s) => (
                <div
                  key={s.id || s._id || `${s.name}-${s.code}`}
                  className="py-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {s.name}
                        {s.code ? (
                          <span className="ml-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
                            ({s.code})
                          </span>
                        ) : null}
                      </p>

                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        {getStationRegion(s)} ·{" "}
                        {(() => {
                          const { lat, lng } = getStationLatLng(s);
                          return `${lat ?? "—"}, ${lng ?? "—"}`;
                        })()}
                      </p>

                      {s.address ? (
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                          {s.address}
                        </p>
                      ) : null}
                    </div>

                    <Button variant="ghost" iconOnly onClick={() => openEdit(s)} title="Edit station">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
