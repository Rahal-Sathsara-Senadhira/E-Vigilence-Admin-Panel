// src/components/LocationPicker.jsx
import React from "react";
import {
  GoogleMap,
  Marker,
  Autocomplete,
  useJsApiLoader,
  DrawingManagerF,
} from "@react-google-maps/api";

const libraries = ["places", "drawing"];

const containerStyle = { width: "100%", height: "320px", borderRadius: "0.75rem" };

const defaultCenter = { lat: 6.9271, lng: 79.8612 }; // Colombo fallback – set your own

/**
 * value shape example:
 * {
 *   type: "point" | "circle" | "polygon",
 *   address?: string,
 *   point?: { lat: number, lng: number },
 *   circle?: { center: {lat,lng}, radius: number },
 *   polygon?: { path: Array<{lat,lng}> }
 * }
 */
export default function LocationPicker({
  label = "Location",
  value,
  onChange,
}) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries,
  });

  const mapRef = React.useRef(null);
  const autoRef = React.useRef(null);
  const shapeRef = React.useRef(null); // circle/polygon instance

  const [center, setCenter] = React.useState(value?.point || value?.circle?.center || value?.polygon?.path?.[0] || defaultCenter);
  const [zoom, setZoom] = React.useState(14);

  const setPoint = (latLng, address) => {
    onChange?.({
      type: "point",
      address,
      point: latLng,
    });
    setCenter(latLng);
  };

  const setCircle = (googleCircle, address) => {
    const center = googleCircle.getCenter().toJSON();
    const radius = googleCircle.getRadius();
    onChange?.({
      type: "circle",
      address,
      circle: { center, radius },
    });
    setCenter(center);
  };

  const setPolygon = (googlePolygon, address) => {
    const path = googlePolygon.getPath().getArray().map(p => p.toJSON());
    onChange?.({
      type: "polygon",
      address,
      polygon: { path },
    });
    if (path[0]) setCenter(path[0]);
  };

  const clearShape = () => {
    if (shapeRef.current) {
      shapeRef.current.setMap(null);
      shapeRef.current = null;
    }
  };

  const onMapClick = (e) => {
    // quick pin drop by clicking the map
    const latLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    clearShape();
    setPoint(latLng);
  };

  const onPlaceChanged = () => {
    const place = autoRef.current.getPlace();
    if (!place || !place.geometry) return;
    const loc = place.geometry.location.toJSON();
    setCenter(loc);
    setZoom(16);
    clearShape();
    setPoint(loc, place.formatted_address || place.name);
  };

  // Keep shape editable + keep value in sync while dragging/resizing
  React.useEffect(() => {
    if (!isLoaded || !shapeRef.current) return;

    const shp = shapeRef.current;
    if (shp instanceof window.google.maps.Circle) {
      const onChangeCircle = () => setCircle(shp, value?.address);
      shp.addListener("radius_changed", onChangeCircle);
      shp.addListener("center_changed", onChangeCircle);
      return () => {
        window.google.maps.event.clearInstanceListeners(shp);
      };
    }

    if (shp instanceof window.google.maps.Polygon) {
      const path = shp.getPath();
      const onChangePoly = () => setPolygon(shp, value?.address);
      path.addListener("insert_at", onChangePoly);
      path.addListener("remove_at", onChangePoly);
      path.addListener("set_at", onChangePoly);
      return () => {
        window.google.maps.event.clearInstanceListeners(path);
      };
    }
  }, [isLoaded, value?.address]);

  if (!isLoaded) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <p className="text-sm text-slate-400">{label}</p>
        <div className="mt-2 h-80 animate-pulse rounded-xl border border-slate-800 bg-slate-950/60" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <p className="text-sm text-slate-400">{label}</p>

      {/* Search bar */}
      <div className="mt-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Autocomplete
            onLoad={(ref) => (autoRef.current = ref)}
            onPlaceChanged={onPlaceChanged}
          >
            <input
              type="text"
              placeholder="Search address, landmark, or coordinates…"
              className="w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </Autocomplete>
        </div>
        <button
          onClick={() => {
            clearShape();
            onChange?.(undefined);
          }}
          className="rounded-xl border border-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
        >
          Clear
        </button>
      </div>

      {/* Map */}
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-800">
        <GoogleMap
          onLoad={(m) => (mapRef.current = m)}
          mapContainerStyle={containerStyle}
          center={center}
          zoom={zoom}
          onClick={onMapClick}
          options={{
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            clickableIcons: true,
            styles: [],
          }}
        >
          {/* Existing geometry render */}
          {value?.type === "point" && value.point && (
            <Marker position={value.point} draggable
              onDragEnd={(e) =>
                setPoint({ lat: e.latLng.lat(), lng: e.latLng.lng() }, value.address)
              }
            />
          )}

          {/* Drawing tools */}
          <DrawingManagerF
            onLoad={() => {}}
            onOverlayComplete={(e) => {
              clearShape();
              shapeRef.current = e.overlay;
              // Store & keep editable
              if (e.type === window.google.maps.drawing.OverlayType.CIRCLE) {
                e.overlay.setEditable(true);
                e.overlay.setDraggable(true);
                setCircle(e.overlay, value?.address);
              } else if (e.type === window.google.maps.drawing.OverlayType.POLYGON) {
                e.overlay.setEditable(true);
                setPolygon(e.overlay, value?.address);
              } else if (e.type === window.google.maps.drawing.OverlayType.MARKER) {
                const loc = e.overlay.getPosition().toJSON();
                e.overlay.setMap(null);
                shapeRef.current = null;
                setPoint(loc, value?.address);
              }
            }}
            options={{
              drawingControl: true,
              drawingControlOptions: {
                position: window.google.maps.ControlPosition.TOP_CENTER,
                drawingModes: ["marker", "circle", "polygon"],
              },
              circleOptions: {
                fillColor: "#22d3ee55",
                strokeColor: "#22d3ee",
                strokeWeight: 1.5,
                editable: true,
                draggable: true,
              },
              polygonOptions: {
                fillColor: "#22d3ee33",
                strokeColor: "#22d3ee",
                strokeWeight: 1.5,
                editable: true,
              },
            }}
          />
        </GoogleMap>
      </div>

      {/* Quick summary */}
      <div className="mt-3 text-xs text-slate-400">
        {value?.type === "point" && value.point && (
          <>Selected pin: <span className="text-slate-200">{value.point.lat.toFixed(6)}, {value.point.lng.toFixed(6)}</span></>
        )}
        {value?.type === "circle" && value.circle && (
          <>Selected area (circle): center <span className="text-slate-200">{value.circle.center.lat.toFixed(6)}, {value.circle.center.lng.toFixed(6)}</span>, radius <span className="text-slate-200">{Math.round(value.circle.radius)} m</span></>
        )}
        {value?.type === "polygon" && value.polygon && (
          <>Selected area (polygon): <span className="text-slate-200">{value.polygon.path.length}</span> points</>
        )}
        {!value && <>No location selected.</>}
      </div>
    </div>
  );
}
