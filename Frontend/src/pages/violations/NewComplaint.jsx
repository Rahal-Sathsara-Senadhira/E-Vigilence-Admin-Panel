// src/pages/violations/NewComplaint.jsx
import React, { useState, useEffect } from "react";
import SearchSelect from "../../components/SearchSelect";
import SearchMultiSelect from "../../components/SearchMultiSelect";
import FreeLocationPicker from "../../components/FreeLocationPicker";
import { findNearestPoliceStations } from "../../services/policeStations";
import { MapPin, Building2, Navigation } from "lucide-react";

const VEHICLE_TYPES = [
  "Car",
  "Bike",
  "Three-Wheeler",
  "Bus",
  "Truck",
  "Van",
  "SUV",
  "Tractor",
  "Ambulance",
  "Fire Engine",
];

const VIOLATIONS = [
  "Speeding",
  "Driving Recklessly",
  "Wrong side Driving",
  "No Helmet",
  "No Seatbelt",
  "Red Light Jump",
  "Illegal Parking",
  "Using Mobile While Driving",
  "Expired License",
  "Overloading",
];

// Replace with real endpoints later (/api/lookup/vehicle-types?q=...)
const asyncFilter = (arr) => async (q) => {
  if (!q) return arr.slice(0, 8);
  const s = q.toLowerCase();
  return arr.filter((v) => v.toLowerCase().includes(s)).slice(0, 8);
};

export default function NewComplaint() {
  const [vehicleType, setVehicleType] = React.useState("");
  const [violations, setViolations] = React.useState([
    "Driving Recklessly",
    "Wrong side Driving",
  ]);
  // Location state will hold a point/circle/polygon payload from the map
  const [location, setLocation] = React.useState();
  const [nearestStation, setNearestStation] = useState(null);

  // When location changes, find the nearest station
  useEffect(() => {
    // console.log("Location changed:", location);
    if (location && location.type === "point" && location.point) {
      // NOTE: findNearestPoliceStations expects an object {lat, lng} OR (lat, lng)
      const results = findNearestPoliceStations({
        lat: Number(location.point.lat),
        lng: Number(location.point.lng),
      });
      // console.log("Station results:", results);
      
      // results is sorted by distance, take the first one
      if (results && results.length > 0) {
        setNearestStation(results[0]);
      } else {
        setNearestStation(null);
      }
    } else {
      setNearestStation(null);
    }
  }, [location]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Left card: vehicle + caller */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <p className="text-sm text-slate-400">Vehicle number</p>
        <input
          className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
          placeholder="e.g., ABC-1234"
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-sm text-slate-400">Caller Mobile Number</p>
            <input
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
              placeholder="+94 77 123 4567"
            />
          </div>

          <div>
            <SearchSelect
              label="Vehicle Type"
              placeholder="Type to search vehicle types…"
              value={vehicleType}
              onChange={setVehicleType}
              fetcher={asyncFilter(VEHICLE_TYPES)}
            />
          </div>
        </div>
      </div>

      {/* Right card: violations */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <SearchMultiSelect
          label="Violations"
          placeholder="Type to search & press Enter…"
          values={violations}
          onChange={setViolations}
          fetcher={asyncFilter(VIOLATIONS)}
        />
      </div>

      <div className="md:col-span-2 space-y-4">
        <FreeLocationPicker
          label="Location"
          value={location}
          onChange={setLocation}
        />

        {nearestStation && (
          <div className="animate-fade-in rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-4">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-cyan-500/10 p-3 text-cyan-400">
                <Building2 className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-semibold text-slate-100">
                  Recommended Station: {nearestStation.name}
                </h4>
                <div className="mt-1 flex flex-wrap gap-4 text-sm text-slate-400">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-slate-500" />
                    {nearestStation.area} Area
                  </span>
                  <span className="flex items-center gap-1">
                    <Navigation className="h-4 w-4 text-slate-500" />
                    {nearestStation.distanceKm.toFixed(1)} km away
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="rounded-lg bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20">
                  Nearest
                </span>
              </div>
            </div>
            {/* Optional: Add a "Confirm" button or similar here logic */}
          </div>
        )}
      </div>
    </div>
  );
}
