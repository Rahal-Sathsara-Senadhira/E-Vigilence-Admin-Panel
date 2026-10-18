import React from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import { Search, LocateFixed, Loader2, MapPin, Building2 } from "lucide-react";
import { FormSection, Field } from "./formUi";
import { inputClass, inputState } from "./formStyles";
import { decimalToDmsLat, decimalToDmsLng } from "../../../utils/dms";
import { SRI_LANKA_BOUNDS } from "../../../utils/complaint";

const COLOMBO = [6.9271, 79.8612];
const B = SRI_LANKA_BOUNDS;
// Keep the map from wandering far outside Sri Lanka.
const MAX_BOUNDS = [
  [B.minLat - 1, B.minLng - 1],
  [B.maxLat + 1, B.maxLng + 1],
];

const NOMINATIM = "https://nominatim.openstreetmap.org";

async function searchPlaces(q, signal) {
  const url = `${NOMINATIM}/search?format=jsonv2&countrycodes=lk&limit=6&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal, headers: { "Accept-Language": "en" } });
  const data = await res.json();
  return data.map((d) => ({ label: d.display_name, lat: Number(d.lat), lng: Number(d.lon) }));
}

async function reverseGeocode(lat, lng) {
  const url = `${NOMINATIM}/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  const data = await res.json();
  return data?.display_name || null;
}

// Short, readable form of a Nominatim address ("Galle Road, Kollupitiya, Colombo").
const shorten = (label) => (label ? label.split(",").slice(0, 3).map((s) => s.trim()).join(", ") : "");

function ClickToPin({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function FlyTo({ point }) {
  const map = useMap();
  React.useEffect(() => {
    if (point) map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
  }, [map, point?.lat, point?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function LocationSection({ form, set, errors, complete, nearestStation }) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState([]);
  const [searching, setSearching] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  // The address field is filled from the map/search until the user types in
  // it themselves; after that it's theirs and is left alone.
  const addressIsAuto = React.useRef(true);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      return undefined;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        setSearching(true);
        setResults(await searchPlaces(q, ctrl.signal));
      } catch {
        if (!ctrl.signal.aborted) setResults([]);
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const pick = React.useCallback(
    async (lat, lng, label) => {
      set({ location: { lat, lng } });
      if (!addressIsAuto.current) return;
      if (label) {
        set({ address: shorten(label) });
        return;
      }
      try {
        const name = await reverseGeocode(lat, lng);
        if (name && addressIsAuto.current) set({ address: shorten(name) });
      } catch {
        /* address stays as typed */
      }
    },
    [set]
  );

  function locateMe() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        pick(pos.coords.latitude, pos.coords.longitude);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const point = form.location;

  return (
    <FormSection
      id="location"
      step={5}
      title="Location"
      subtitle="Where it happened. Click the map, drag the pin, or search."
      complete={complete}
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a road, junction or landmark in Sri Lanka…"
              aria-label="Search places"
              className={`${inputClass} ${inputState(false)} pl-9 pr-9`}
            />
            {searching ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />
            ) : null}
            {results.length > 0 ? (
              <ul className="absolute z-[1000] mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
                {results.map((r) => (
                  <li key={`${r.lat},${r.lng}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setResults([]);
                        setQuery("");
                        pick(r.lat, r.lng, r.label);
                      }}
                      className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-raised"
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                      <span className="line-clamp-2">{r.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            type="button"
            onClick={locateMe}
            disabled={locating}
            title="Use my current location"
            aria-label="Use my current location"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted hover:bg-raised hover:text-primary disabled:opacity-50"
          >
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          </button>
        </div>

        <div
          className={`relative z-0 h-80 overflow-hidden rounded-xl border ${
            errors.location ? "border-st-rejected" : "border-line"
          }`}
        >
          <MapContainer
            center={point ? [point.lat, point.lng] : COLOMBO}
            zoom={point ? 16 : 12}
            minZoom={7}
            maxBounds={MAX_BOUNDS}
            className="h-full w-full"
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ClickToPin onPick={(lat, lng) => pick(lat, lng)} />
            <FlyTo point={point} />
            {point ? (
              <Marker
                position={[point.lat, point.lng]}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const ll = e.target.getLatLng();
                    pick(ll.lat, ll.lng);
                  },
                }}
              />
            ) : null}
          </MapContainer>
          {!point ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[500] flex justify-center">
              <span className="rounded-full bg-ink/80 px-3 py-1 text-xs font-medium text-canvas">
                Click the map to drop a pin
              </span>
            </div>
          ) : null}
        </div>
        {errors.location ? (
          <p className="-mt-2 text-xs font-medium text-st-rejected" role="alert">
            {errors.location}
          </p>
        ) : null}

        {point ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span className="font-mono">
              {decimalToDmsLat(point.lat)} {decimalToDmsLng(point.lng)}
            </span>
            {nearestStation ? (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Nearest: <span className="font-semibold text-ink">{nearestStation.name}</span>
                {typeof nearestStation.distanceKm === "number"
                  ? ` · ${nearestStation.distanceKm.toFixed(1)} km`
                  : ""}
              </span>
            ) : null}
          </div>
        ) : null}

        <Field
          label="Address or landmark"
          htmlFor="address"
          required
          error={errors.address}
          hint="Filled in from the map — adjust it so an officer can find the spot."
        >
          <input
            id="address"
            value={form.address}
            onChange={(e) => {
              addressIsAuto.current = e.target.value.trim() === "";
              set({ address: e.target.value });
            }}
            maxLength={300}
            placeholder="e.g. Galle Road, near Liberty Plaza, Kollupitiya"
            className={`${inputClass} ${inputState(errors.address)}`}
          />
        </Field>
      </div>
    </FormSection>
  );
}
