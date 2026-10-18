import { normalizePlate } from "../../utils/plate.js";
import { normalizeSriLankanPhone } from "../../utils/phone.js";
import {
  VEHICLE_TYPES,
  COMPLAINT_CHANNELS,
  MAX_INCIDENT_AGE_DAYS,
  isInSriLanka,
} from "../../utils/complaintOptions.js";

const CREATE_STATUSES = new Set(["open", "pending"]);

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

export function validateCreate(body) {
  const errors = [];

  if (!isNonEmptyString(body.title)) errors.push("title is required");

  const dms = body.dms ?? body.locationText;

  if (body.location) {
    const { lat, lng } = body.location;
    if (typeof lat !== "number") errors.push("location.lat must be a number");
    if (typeof lng !== "number") errors.push("location.lng must be a number");
  } else if (!isNonEmptyString(dms)) {
    errors.push("location or dms or locationText is required");
  }

  if (!Array.isArray(body.violations) || body.violations.length === 0) {
    errors.push("violations must be a non-empty array");
  } else {
    const bad = body.violations.some((x) => !isNonEmptyString(String(x)));
    if (bad) errors.push("violations must contain non-empty strings");
  }

  // A new violation can only start at the beginning of the workflow — any
  // later status has to be reached through assertValidTransition (and, for
  // "verified", issues a citation), so it can't be set at creation time.
  if (body.status && !CREATE_STATUSES.has(String(body.status).trim().toLowerCase())) {
    errors.push(`status must be one of: ${Array.from(CREATE_STATUSES).join(", ")}`);
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Staff-created complaints (HQ / station staff via the New Complaint page).
// Stricter than validateCreate above, which stays for the machine-to-machine
// /ingest path. Returns { errors, value } where `value` holds the cleaned,
// normalized fields; offence ids are checked against the catalog by the
// controller (it needs the database).
// ---------------------------------------------------------------------------

const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 2000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

const optionalText = (v, max) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

export function validateStaffComplaint(body = {}) {
  const errors = [];
  const value = {};

  // Source
  if (!COMPLAINT_CHANNELS.includes(body.channel)) {
    errors.push(`channel must be one of: ${COMPLAINT_CHANNELS.join(", ")}`);
  }
  value.channel = body.channel;
  value.callerAnonymous = body.callerAnonymous === true;
  value.callerName = value.callerAnonymous ? null : optionalText(body.callerName, 100);

  if (value.callerAnonymous || !body.callerMobile) {
    value.callerMobile = null;
  } else {
    value.callerMobile = normalizeSriLankanPhone(body.callerMobile);
    if (!value.callerMobile) errors.push("callerMobile must be a valid Sri Lankan phone number");
  }
  // A phoned-in complaint needs a number to call back, unless anonymous.
  // (An invalid number was already reported above.)
  if (body.channel === "phone" && !value.callerAnonymous && !body.callerMobile) {
    errors.push("callerMobile is required for a phoned-in complaint (or mark the caller anonymous)");
  }

  // Incident
  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : null;
  if (!occurredAt || Number.isNaN(occurredAt.getTime())) {
    errors.push("occurredAt is required");
  } else {
    const now = Date.now();
    if (occurredAt.getTime() > now + CLOCK_SKEW_MS) {
      errors.push("occurredAt can't be in the future");
    } else if (occurredAt.getTime() < now - MAX_INCIDENT_AGE_DAYS * 24 * 3600 * 1000) {
      errors.push(`Incidents older than ${MAX_INCIDENT_AGE_DAYS} days can't be filed`);
    }
    value.occurredAt = occurredAt;
  }

  const description = String(body.description ?? "").trim();
  if (description.length < DESCRIPTION_MIN) {
    errors.push(`description must be at least ${DESCRIPTION_MIN} characters`);
  } else if (description.length > DESCRIPTION_MAX) {
    errors.push(`description must be at most ${DESCRIPTION_MAX} characters`);
  }
  value.description = description;

  // Vehicle
  value.plateUnknown = body.plateUnknown === true;
  if (value.plateUnknown) {
    value.vehicleNumber = null;
  } else {
    value.vehicleNumber = normalizePlate(body.vehicleNumber);
    if (!value.vehicleNumber) {
      errors.push(
        "vehicleNumber must be a Sri Lankan plate (e.g. WP CAB-1234, CAB-1234, 250-1234), or mark the plate unknown"
      );
    }
  }

  if (!VEHICLE_TYPES.includes(body.vehicleType)) {
    errors.push(`vehicleType must be one of: ${VEHICLE_TYPES.join(", ")}`);
  }
  value.vehicleType = body.vehicleType;
  value.vehicleModel = optionalText(body.vehicleModel, 60);
  value.vehicleColor = optionalText(body.vehicleColor, 30);

  // Offences — catalog ids only (no free text: a typo would otherwise become
  // a new catalog entry with no fine).
  const ids = Array.isArray(body.violations) ? body.violations.map(String) : [];
  if (ids.length === 0) errors.push("Select at least one offence");
  if (ids.some((id) => !/^[a-f0-9]{24}$/i.test(id))) {
    errors.push("violations must be Violation Catalog ids");
  }
  value.violations = [...new Set(ids)];

  // Location
  const lat = Number(body.location?.lat);
  const lng = Number(body.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    errors.push("location.lat and location.lng are required");
  } else if (!isInSriLanka(lat, lng)) {
    errors.push("The location must be in Sri Lanka");
  }
  const address = optionalText(body.location?.address, 300);
  if (!address || address.length < 3) errors.push("An address or landmark is required");
  value.location = { lat, lng, address };

  return { errors, value };
}
