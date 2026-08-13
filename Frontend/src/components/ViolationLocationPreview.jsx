import React from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";

// Small read-only map preview for the Violation Details page — no drawing,
// no editing, just "here's where this happened."
export default function ViolationLocationPreview({ lat, lng }) {
  if (lat == null || lng == null) {
    return (
      <p className="text-sm text-slate-500">No location recorded for this violation.</p>
    );
  }

  const position = [Number(lat), Number(lng)];

  return (
    <div className="h-64 w-full overflow-hidden rounded-xl border border-slate-800">
      <MapContainer center={position} zoom={15} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={position}>
          <Popup>Violation location</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
