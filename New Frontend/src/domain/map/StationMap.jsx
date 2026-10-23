// Map of police stations and station areas — MapLibre with OpenStreetMap
// tiles (docs/18 §9). Loaded on demand (see ./index.js): it is the largest
// library in the panel.
//
// - stations   dots coloured by status; clicking one calls onSelect
// - area       a station's area of responsibility, outlined
// - pick       a draggable pin; moving it calls onPick(lat, lng)

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

const SRI_LANKA_BOUNDS = /** @type {[[number, number], [number, number]]} */ ([
  [79.5, 5.85],
  [81.95, 9.9],
]);

const STYLE = /** @type {import("maplibre-gl").StyleSpecification} */ ({
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
});

/** Reads a design token so the map matches the theme. @param {string} name */
const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * @typedef {object} MapStation
 * @property {string} id
 * @property {string} name
 * @property {number} lat
 * @property {number} lng
 * @property {"verified" | "unverified" | "inactive"} status
 */

/**
 * @param {{
 *   stations?: MapStation[],
 *   area?: any,
 *   pick?: { lat: number, lng: number } | null,
 *   onPick?: (lat: number, lng: number) => void,
 *   onSelect?: (id: string) => void,
 *   className?: string,
 *   label: string,
 * }} props
 */
export default function StationMap({ stations, area, pick, onPick, onSelect, className, label }) {
  const container = useRef(/** @type {HTMLDivElement | null} */ (null));
  const map = useRef(/** @type {maplibregl.Map | null} */ (null));
  const marker = useRef(/** @type {maplibregl.Marker | null} */ (null));
  const latest = useRef({ onPick, onSelect });
  useEffect(() => {
    latest.current = { onPick, onSelect };
  });

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: STYLE,
      bounds: SRI_LANKA_BOUNDS,
      fitBoundsOptions: { padding: 20 },
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("stations", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "stations",
        type: "circle",
        source: "stations",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3.5, 12, 7],
          "circle-color": [
            "match",
            ["get", "status"],
            "verified",
            token("--ev-action") || "#1a6db0",
            "unverified",
            token("--ev-attention") || "#e8681a",
            "#8a93a0",
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });
      m.addSource("area", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "area-fill",
        type: "fill",
        source: "area",
        paint: { "fill-color": token("--ev-action") || "#1a6db0", "fill-opacity": 0.12 },
      });
      m.addLayer({
        id: "area-line",
        type: "line",
        source: "area",
        paint: { "line-color": token("--ev-action") || "#1a6db0", "line-width": 2 },
      });
      m.on("click", "stations", (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) latest.current.onSelect?.(String(id));
      });
      m.on("mouseenter", "stations", () => {
        m.getCanvas().style.cursor = latest.current.onSelect ? "pointer" : "";
      });
      m.on("mouseleave", "stations", () => {
        m.getCanvas().style.cursor = "";
      });
      m.fire("ev:ready");
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);

  // Data: stations and area. Runs again when they change.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      /** @type {any} */ (m.getSource("stations"))?.setData({
        type: "FeatureCollection",
        features: (stations ?? []).map((s) => ({
          type: "Feature",
          properties: { id: s.id, name: s.name, status: s.status },
          geometry: { type: "Point", coordinates: [s.lng, s.lat] },
        })),
      });
      /** @type {any} */ (m.getSource("area"))?.setData(
        area
          ? { type: "Feature", properties: {}, geometry: area }
          : { type: "FeatureCollection", features: [] },
      );
      const bounds = new maplibregl.LngLatBounds();
      if (area) {
        const polygons = area.type === "Polygon" ? [area.coordinates] : area.coordinates;
        for (const polygon of polygons)
          for (const [lng, lat] of polygon[0]) bounds.extend([lng, lat]);
      }
      if (pick) bounds.extend([pick.lng, pick.lat]);
      if (!bounds.isEmpty()) {
        m.fitBounds(bounds, { padding: 48, maxZoom: area ? 14 : 13, duration: 0 });
      }
    };
    if (m.isStyleLoaded() && m.getSource("stations")) apply();
    else m.once("ev:ready", apply);
    // Fit only when the shape or pin changes, not on every drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations, area]);

  // The pin: shown when `pick` is set; draggable when onPick is given.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!pick) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = new maplibregl.Marker({
        color: token("--ev-attention") || "#e8681a",
        draggable: Boolean(onPick),
      })
        .setLngLat([pick.lng, pick.lat])
        .addTo(m);
      marker.current.on("dragend", () => {
        const p = marker.current?.getLngLat();
        if (p) latest.current.onPick?.(round(p.lat), round(p.lng));
      });
      m.jumpTo({ center: [pick.lng, pick.lat], zoom: Math.max(m.getZoom(), 12) });
    } else {
      marker.current.setLngLat([pick.lng, pick.lat]);
    }
  }, [pick, onPick]);

  // Picking by clicking the map, too.
  useEffect(() => {
    const m = map.current;
    if (!m || !onPick) return;
    /** @param {maplibregl.MapMouseEvent} e */
    const click = (e) => latest.current.onPick?.(round(e.lngLat.lat), round(e.lngLat.lng));
    m.on("click", click);
    return () => {
      m.off("click", click);
    };
  }, [onPick]);

  return (
    <div
      ref={container}
      role="region"
      aria-label={label}
      className={className ?? "h-80 w-full overflow-hidden rounded-lg border border-border"}
    />
  );
}

/** Six decimals ≈ 10 cm — plenty for a station. @param {number} n */
const round = (n) => Math.round(n * 1e6) / 1e6;
