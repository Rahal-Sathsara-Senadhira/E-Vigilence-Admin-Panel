// src/pages/violations/NewComplaint.jsx
import React from "react";
import SearchSelect from "../../components/SearchSelect";
import SearchMultiSelect from "../../components/SearchMultiSelect";
import FreeLocationPicker from "../../components/FreeLocationPicker";

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

      {/* Full-width: location picker (free Leaflet + Nominatim) */}
      <div className="md:col-span-2">
        <FreeLocationPicker
          label="Location"
          value={location}
          onChange={setLocation}
        />
      </div>
    </div>
  );
}
