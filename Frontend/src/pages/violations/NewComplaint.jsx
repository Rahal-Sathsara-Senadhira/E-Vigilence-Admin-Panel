// src/pages/violations/NewComplaint.jsx
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import SearchSelect from "../../components/SearchSelect";
import SearchMultiSelect from "../../components/SearchMultiSelect";
import FreeLocationPicker from "../../components/FreeLocationPicker";
import { findNearestPoliceStations } from "../../services/policeStations";
import { MapPin, Building2, Navigation, Car, AlertTriangle } from "lucide-react";

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
    console.log("Location updated:", location);
    
    if (location && location.type === "point" && location.point) {
      console.log("Valid point found:", location.point);
      
      const results = findNearestPoliceStations({
        lat: Number(location.point.lat),
        lng: Number(location.point.lng),
      });
      
      console.log("Nearest Station Results:", results);

      // results is sorted by distance, take the first one
      if (results && results.length > 0) {
        setNearestStation(results[0]);
        console.log("Setting nearest station:", results[0]);
      } else {
        setNearestStation(null);
        console.log("No results found.");
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

        <FreeLocationPicker
          label="Location"
          value={location}
          onChange={setLocation}
        />

        {nearestStation && createPortal(
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            {/* Modal Container */}
            <div className="w-full max-w-[400px] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 transform transition-all scale-100 opacity-100">
              
              {/* Blue Header */}
              <div className="bg-[#4285F4] px-6 py-4 text-center">
                <h3 className="text-base font-semibold text-white">
                  Traffic Violation Detected
                </h3>
              </div>

              {/* Body Content */}
              <div className="flex flex-col items-center px-8 pt-8 pb-6 text-center">
                
                {/* Illustration (Simulated with Icons) */}
                <div className="mb-6 relative h-24 w-32 flex items-center justify-center rounded-xl bg-blue-50">
                   {/* Police Car Icon */}
                   <div className="absolute left-6 top-8 z-10 text-slate-700">
                     <Car className="h-10 w-10 text-blue-900 fill-blue-900/20" />
                   </div>
                   {/* Pin Icon */}
                   <div className="absolute right-8 top-4 z-0 text-red-500">
                     <MapPin className="h-10 w-10 fill-red-500 text-red-600" />
                   </div>
                   {/* Path Graphic (Simple dot line) */}
                   <div className="absolute bottom-6 w-16 border-b-2 border-dashed border-slate-300 transform -rotate-6"></div>
                </div>

                {/* Headline */}
                <h2 className="text-xl font-bold text-slate-900">
                  Nearest Station Found
                </h2>

                {/* Subtext */}
                <div className="mt-3 text-[15px] leading-relaxed text-slate-500">
                  <p>Based on the detected location, the closest station is:</p>
                  <p className="font-semibold text-slate-800 mt-1 text-lg">
                    {nearestStation.name}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    ({nearestStation.distanceKm.toFixed(1)} km away • {nearestStation.area} Area)
                  </p>
                </div>

                {/* Buttons */}
                <div className="mt-8 grid w-full grid-cols-2 gap-3">
                  <button
                    onClick={() => setNearestStation(null)}
                    className="w-full rounded-full bg-slate-100 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                        console.log("Confirmed station:", nearestStation);
                        setNearestStation(null);
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-[#E55B42] py-3 text-sm font-semibold text-white shadow-md hover:bg-[#d64a31] transition-colors"
                  >
                    <span>Find Station</span>
                    <Navigation className="h-4 w-4" />
                  </button>
                </div>

                {/* Footer Privacy Text */}
                <p className="mt-6 text-[10px] text-slate-400 italic">
                  Your location data is used solely for the purpose.
                </p>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}
                 <div className="rounded-xl bg-cyan-500/10 p-3 text-cyan-400">
                   <Building2 className="h-8 w-8" />
                 </div>
                 <button 
                   onClick={() => setNearestStation(null)}
                   className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                 >
                   ✕
                 </button>
              </div>
              
              <div className="mt-4">
                <h4 className="text-xl font-bold text-slate-100">
                  Recommended Station
                </h4>
                <p className="text-lg text-cyan-400 font-medium mt-1">
                   {nearestStation.name}
                </p>
                
                <div className="mt-4 space-y-3 rounded-xl bg-slate-950/50 p-4 border border-slate-800">
                  <div className="flex items-center gap-3 text-sm text-slate-300">
                    <MapPin className="h-5 w-5 text-slate-500" />
                    <span>{nearestStation.area} Area</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate-300">
                    <Navigation className="h-5 w-5 text-slate-500" />
                    <span>{nearestStation.distanceKm.toFixed(1)} km away from incident</span>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                     onClick={() => setNearestStation(null)}
                     className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                  >
                    Close
                  </button>
                  <button
                     className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 shadow-lg shadow-cyan-900/20"
                     onClick={() => {
                        // Action to confirm selection
                        setNearestStation(null);
                     }}
                  >
                    Confirm Selection
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
