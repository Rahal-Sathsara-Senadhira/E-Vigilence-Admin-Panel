function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

export function validateCreate(body) {
  const errors = [];

  if (!isNonEmptyString(body.title)) errors.push("title is required");
  if (!isNonEmptyString(body.type)) errors.push("type is required");

  // allow either { location: {lat,lng} } OR { dms: "..." }
  if (body.location) {
    const { lat, lng } = body.location;
    if (typeof lat !== "number") errors.push("location.lat must be a number");
    if (typeof lng !== "number") errors.push("location.lng must be a number");
  } else if (!isNonEmptyString(body.dms)) {
    errors.push("location or dms is required");
  }

  return errors;
}
