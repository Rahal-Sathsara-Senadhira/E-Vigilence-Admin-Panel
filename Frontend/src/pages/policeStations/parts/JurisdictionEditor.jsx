import React from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import * as L from "leaflet";
import { Save, Trash2, AlertTriangle, Info } from "lucide-react";
import { setStationJurisdiction } from "../../../services/stationsApi";
import { showToast } from "../../../utils/toastBus";
import { btnPrimary, btnSecondary } from "./styles";

// Collects every drawn polygon/rectangle into one GeoJSON geometry
// ([lng, lat]): Polygon for one shape, MultiPolygon for several.
function collectGeometry(map) {
  const polygons = [];
  map.eachLayer((layer) => {
    if (!(layer instanceof L.Polygon)) return;
    const g = layer.toGeoJSON().geometry;
    if (g.type === "Polygon") polygons.push(g.coordinates);
    else if (g.type === "MultiPolygon") polygons.push(...g.coordinates);
  });
  if (polygons.length === 0) return null;
  return polygons.length === 1
    ? { type: "Polygon", coordinates: polygons[0] }
    : { type: "MultiPolygon", coordinates: polygons };
}

const STYLE = { color: "#2563EB", weight: 2, fillColor: "#2563EB", fillOpacity: 0.15 };

// Loads the saved shape as editable layers and (for HQ) adds the drawing
// toolbar. Reports edits upward so the Save button knows it's dirty.
function Editor({ jurisdiction, editable, onMap, onDirty }) {
  const map = useMap();

  React.useEffect(() => {
    onMap(map);
    const layers = [];
    if (jurisdiction) {
      L.geoJSON(jurisdiction, { style: STYLE }).eachLayer((l) => {
        l.addTo(map);
        layers.push(l);
      });
      try {
        map.fitBounds(L.featureGroup(layers).getBounds().pad(0.25));
      } catch {
        /* empty */
      }
    }

    if (editable && map.pm) {
      map.pm.setPathOptions(STYLE);
      map.pm.addControls({
        position: "topleft",
        drawPolygon: true,
        drawRectangle: true,
        editMode: true,
        removalMode: true,
        dragMode: false,
        drawMarker: false,
        drawCircleMarker: false,
        drawPolyline: false,
        drawCircle: false,
        drawText: false,
        cutPolygon: false,
        rotateMode: false,
      });
      const dirty = () => onDirty(true);
      map.on("pm:create", (e) => {
        e.layer.on("pm:edit", dirty);
        dirty();
      });
      map.on("pm:remove", dirty);
      layers.forEach((l) => l.on("pm:edit", dirty));
    }

    return () => {
      if (map.pm) map.pm.removeControls();
      map.off("pm:create");
      map.off("pm:remove");
      layers.forEach((l) => l.remove());
    };
  }, [map, jurisdiction, editable]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export default function JurisdictionEditor({ station, editable, onSaved }) {
  const mapRef = React.useRef(null);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [result, setResult] = React.useState(null);

  async function save(clear = false) {
    const geometry = clear ? null : collectGeometry(mapRef.current);
    if (!clear && !geometry) {
      showToast("Draw the area first — use the polygon or rectangle tool on the map", "error");
      return;
    }
    setSaving(true);
    try {
      const r = await setStationJurisdiction(station.id, geometry);
      setResult(r);
      setDirty(false);
      showToast(clear ? "Jurisdiction cleared" : "Jurisdiction saved", "success");
      onSaved?.(r.station);
    } catch {
      /* api client shows the error */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          {editable
            ? "Draw the area this station polices with the polygon or rectangle tool (top-left of the map). Cases inside it are dispatched here first; cases outside every drawn area go to the nearest station."
            : "The area this station polices. Cases inside it are dispatched here first."}
        </p>
        {editable ? (
          <div className="flex gap-2">
            {station.hasJurisdiction ? (
              <button type="button" className={btnSecondary} onClick={() => save(true)} disabled={saving}>
                <Trash2 className="h-4 w-4" /> Clear
              </button>
            ) : null}
            <button type="button" className={btnPrimary} onClick={() => save(false)} disabled={saving || !dirty}>
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save area"}
            </button>
          </div>
        ) : null}
      </div>

      {result?.overlaps?.length ? (
        <p className="flex items-start gap-2 rounded-xl border border-attention/50 bg-attention/10 px-3 py-2 text-sm text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-attention-ink" />
          Overlaps {result.overlaps.map((o) => o.name).join(", ")}. Cases in the overlap go to the smaller area and are flagged — consider adjusting the boundary.
        </p>
      ) : null}
      {result && result.station?.hasJurisdiction && result.containsOwnPin === false ? (
        <p className="flex items-start gap-2 rounded-xl border border-line bg-raised px-3 py-2 text-sm text-ink">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          The station's own pin is outside this area. That's allowed, but double-check the boundary.
        </p>
      ) : null}

      <div className="relative z-0 h-[520px] overflow-hidden rounded-2xl border border-line">
        <MapContainer center={[station.lat, station.lng]} zoom={13} minZoom={7} className="h-full w-full">
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Editor
            jurisdiction={station.jurisdiction}
            editable={editable}
            onMap={(m) => (mapRef.current = m)}
            onDirty={setDirty}
          />
          <CircleMarker
            center={[station.lat, station.lng]}
            pathOptions={{ radius: 8, color: "#0F172A", weight: 3, fillColor: "#2563EB", fillOpacity: 1 }}
            pmIgnore
          >
            <Tooltip permanent direction="top" offset={[0, -8]}>
              {station.name}
            </Tooltip>
          </CircleMarker>
        </MapContainer>
      </div>
      {station.jurisdictionAreaKm2 ? (
        <p className="text-xs text-muted">Current area: {station.jurisdictionAreaKm2} km²</p>
      ) : null}
    </div>
  );
}
