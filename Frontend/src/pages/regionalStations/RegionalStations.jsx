// src/pages/regionalStations/RegionalStations.jsx
import React from "react";
import { MapPin, Plus } from "lucide-react";
import {
  listRegionalStations,
  createRegionalStation,
} from "../../services/regionalStationsApi";

export default function RegionalStations() {
  const [stations, setStations] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

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

  async function load() {
    try {
      setLoading(true);
      const res = await listRegionalStations();
      setStations(res.data || []);
    } catch (e) {
      setError(e.message || "Failed to load stations");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      setSubmitting(true);
      await createRegionalStation({
        name,
        code,
        region,
        address,
        phone,
        email,
        latitude: Number(lat),
        longitude: Number(lng),
      });

      // reset form
      setName("");
      setCode("");
      setRegion("");
      setAddress("");
      setPhone("");
      setEmail("");
      setLat("");
      setLng("");

      load();
    } catch (e) {
      setError(e.message || "Failed to create station");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4">
      {/* ================= CREATE STATION ================= */}
      <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
        {/* Left card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-cyan-400" />
            <p className="text-sm font-medium text-slate-200">
              Station Details
            </p>
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
                placeholder="+94 91 222 3344"
              />
              <Field
                label="Email"
                value={email}
                onChange={setEmail}
                placeholder="galle@police.lk"
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
        <p className="text-sm font-medium text-slate-200">Regional Stations</p>

        <div className="mt-3">
          {loading ? (
            <p className="text-slate-300">Loading…</p>
          ) : stations.length === 0 ? (
            <p className="text-slate-400">No stations added yet.</p>
          ) : (
            <div className="divide-y divide-slate-800">
              {stations.map((s) => (
                <div key={s.id} className="py-3">
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
                        {s.region || "—"} · {s.latitude}, {s.longitude}
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
