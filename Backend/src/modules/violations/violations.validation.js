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
