// src/pages/violations/NewComplaint.jsx

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import SearchSelect from "../../components/SearchSelect";
import SearchMultiSelect from "../../components/SearchMultiSelect";
import FreeLocationPicker from "../../components/FreeLocationPicker";
import { findNearestPoliceStations } from "../../services/policeStations";
import { MapPin, Building2, Navigation, Car, AlertTriangle } from "lucide-react";
=======
import React from "react";
import { useNavigate } from "react-router-dom";
import SearchSelect from "../../components/SearchSelect";
import SearchMultiSelect from "../../components/SearchMultiSelect";
import { createViolation } from "../../services/violationsApi";


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

// simple async filter
const asyncFilter = (arr) => async (q) => {
  if (!q) return arr.slice(0, 8);
  const s = q.toLowerCase();
  return arr.filter((v) => v.toLowerCase().includes(s)).slice(0, 8);
};

export default function NewComplaint() {
  const nav = useNavigate();

  const [vehicleNumber, setVehicleNumber] = React.useState("");
  const [callerMobile, setCallerMobile] = React.useState("");
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


  // Owner requirement: DMS inputs
  const [latDms, setLatDms] = React.useState(`6°07'11.7"N`);
  const [lngDms, setLngDms] = React.useState(`80°12'50.8"E`);

  const [status, setStatus] = React.useState("open");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  const locationText = `${latDms} ${lngDms}`;

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    // Build payload for backend
    // Backend needs: title + locationText, others optional
    const title =
      (vehicleNumber?.trim()
        ? `${vehicleNumber.trim()} - ${violations?.[0] || "Violation"}`
        : violations?.[0] || "Violation") || "Violation";

    const descriptionParts = [];
    if (vehicleNumber.trim()) descriptionParts.push(`Vehicle: ${vehicleNumber.trim()}`);
    if (callerMobile.trim()) descriptionParts.push(`Caller: ${callerMobile.trim()}`);
    if (vehicleType.trim()) descriptionParts.push(`Type: ${vehicleType.trim()}`);
    if (violations?.length) descriptionParts.push(`Violations: ${violations.join(", ")}`);

    const description = descriptionParts.join(" | ");

    const payload = {
      title,
      description,
      category: "traffic",
      locationText, // owner format: "6°07'11.7\"N 80°12'50.8\"E"
      status,
    };

    try {
      setSubmitting(true);
      await createViolation(payload);
      nav("/violations");
    } catch (err) {
      setError(err.message || "Failed to create violation");
    } finally {
      setSubmitting(false);
    }
  }


  return (
    <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
      {/* Left card: vehicle + caller */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <p className="text-sm text-slate-400">Vehicle number</p>
        <input
          value={vehicleNumber}
          onChange={(e) => setVehicleNumber(e.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
          placeholder="e.g., ABC-1234"
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-sm text-slate-400">Caller Mobile Number</p>
            <input
              value={callerMobile}
              onChange={(e) => setCallerMobile(e.target.value)}
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

        <div className="mt-4">
          <p className="text-sm text-slate-400">Status</p>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
          >
            <option value="open">open</option>
            <option value="in_review">in_review</option>
            <option value="resolved">resolved</option>
          </select>
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

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <p className="text-xs text-slate-400">Title preview (auto)</p>
          <p className="mt-1 text-sm text-slate-100">
            {(vehicleNumber?.trim()
              ? `${vehicleNumber.trim()} - ${violations?.[0] || "Violation"}`
              : violations?.[0] || "Violation") || "Violation"}
          </p>
        </div>
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

      {/* Full width: Location (DMS input as owner requested) */}
      <div className="md:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-200">Location (DMS)</p>
          <p className="text-xs text-slate-500">
            Example: 6°07&apos;11.7&quot;N 80°12&apos;50.8&quot;E
          </p>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-sm text-slate-400">Latitude (N/S)</p>
            <input
              value={latDms}
              onChange={(e) => setLatDms(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
              placeholder={`6°07'11.7"N`}
            />
          </div>
          <div>
            <p className="text-sm text-slate-400">Longitude (E/W)</p>
            <input
              value={lngDms}
              onChange={(e) => setLngDms(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
              placeholder={`80°12'50.8"E`}
            />
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <p className="text-xs text-slate-400">Combined</p>
          <p className="mt-1 font-mono text-sm text-slate-100">{locationText}</p>
        </div>

        {error ? (
          <div className="mt-3 rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => nav("/violations")}
            className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-2 text-sm text-slate-200 hover:bg-slate-950/70"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl border border-cyan-700 bg-cyan-600/20 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-600/30 disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Create Complaint"}
          </button>
        </div>

      </div>
    </form>
  );
}
