// src/pages/violations/NewComplaint.jsx
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
