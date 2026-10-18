import React from "react";
import {
  normalizePlate,
  normalizePhone,
  isInSriLanka,
  MAX_INCIDENT_AGE_DAYS,
  DESCRIPTION_MIN,
  DESCRIPTION_MAX,
} from "../../../utils/complaint";

const INITIAL = {
  channel: "",
  callerName: "",
  callerMobile: "",
  callerAnonymous: false,

  occurredAt: "", // datetime-local string
  description: "",

  vehicleNumber: "",
  plateUnknown: false,
  vehicleType: "",
  vehicleModel: "",
  vehicleColor: "",

  violations: [], // catalog ids

  location: null, // { lat, lng }
  address: "",
};

// Applies to the entries the picker shows: empty vehicleTypes = any vehicle.
export function appliesTo(entry, vehicleType) {
  const types = Array.isArray(entry?.vehicleTypes) ? entry.vehicleTypes : [];
  return !vehicleType || types.length === 0 || types.includes(vehicleType);
}

// Field errors per section, mirroring the backend's validateStaffComplaint.
function validate(f, catalogById) {
  const e = {};

  if (!f.channel) e.channel = "Choose how this complaint came in";
  if (!f.callerAnonymous && f.callerMobile.trim() && !normalizePhone(f.callerMobile)) {
    e.callerMobile = "Enter a Sri Lankan number, e.g. 077 123 4567";
  }
  if (f.channel === "phone" && !f.callerAnonymous && !f.callerMobile.trim()) {
    e.callerMobile = "A call-back number is needed for a phoned-in complaint (or mark the caller anonymous)";
  }

  if (!f.occurredAt) {
    e.occurredAt = "When did it happen?";
  } else {
    const t = new Date(f.occurredAt).getTime();
    if (Number.isNaN(t)) e.occurredAt = "Enter a valid date and time";
    else if (t > Date.now() + 5 * 60 * 1000) e.occurredAt = "This can't be in the future";
    else if (t < Date.now() - MAX_INCIDENT_AGE_DAYS * 86400000) {
      e.occurredAt = `Incidents older than ${MAX_INCIDENT_AGE_DAYS} days can't be filed`;
    }
  }
  const desc = f.description.trim();
  if (desc.length < DESCRIPTION_MIN) e.description = `Describe what happened (at least ${DESCRIPTION_MIN} characters)`;
  else if (desc.length > DESCRIPTION_MAX) e.description = `Keep it under ${DESCRIPTION_MAX} characters`;

  if (!f.plateUnknown) {
    if (!f.vehicleNumber.trim()) e.vehicleNumber = "Enter the plate number, or mark it unknown";
    else if (!normalizePlate(f.vehicleNumber)) {
      e.vehicleNumber = "Not a Sri Lankan plate — e.g. WP CAB-1234, CAB-1234 or 250-1234";
    }
  }
  if (!f.vehicleType) e.vehicleType = "Choose the vehicle type";

  if (f.violations.length === 0) {
    e.violations = "Select at least one offence";
  } else if (f.vehicleType) {
    const wrong = f.violations
      .map((id) => catalogById.get(id))
      .filter((entry) => entry && !appliesTo(entry, f.vehicleType))
      .map((entry) => entry.name);
    if (wrong.length) e.violations = `Not applicable to a ${f.vehicleType}: ${wrong.join(", ")}`;
  }

  if (!f.location) e.location = "Drop a pin on the map or search for the place";
  else if (!isInSriLanka(f.location.lat, f.location.lng)) e.location = "The location must be in Sri Lanka";
  if (f.address.trim().length < 3) e.address = "Add an address or landmark the station can find";

  return e;
}

const SECTION_FIELDS = {
  source: ["channel", "callerMobile"],
  incident: ["occurredAt", "description"],
  vehicle: ["vehicleNumber", "vehicleType"],
  offences: ["violations"],
  location: ["location", "address"],
};

export function useComplaintForm(catalog) {
  const [form, setForm] = React.useState(INITIAL);
  const [showErrors, setShowErrors] = React.useState(false);

  const catalogById = React.useMemo(
    () => new Map((catalog || []).map((c) => [String(c.id || c._id), c])),
    [catalog]
  );

  const set = React.useCallback((patch) => setForm((f) => ({ ...f, ...patch })), []);

  const errors = React.useMemo(() => validate(form, catalogById), [form, catalogById]);

  const sectionComplete = Object.fromEntries(
    Object.entries(SECTION_FIELDS).map(([section, fields]) => [
      section,
      fields.every((k) => !errors[k]),
    ])
  );

  const isDirty =
    form.channel ||
    form.callerName.trim() ||
    form.callerMobile.trim() ||
    form.description.trim() ||
    form.vehicleNumber.trim() ||
    form.vehicleType ||
    form.violations.length > 0 ||
    form.location ||
    form.address.trim();

  const selectedOffences = form.violations.map((id) => catalogById.get(id)).filter(Boolean);
  const fineTotal = selectedOffences.reduce(
    (sum, o) => sum + (typeof o.fineAmount === "number" ? o.fineAmount : 0),
    0
  );
  const finesMissing = selectedOffences.some((o) => typeof o.fineAmount !== "number");

  const plate = form.plateUnknown ? null : normalizePlate(form.vehicleNumber);
  const titlePreview =
    selectedOffences.length > 0
      ? `${plate ?? (form.plateUnknown ? "Unknown plate" : "—")} — ${selectedOffences.map((o) => o.name).join(", ")}`
      : "";

  // Shown only after a submit attempt, so the form doesn't open full of red.
  const visibleErrors = showErrors ? errors : {};

  function toPayload() {
    return {
      channel: form.channel,
      callerName: form.callerAnonymous ? null : form.callerName.trim() || null,
      callerMobile: form.callerAnonymous ? null : form.callerMobile.trim() || null,
      callerAnonymous: form.callerAnonymous,
      occurredAt: new Date(form.occurredAt).toISOString(),
      description: form.description.trim(),
      vehicleNumber: form.plateUnknown ? null : form.vehicleNumber,
      plateUnknown: form.plateUnknown,
      vehicleType: form.vehicleType,
      vehicleModel: form.vehicleModel.trim() || null,
      vehicleColor: form.vehicleColor.trim() || null,
      violations: form.violations,
      location: form.location
        ? { lat: form.location.lat, lng: form.location.lng, address: form.address.trim() }
        : null,
    };
  }

  return {
    form,
    set,
    errors,
    visibleErrors,
    showErrors,
    setShowErrors,
    isValid: Object.keys(errors).length === 0,
    sectionComplete,
    isDirty: !!isDirty,
    catalogById,
    selectedOffences,
    fineTotal,
    finesMissing,
    plate,
    titlePreview,
    toPayload,
  };
}
