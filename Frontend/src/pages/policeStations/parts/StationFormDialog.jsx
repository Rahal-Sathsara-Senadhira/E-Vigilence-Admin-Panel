import React from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import { Dialog, Field } from "./common";
import { fieldClass, btnPrimary, btnSecondary, GRADES } from "./styles";
import { createStation, updateStation } from "../../../services/stationsApi";
import { showToast } from "../../../utils/toastBus";

function PickPoint({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

const EMPTY = { name: "", code: "", divisionId: "", grade: "", phone: "", email: "", oicName: "", area: "", address: "", lat: "", lng: "" };

// Create or edit a station. `contactOnly` = a station admin editing their
// own station: only phone, email and OIC name are shown (the backend
// enforces the same).
export default function StationFormDialog({ open, onClose, onSaved, station, divisions, contactOnly = false }) {
  const editing = !!station;
  const [form, setForm] = React.useState(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setError("");
    setForm(
      station
        ? {
            name: station.name || "",
            code: station.code || "",
            divisionId: station.divisionId || "",
            grade: station.grade || "",
            phone: station.phone || "",
            email: station.email || "",
            oicName: station.oicName || "",
            area: station.area || "",
            address: station.address || "",
            lat: station.lat ?? "",
            lng: station.lng ?? "",
          }
        : EMPTY
    );
  }, [open, station]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const hasPin = form.lat !== "" && form.lng !== "";

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = contactOnly
        ? { phone: form.phone, email: form.email, oicName: form.oicName }
        : {
            name: form.name,
            code: form.code,
            divisionId: form.divisionId || null,
            grade: form.grade || null,
            phone: form.phone,
            email: form.email,
            oicName: form.oicName,
            area: form.area,
            address: form.address,
            lat: form.lat === "" ? undefined : Number(form.lat),
            lng: form.lng === "" ? undefined : Number(form.lng),
          };
      const saved = editing ? await updateStation(station.id, body) : await createStation(body);
      showToast(editing ? "Station updated" : "Station created — verify it once its details are confirmed", "success");
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError(e.message || "Couldn't save the station");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide={!contactOnly}
      title={contactOnly ? "Edit contact details" : editing ? `Edit ${station.name}` : "Add a police station"}
      subtitle={contactOnly ? "Name, location and division are managed by HQ." : "Click the map to place the station's pin."}
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {error ? (
        <p role="alert" className="mb-4 rounded-xl border border-st-rejected/40 bg-st-rejected/10 px-3 py-2 text-sm text-ink">
          {error}
        </p>
      ) : null}

      <div className={contactOnly ? "space-y-4" : "grid gap-5 md:grid-cols-2"}>
        <div className="space-y-4">
          {!contactOnly ? (
            <>
              <Field label="Station name" htmlFor="st-name" required>
                <input id="st-name" className={fieldClass} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Borella Police Station" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Station code" htmlFor="st-code" hint="Optional, unique">
                  <input id="st-code" className={fieldClass} value={form.code} onChange={(e) => set({ code: e.target.value })} />
                </Field>
                <Field label="Grade" htmlFor="st-grade">
                  <select id="st-grade" className={fieldClass} value={form.grade} onChange={(e) => set({ grade: e.target.value })}>
                    <option value="">Not set</option>
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Division" htmlFor="st-div" hint="Required before the station can be verified">
                <select id="st-div" className={fieldClass} value={form.divisionId} onChange={(e) => set({ divisionId: e.target.value })}>
                  <option value="">Not assigned</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} — {d.range}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Area" htmlFor="st-area">
                <input id="st-area" className={fieldClass} value={form.area} onChange={(e) => set({ area: e.target.value })} />
              </Field>
              <Field label="Address" htmlFor="st-address">
                <input id="st-address" className={fieldClass} value={form.address} onChange={(e) => set({ address: e.target.value })} />
              </Field>
            </>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" htmlFor="st-phone" hint="Sri Lankan number">
              <input id="st-phone" type="tel" className={fieldClass} value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="011 234 5678" />
            </Field>
            <Field label="Email" htmlFor="st-email">
              <input id="st-email" type="email" className={fieldClass} value={form.email} onChange={(e) => set({ email: e.target.value })} />
            </Field>
          </div>
          <Field label="Officer in charge (OIC)" htmlFor="st-oic">
            <input id="st-oic" className={fieldClass} value={form.oicName} onChange={(e) => set({ oicName: e.target.value })} placeholder="e.g. CI N. Perera" />
          </Field>
        </div>

        {!contactOnly ? (
          <div>
            <Field label="Location" required hint={hasPin ? `${Number(form.lat).toFixed(5)}, ${Number(form.lng).toFixed(5)}` : "Click the map to drop the pin"}>
              <div className="relative z-0 h-80 overflow-hidden rounded-xl border border-line">
                <MapContainer
                  center={hasPin ? [Number(form.lat), Number(form.lng)] : [7.8731, 80.7718]}
                  zoom={hasPin ? 15 : 7}
                  className="h-full w-full"
                >
                  <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <PickPoint onPick={(lat, lng) => set({ lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 })} />
                  {hasPin ? <Marker position={[Number(form.lat), Number(form.lng)]} /> : null}
                </MapContainer>
              </div>
            </Field>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
