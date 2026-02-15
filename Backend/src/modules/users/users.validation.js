function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function isUUID(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function isMongoObjectId(v) {
  return typeof v === "string" && /^[0-9a-f]{24}$/i.test(v);
}

export function validateCreate(body) {
  const errors = [];

  if (!isNonEmptyString(body.full_name)) errors.push("full_name is required");
  if (!isNonEmptyString(body.email)) errors.push("email is required");

  if (body.station_id) {
    // allow uuid OR mongo objectId OR any normal id string (for portability)
    if (!(isUUID(body.station_id) || isMongoObjectId(body.station_id) || typeof body.station_id === "string")) {
      errors.push("station_id must be a valid id string");
    }
  }

  return errors;
}
