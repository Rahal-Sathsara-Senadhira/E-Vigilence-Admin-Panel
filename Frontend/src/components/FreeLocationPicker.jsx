// src/components/FreeLocationPicker.jsx
import React from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { Locate } from "lucide-react";
import * as L from "leaflet"; // used for instanceof checks, creating layers, etc.

const DEFAULT_CENTER = [6.9271, 79.8612];
const containerStyle =
  "w-full h-80 rounded-xl overflow-hidden border border-slate-800";

/**
 * value shape:
 * { type:"point", point:{lat,lng}, address? }
 * { type:"circle", circle:{ center:{lat,lng}, radius }, address? }
 * { type:"polygon", polygon:{ path:[{lat,lng}...] }, address? }
 */

function GeomanControls({ value, onPoint, onCircle, onPolygon, onClear }) {
  const map = useMap();
  const activeLayerRef = React.useRef(null);
  const syncingRef = React.useRef(false); // ✅ prevents feedback loop

  const replaceActiveLayer = (layer) => {
    if (activeLayerRef.current) {
      try {
        activeLayerRef.current.remove();
      } catch {}
    }
    activeLayerRef.current = layer;
  };

  const cleanupGeomanLayers = (keep) => {
    try {
      const gLayers = map.pm.getGeomanLayers();
      const list = Array.isArray(gLayers) ? gLayers : Object.values(gLayers || {});
      list.forEach((l) => {
        if (keep && l === keep) return;
        try {
          l.remove();
        } catch {}
      });
    } catch {}
  };

  React.useEffect(() => {
    // Geoman is loaded globally via leaflet-geoman-setup.js and attaches to map.pm
    map.pm.addControls({
      position: "topright",
      drawCircle: true,
      drawMarker: true,
      drawPolygon: true,
      drawPolyline: false,
      drawRectangle: false,
      drawCircleMarker: false,
      editMode: true,
      dragMode: false,
      cutPolygon: false,
      removalMode: true,
    });

    const onCreate = (e) => {
      const layer = e.layer;

      // keep only the newly created layer
      if (activeLayerRef.current && activeLayerRef.current !== layer) {
        try {
          activeLayerRef.current.remove();
        } catch {}
      }

      cleanupGeomanLayers(layer);
      replaceActiveLayer(layer);

      if (layer instanceof L.Marker) {
        const { lat, lng } = layer.getLatLng();
        onPoint({ lat, lng });
      } else if (layer instanceof L.Circle) {
        const c = layer.getLatLng();
        onCircle({ lat: c.lat, lng: c.lng }, layer.getRadius());
      } else if (layer instanceof L.Polygon) {
        const raw = layer.getLatLngs()[0] || [];
        const path = raw.map((p) => ({ lat: p.lat, lng: p.lng }));
        onPolygon(path);
      }
    };

    const onEdit = () => {
      if (syncingRef.current) return; // ✅ skip programmatic updates

      const layer = activeLayerRef.current;
      if (!layer) return;

      if (layer instanceof L.Marker) {
        const { lat, lng } = layer.getLatLng();
        onPoint({ lat, lng }, value?.address);
      } else if (layer instanceof L.Circle) {
        const c = layer.getLatLng();
        onCircle({ lat: c.lat, lng: c.lng }, layer.getRadius(), value?.address);
      } else if (layer instanceof L.Polygon) {
        const raw = layer.getLatLngs()[0] || [];
        const path = raw.map((p) => ({ lat: p.lat, lng: p.lng }));
        onPolygon(path, value?.address);
      }
    };

    const onRemove = () => {
      replaceActiveLayer(null);
      onClear();
    };

    map.on("pm:create", onCreate);
    map.on("pm:edit", onEdit);
    map.on("pm:remove", onRemove);

    return () => {
      map.off("pm:create", onCreate);
      map.off("pm:edit", onEdit);
      map.off("pm:remove", onRemove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, onPoint, onCircle, onPolygon, onClear]);

  // click-to-pin when not drawing
  React.useEffect(() => {
    const onClick = (e) => {
      if (map.pm.globalDrawModeEnabled()) return;
      const { lat, lng } = e.latlng;

      // Remove previous layer
      if (activeLayerRef.current) {
        try {
          activeLayerRef.current.remove();
        } catch {}
      }

      cleanupGeomanLayers();

      const marker = L.marker([lat, lng]).addTo(map);
      replaceActiveLayer(marker);
      onPoint({ lat, lng });
    };

    map.on("click", onClick);
    return () => map.off("click", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, onPoint]);

  // ✅ IMPORTANT: reflect value on map (not only once — whenever value changes)
  React.useEffect(() => {
    if (!value) {
      if (activeLayerRef.current) {
        try {
          activeLayerRef.current.remove();
        } catch {}
      }
      cleanupGeomanLayers();
      replaceActiveLayer(null);
      return;
    }

    syncingRef.current = true;

    const applyPoint = (p) => {
      const layer = activeLayerRef.current;

      if (layer && layer instanceof L.Marker) {
        layer.setLatLng([p.lat, p.lng]);
      } else {
        cleanupGeomanLayers();
        const m = L.marker([p.lat, p.lng]).addTo(map);
        replaceActiveLayer(m);
      }
      map.setView([p.lat, p.lng], Math.max(map.getZoom(), 15), { animate: true });
    };

    const applyCircle = (c) => {
      const layer = activeLayerRef.current;

      if (layer && layer instanceof L.Circle) {
        layer.setLatLng([c.center.lat, c.center.lng]);
        layer.setRadius(c.radius);
      } else {
        cleanupGeomanLayers();
        const cir = L.circle([c.center.lat, c.center.lng], { radius: c.radius }).addTo(map);
        replaceActiveLayer(cir);
      }
      map.setView([c.center.lat, c.center.lng], Math.max(map.getZoom(), 15), {
        animate: true,
      });
    };

    const applyPolygon = (poly) => {
      const latlngs = poly.path.map((p) => [p.lat, p.lng]);
      const layer = activeLayerRef.current;

      if (layer && layer instanceof L.Polygon && !(layer instanceof L.Rectangle)) {
        layer.setLatLngs(latlngs);
      } else {
        cleanupGeomanLayers();
        const pg = L.polygon(latlngs).addTo(map);
        replaceActiveLayer(pg);
      }
      try {
        map.fitBounds(L.latLngBounds(latlngs), { maxZoom: 17, padding: [20, 20] });
      } catch {}
    };

    try {
      if (value.type === "point" && value.point) applyPoint(value.point);
      else if (value.type === "circle" && value.circle) applyCircle(value.circle);
      else if (value.type === "polygon" && value.polygon?.path?.length) applyPolygon(value.polygon);
    } finally {
      // release lock after a tick so pm:edit doesn’t fire loop updates
      setTimeout(() => {
        syncingRef.current = false;
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, value?.type, JSON.stringify(value)]);

  return null;
}

export default function FreeLocationPicker({ label = "Location", value, onChange }) {
  const [center, setCenter] = React.useState(
    (value?.point && [value.point.lat, value.point.lng]) ||
      (value?.circle?.center && [value.circle.center.lat, value.circle.center.lng]) ||
      (value?.polygon?.path?.[0] && [value.polygon.path[0].lat, value.polygon.path[0].lng]) ||
      DEFAULT_CENTER
  );

  const [search, setSearch] = React.useState("");
  const [suggestions, setSuggestions] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const debounceRef = React.useRef();

  const setPoint = (p, address) => {
    onChange?.({ type: "point", point: p, address });
    setCenter([p.lat, p.lng]);
  };

  const setCircle = (center, radius, address) => {
    onChange?.({ type: "circle", circle: { center, radius }, address });
    setCenter([center.lat, center.lng]);
  };

  const setPolygon = (path, address) => {
    onChange?.({ type: "polygon", polygon: { path }, address });
    if (path[0]) setCenter([path[0].lat, path[0].lng]);
  };

  const clearValue = () => onChange?.(undefined);

  // ✅ When value changes from outside (e.g. DMS inputs), keep map center reasonable
  React.useEffect(() => {
    if (!value) return;
    if (value.type === "point" && value.point) setCenter([value.point.lat, value.point.lng]);
    if (value.type === "circle" && value.circle)
      setCenter([value.circle.center.lat, value.circle.center.lng]);
    if (value.type === "polygon" && value.polygon?.path?.[0])
      setCenter([value.polygon.path[0].lat, value.polygon.path[0].lng]);
  }, [value]);

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setPoint({ lat: latitude, lng: longitude }, "My Location");
        setLoading(false);
      },
      (error) => {
        console.error(error);
        alert("Unable to retrieve your location");
        setLoading(false);
      }
    );
  };

  // Debounced OSM/Nominatim search
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!search) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
          search
        )}&addressdetails=1&limit=6`;
        const res = await fetch(url, { headers: { "Accept-Language": "en" } });
        const data = await res.json();
        setSuggestions(
          data.map((d) => ({
            label: d.display_name,
            lat: parseFloat(d.lat),
            lon: parseFloat(d.lon),
          }))
        );
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <p className="text-sm text-slate-400">{label}</p>

      {/* Search bar */}
      <div className="mt-2 flex gap-2">
        <div className="relative flex-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search address / landmark / coordinates…"
            className="w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
              loading…
            </div>
          )}
          {suggestions.length > 0 && (
            <ul className="absolute z-20 mt-2 max-h-60 w-full overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-1 shadow-xl">
              {suggestions.map((s, i) => (
                <li
                  key={i}
                  className="cursor-pointer rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSuggestions([]);
                    setSearch(s.label);
                    setPoint({ lat: s.lat, lng: s.lon }, s.label);
                  }}
                >
                  {s.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          title="Use my current location"
          onClick={handleLocateMe}
          className="inline-flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900 px-3 text-slate-400 hover:bg-slate-800 hover:text-cyan-400"
        >
          <Locate className="h-5 w-5" />
        </button>
      </div>

      {/* Map */}
      <div className={`mt-3 ${containerStyle}`}>
        <MapContainer center={center} zoom={15} className="h-full w-full">
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <GeomanControls
            value={value}
            onPoint={setPoint}
            onCircle={setCircle}
            onPolygon={setPolygon}
            onClear={clearValue}
          />

          {value?.type === "point" && value.point && (
            <Marker position={[value.point.lat, value.point.lng]}>
              <Popup>Selected pin</Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* Summary */}
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        {!value && <span>No location selected.</span>}
        {value?.type === "point" && (
          <span>
            Pin:{" "}
            <span className="text-slate-200">
              {value.point.lat.toFixed(6)}, {value.point.lng.toFixed(6)}
            </span>
          </span>
        )}
        {value?.type === "circle" && (
          <span>
            Circle: center{" "}
            <span className="text-slate-200">
              {value.circle.center.lat.toFixed(6)}, {value.circle.center.lng.toFixed(6)}
            </span>
            , r <span className="text-slate-200">{Math.round(value.circle.radius)} m</span>
          </span>
        )}
        {value?.type === "polygon" && (
          <span>
            Polygon: <span className="text-slate-200">{value.polygon.path.length}</span> points
          </span>
        )}
        <button
          type="button"
          onClick={clearValue}
          className="ml-auto rounded-lg border border-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
