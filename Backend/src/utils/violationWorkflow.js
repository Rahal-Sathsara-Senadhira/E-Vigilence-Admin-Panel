import { HttpError } from "./httpError.js";

// Which roles may move a violation FROM a given status TO a given status.
// See VIOLATIONS_BUSINESS_LOGIC.md #3 for the reasoning behind each edge.
const TRANSITIONS = {
  open: { in_review: ["station_admin", "station_officer", "hq"], rejected: ["hq"] },
  pending: { in_review: ["station_admin", "station_officer", "hq"], rejected: ["hq"] },
  in_review: {
    verified: ["station_admin", "hq"],
    rejected: ["station_admin", "hq"],
    resolved: ["hq"],
  },
  verified: { resolved: ["hq"], rejected: ["hq"] }, // HQ can still overturn
  rejected: { in_review: ["hq"] }, // HQ can reopen
  resolved: {}, // terminal — no further transitions
};

// Throws HttpError(403) if `callerRole` isn't allowed to move a violation
// from `fromStatus` to `toStatus`, or HttpError(400) if the target status
// doesn't exist at all. A no-op transition (fromStatus === toStatus) is
// always allowed — this guard is about *changing* status, not re-saving it.
export function assertValidTransition(fromStatus, toStatus, callerRole) {
  if (fromStatus === toStatus) return;

  const edges = TRANSITIONS[fromStatus];
  if (!edges) {
    throw new HttpError(400, `Unknown status: ${fromStatus}`);
  }

  const allowedRoles = edges[toStatus];
  if (!allowedRoles) {
    throw new HttpError(
      403,
      `Cannot move a violation from "${fromStatus}" to "${toStatus}"`
    );
  }

  if (!allowedRoles.includes(callerRole)) {
    throw new HttpError(
      403,
      `Role "${callerRole}" is not allowed to move a violation from "${fromStatus}" to "${toStatus}"`
    );
  }
}

// Required-field checks for specific target statuses — kept alongside the
// transition map since the rule and the map are part of the same workflow.
export function assertRequiredFieldsForTransition(toStatus, violation, patch) {
  if (toStatus === "rejected") {
    const reason = patch.rejectionReason ?? violation.rejectionReason;
    if (!reason || !String(reason).trim()) {
      throw new HttpError(400, "rejectionReason is required to reject a violation");
    }
  }

  if (toStatus === "verified") {
    const images = patch.images ?? violation.images ?? [];
    const videos = patch.videos ?? violation.videos ?? [];
    const audios = patch.audios ?? violation.audios ?? [];
    if (images.length === 0 && videos.length === 0 && audios.length === 0) {
      throw new HttpError(400, "At least one evidence file is required to verify a violation");
    }
  }
}
