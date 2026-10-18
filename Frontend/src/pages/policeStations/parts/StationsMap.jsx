import React from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, GeoJSON, useMap } from "react-leaflet";
import * as L from "leaflet";

const SRI_LANKA = [
  [5.85, 79.5],
  [9.9, 81.95],
];

// Colour by state: verified (primary), unverified (orange), inactive (grey).
function markerStyle(s, highlighted) {
  const color = s.isActive === false ? "#94a3b8" : s.verified ? "#2563EB" : "#F2833A";
  return {
    radius: highlighted ? 9 : 6,
    color: highlighted ? "#0F172A" : "#ffffff",
    weight: highlighted ? 3 : 1.5,
    fillColor: color,
    fillOpacity: 0.9,
  };
}

function FitTo({ stations, jurisdiction }) {
  const map = useMap();
  const key = `${stations.length}:${stations[0]?.id ?? ""}:${jurisdiction ? "j" : ""}`;
  React.useEffect(() => {
    const pts = stations.filter((s) => s.lat != null).map((s) => [s.lat, s.lng]);
    if (jurisdiction) {
      try {
        const layer = L.geoJSON(jurisdiction);
        map.fitBounds(layer.getBounds().pad(0.2));
        return;
      } catch {
        /* fall through to points */
      }
    }
    if (pts.length === 1) map.setView(pts[0], 14);
    else if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
    else map.fitBounds(SRI_LANKA);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function StationsMap({ stations, onSelect, highlightId, jurisdiction, height = "h-[520px]" }) {
  return (
    <div className={`relative z-0 overflow-hidden rounded-2xl border border-line ${height}`}>
      <MapContainer bounds={SRI_LANKA} minZoom={7} className="h-full w-full" preferCanvas>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitTo stations={stations} jurisdiction={jurisdiction} />
        {jurisdiction ? (
          <GeoJSON
            key={JSON.stringify(jurisdiction).length}
            data={jurisdiction}
            style={{ color: "#2563EB", weight: 2, fillColor: "#2563EB", fillOpacity: 0.12 }}
          />
        ) : null}
        {stations
          .filter((s) => s.lat != null && s.lng != null)
          .map((s) => (
            <CircleMarker
              key={s.id}
              center={[s.lat, s.lng]}
              pathOptions={markerStyle(s, s.id === highlightId)}
              eventHandlers={onSelect ? { click: () => onSelect(s) } : undefined}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <span className="font-semibold">{s.name}</span>
                {s.stats?.openCases ? ` · ${s.stats.openCases} open` : ""}
              </Tooltip>
            </CircleMarker>
          ))}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex gap-3 rounded-lg bg-surface/90 px-3 py-1.5 text-xs text-ink shadow">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#2563EB]" />Verified</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#F2833A]" />Unverified</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#94a3b8]" />Inactive</span>
      </div>
    </div>
  );
}
