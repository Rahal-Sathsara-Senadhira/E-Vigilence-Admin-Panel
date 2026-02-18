function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

const ALLOWED_STATUS = new Set([
  "open",
  "in_review",
  "resolved",
  "pending",
  "verified",
  "rejected",
]);

export function validateCreate(body) {
  const errors = [];

  if (!isNonEmptyString(body.title)) errors.push("title is required");

  const type = body.type ?? body.category;
  if (!isNonEmptyString(type)) errors.push("type (or category) is required");

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

  if (body.status && !ALLOWED_STATUS.has(String(body.status))) {
    errors.push(`status must be one of: ${Array.from(ALLOWED_STATUS).join(", ")}`);
  }

  return errors;
}
