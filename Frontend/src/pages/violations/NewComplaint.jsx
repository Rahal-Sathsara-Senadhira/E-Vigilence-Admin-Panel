// src/pages/violations/NewComplaint.jsx

import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import SearchSelect from "../../components/SearchSelect";
import SearchMultiSelect from "../../components/SearchMultiSelect";
import FreeLocationPicker from "../../components/FreeLocationPicker";

import { findNearestPoliceStations } from "../../services/policeStations";
import { getNearestStation } from "../../services/regionalStationsApi";
import { createViolation, uploadEvidence } from "../../services/violationsApi";
import { VEHICLE_TYPES, VIOLATIONS, asyncFilter } from "../../utils/violationOptions";
import { showToast } from "../../utils/toastBus";

import { MapPin, Image, Video, Music, X, Loader2 } from "lucide-react";

// ✅ DMS <-> Decimal helpers
import { decimalToDmsLat, decimalToDmsLng, parseDmsPair } from "../../utils/dms";

const EVIDENCE_ACCEPT = {
  images: "image/jpeg,image/png,image/webp,image/gif",
  videos: "video/mp4,video/mpeg,video/quicktime,video/x-msvideo",
  audios: "audio/mpeg,audio/wav,audio/ogg,audio/aac",
};

export default function NewComplaint() {
  const nav = useNavigate();

  const [vehicleNumber, setVehicleNumber] = React.useState("");
  const [callerMobile, setCallerMobile] = React.useState("");
  const [vehicleType, setVehicleType] = React.useState("");

  // No pre-filled violations — a blank complaint should start blank, not
  // with two example violations that look like real selections.
  const [violations, setViolations] = React.useState([]);

  // Location state will hold a point payload from the map
  const [location, setLocation] = React.useState();
  const [nearestStation, setNearestStation] = useState(null);

  // No pre-filled coordinates either — an untouched location field should
  // read as empty, not as a specific real-looking place.
  const [latDms, setLatDms] = React.useState("");
  const [lngDms, setLngDms] = React.useState("");

  const [status, setStatus] = React.useState("open");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  // Evidence (optional)
  const [evidence, setEvidence] = React.useState({ images: [], videos: [], audios: [] });
  const [uploading, setUploading] = React.useState({ images: false, videos: false, audios: false });

  // ✅ Prevent infinite loop between map <-> inputs
  const skipNextInputToMapRef = useRef(false);
  const skipNextMapToInputRef = useRef(false);

  const locationText = latDms && lngDms ? `${latDms} ${lngDms}` : "";

  // ✅ show ALL selected violations (not only first one)
  const violationsLabel =
    Array.isArray(violations) && violations.length > 0
      ? violations.join(", ")
      : "Violation";

  const autoTitle =
    (vehicleNumber?.trim()
      ? `${vehicleNumber.trim()} - ${violationsLabel}`
      : violationsLabel) || "Violation";

  // Is there anything worth warning about before leaving the page?
  const isDirty =
    vehicleNumber.trim() ||
    callerMobile.trim() ||
    vehicleType.trim() ||
    violations.length > 0 ||
    latDms.trim() ||
    lngDms.trim();

  useEffect(() => {
    function onBeforeUnload(e) {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  // ✅ A) Map -> Inputs (when you place/move pin, update DMS inputs)
  useEffect(() => {
    if (!location || location.type !== "point" || !location.point) return;
    if (skipNextMapToInputRef.current) {
      skipNextMapToInputRef.current = false;
      return;
    }

    const { lat, lng } = location.point;

    // mark so Inputs->Map effect won't re-trigger
    skipNextInputToMapRef.current = true;

    setLatDms(decimalToDmsLat(Number(lat)));
    setLngDms(decimalToDmsLng(Number(lng)));
  }, [location?.type, location?.point?.lat, location?.point?.lng]);

  // ✅ B) Inputs -> Map (when DMS inputs valid, update map pin)
  useEffect(() => {
    if (skipNextInputToMapRef.current) {
      skipNextInputToMapRef.current = false;
      return;
    }

    const parsed = parseDmsPair(latDms, lngDms);
    if (!parsed) return;

    // mark so Map->Inputs effect won't re-trigger
    skipNextMapToInputRef.current = true;

    setLocation((prev) => {
      const prevPoint = prev?.type === "point" ? prev.point : null;
      if (
        prevPoint &&
        Math.abs(prevPoint.lat - parsed.lat) < 0.00001 &&
        Math.abs(prevPoint.lng - parsed.lng) < 0.00001
      ) {
        return prev;
      }
      return { type: "point", point: parsed };
    });
  }, [latDms, lngDms]);

  // Clearing the map (via FreeLocationPicker's Clear button) must also clear
  // the DMS text inputs — otherwise the map looks empty but the old
  // coordinates are still sitting in latDms/lngDms and still get submitted,
  // since `locationText` (what's actually sent) is built from those inputs.
  function handleLocationChange(next) {
    setLocation(next);
    if (!next) {
      skipNextMapToInputRef.current = true;
      setLatDms("");
      setLngDms("");
    }
  }

  // ✅ MongoDB-backed nearest station (with safe fallback to hardcoded list)
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (location && location.type === "point" && location.point) {
        const lat = Number(location.point.lat);
        const lng = Number(location.point.lng);

        if (Number.isNaN(lat) || Number.isNaN(lng)) {
          if (!cancelled) setNearestStation(null);
          return;
        }

        // 1) ✅ Try backend first (MongoDB)
        try {
          const res = await getNearestStation(lat, lng);
          const station = res?.station || res;

          if (station && !cancelled) {
            setNearestStation({
              name: station.name || "Nearest Station",
              area: station.region || station.area || "—",
              distanceKm:
                typeof res?.distanceKm === "number"
                  ? res.distanceKm
                  : typeof station.distanceKm === "number"
                  ? station.distanceKm
                  : 0,
            });
            return;
          }
        } catch {
          // ignore and fallback
        }

        // 2) ✅ Fallback to hardcoded list (temporary)
        const results = findNearestPoliceStations({ lat, lng });
        if (!cancelled) {
          if (results && results.length > 0) setNearestStation(results[0]);
          else setNearestStation(null);
        }
      } else {
        if (!cancelled) setNearestStation(null);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [location]);

  async function handleFilesSelected(kind, fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setUploading((u) => ({ ...u, [kind]: true }));
    try {
      const result = await uploadEvidence({ [kind]: files });
      const urls = result[kind] || [];
      setEvidence((e) => ({ ...e, [kind]: [...e[kind], ...urls] }));
    } catch {
      // uploadEvidence() already raises a toast on failure
    } finally {
      setUploading((u) => ({ ...u, [kind]: false }));
    }
  }

  function removeEvidenceUrl(kind, url) {
    setEvidence((e) => ({ ...e, [kind]: e[kind].filter((u) => u !== url) }));
  }

  function validate() {
    if (!violations || violations.length === 0) {
      return "Select at least one violation.";
    }
    if (!parseDmsPair(latDms, lngDms)) {
      return "Set a location — click the map, search an address, or enter valid DMS coordinates.";
    }
    return "";
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const descriptionParts = [];
    if (vehicleNumber.trim())
      descriptionParts.push(`Vehicle: ${vehicleNumber.trim()}`);
    if (callerMobile.trim())
      descriptionParts.push(`Caller: ${callerMobile.trim()}`);
    if (vehicleType.trim()) descriptionParts.push(`Type: ${vehicleType.trim()}`);
    if (violations?.length)
      descriptionParts.push(`Violations: ${violationsLabel}`);

    const description = descriptionParts.join(" | ");

    const payload = {
      title: autoTitle,
      description,
      category: "traffic",
      locationText, // DMS text ✅
      status,

      violations, // selected violations ✅

      vehicleNumber: vehicleNumber.trim() || null,
      callerMobile: callerMobile.trim() || null,
      vehicleType: vehicleType.trim() || null,

      images: evidence.images,
      videos: evidence.videos,
      audios: evidence.audios,
    };

    try {
      setSubmitting(true);
      await createViolation(payload);
      showToast("Complaint created successfully", "success");
      nav("/violations");
    } catch (err) {
      setError(err.message || "Failed to create violation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
      {error ? (
        <div className="md:col-span-2 rounded-2xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {/* Left card: vehicle + caller */}
      <div className="rounded-2xl border border-slate-400 dark:border-slate-700 bg-slate-300 dark:bg-slate-800 p-4">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-400">Vehicle number</p>
        <input
          value={vehicleNumber}
          onChange={(e) => setVehicleNumber(e.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-900 p-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
          placeholder="e.g., ABC-1234"
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-400">Caller Mobile Number</p>
            <input
              value={callerMobile}
              onChange={(e) => setCallerMobile(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-900 p-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
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
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-400">Status</p>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-900 p-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-cyan-500 focus:outline-none"
          >
            <option value="open">open</option>
            <option value="in_review">in_review</option>
            <option value="resolved">resolved</option>
          </select>
        </div>
      </div>

      {/* Right card: violations */}
      <div className="rounded-2xl border border-slate-400 dark:border-slate-700 bg-slate-300 dark:bg-slate-800 p-4">
        <SearchMultiSelect
          label="Violations *"
          placeholder="Type to search & press Enter…"
          values={violations}
          onChange={setViolations}
          fetcher={asyncFilter(VIOLATIONS)}
        />

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <p className="text-xs text-slate-400">Title preview (auto)</p>
          <p className="mt-1 text-sm text-slate-100">{autoTitle}</p>
        </div>
      </div>

      {/* Evidence (optional) */}
      <div className="md:col-span-2 rounded-2xl border border-slate-400 dark:border-slate-700 bg-slate-300 dark:bg-slate-800 p-4">
        <p className="text-sm font-medium text-slate-200">Evidence (optional)</p>
        <p className="mt-1 text-xs text-slate-500">
          Attach photos, videos, or audio recorded at the scene.
        </p>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <EvidenceField
            kind="images"
            label="Photos"
            icon={Image}
            accept={EVIDENCE_ACCEPT.images}
            urls={evidence.images}
            uploading={uploading.images}
            onSelect={(files) => handleFilesSelected("images", files)}
            onRemove={(url) => removeEvidenceUrl("images", url)}
          />
          <EvidenceField
            kind="videos"
            label="Videos"
            icon={Video}
            accept={EVIDENCE_ACCEPT.videos}
            urls={evidence.videos}
            uploading={uploading.videos}
            onSelect={(files) => handleFilesSelected("videos", files)}
            onRemove={(url) => removeEvidenceUrl("videos", url)}
          />
          <EvidenceField
            kind="audios"
            label="Audio"
            icon={Music}
            accept={EVIDENCE_ACCEPT.audios}
            urls={evidence.audios}
            uploading={uploading.audios}
            onSelect={(files) => handleFilesSelected("audios", files)}
            onRemove={(url) => removeEvidenceUrl("audios", url)}
          />
        </div>
      </div>

      {/* Location + nearest-station info */}
      <div className="md:col-span-2 space-y-3">
        <FreeLocationPicker
          label="Location"
          value={location}
          onChange={handleLocationChange}
          pointOnly
        />

        {nearestStation && (
          <div className="flex items-center gap-3 rounded-2xl border border-cyan-800/40 bg-cyan-950/20 p-3 text-sm">
            <MapPin className="h-4 w-4 shrink-0 text-cyan-400" />
            <p className="text-cyan-100">
              Nearest station: <span className="font-semibold">{nearestStation.name}</span>{" "}
              <span className="text-cyan-300/80">
                ({Number(nearestStation.distanceKm || 0).toFixed(1)} km · {nearestStation.area || "—"})
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Full width: Location (DMS input as owner requested) */}
      <div className="md:col-span-2 rounded-2xl border border-slate-400 dark:border-slate-700 bg-slate-300 dark:bg-slate-800 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-200">Location (DMS) *</p>
          <p className="text-xs text-slate-500">
            Example: 6°07&apos;11.7&quot;N 80°12&apos;50.8&quot;E
          </p>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Stays in sync with the map above — use whichever is easier, the last one you touch wins.
        </p>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-400">Latitude (N/S)</p>
            <input
              value={latDms}
              onChange={(e) => setLatDms(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-900 p-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
              placeholder={`6°07'11.7"N`}
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-400">Longitude (E/W)</p>
            <input
              value={lngDms}
              onChange={(e) => setLngDms(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-900 p-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
              placeholder={`80°12'50.8"E`}
            />
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <p className="text-xs text-slate-400">Combined (what gets submitted)</p>
          <p className="mt-1 font-mono text-sm text-slate-100">
            {locationText || "—"}
          </p>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (isDirty && !window.confirm("Discard this complaint?")) return;
              nav("/violations");
            }}
            className="rounded-xl border border-slate-600 bg-transparent px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-slate-800 dark:bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 dark:hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {submitting ? "Submitting..." : "Create Complaint"}
          </button>
        </div>
      </div>
    </form>
  );
}

function EvidenceField({ kind, label, icon: Icon, accept, urls, uploading, onSelect, onRemove }) {
  const inputId = `evidence-${kind}`;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <label
        htmlFor={inputId}
        className="flex cursor-pointer items-center gap-2 text-sm text-slate-300 hover:text-slate-100"
      >
        <Icon className="h-4 w-4 text-cyan-400" />
        {label}
        {uploading && <Loader2 className="h-3 w-3 animate-spin text-slate-500" />}
      </label>
      <input
        id={inputId}
        type="file"
        accept={accept}
        multiple
        className="sr-only"
        onChange={(e) => {
          onSelect(e.target.files);
          e.target.value = ""; // allow re-selecting the same file later
        }}
      />

      {urls.length > 0 && (
        <ul className="mt-2 space-y-1">
          {urls.map((url) => (
            <li
              key={url}
              className="flex items-center justify-between gap-2 rounded-lg bg-slate-900/60 px-2 py-1 text-xs text-slate-300"
            >
              <span className="truncate">{url.split("/").pop()}</span>
              <button
                type="button"
                onClick={() => onRemove(url)}
                className="text-slate-500 hover:text-red-400"
                aria-label={`Remove ${url}`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}



