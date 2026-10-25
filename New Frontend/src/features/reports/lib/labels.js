// Words shown for report codes — docs/02.

export const CHANNEL_LABELS = {
  citizen_app: "Mobile app",
  whatsapp: "WhatsApp",
  phone: "Phone",
  walk_in: "Walk-in",
  officer: "Officer observed",
};

export const STATUS_LABELS = {
  pending: "Waiting for triage",
  needs_info: "Asked the reporter",
  awaiting_second_officer: "Needs a second officer",
  accepted: "Accepted",
  merged: "Merged",
  rejected: "Rejected",
};

export const REJECTION_LABELS = {
  not_an_offence: "Not a traffic offence we can act on",
  insufficient_evidence: "Evidence not enough",
  vehicle_unidentifiable: "Vehicle can't be identified",
  outside_jurisdiction: "Outside Sri Lanka Police's area",
  too_old: "More than 30 days ago",
  fabricated: "Fabricated (counts towards abuse)",
  abusive: "Abusive (counts towards abuse)",
  not_traffic: "Not a traffic matter",
  no_response: "No response to our question",
};

/** What triage should check on a mobile-app report — docs/11 §8, §9. */
export const FLAG_LABELS = {
  offence_not_recognised:
    "The offence the reporter typed isn't in the schedule — choose one, or reject.",
  plate_unrecognised: "The plate couldn't be read as a Sri Lankan plate — see the vehicle details.",
  evidence_download_failed: "Some evidence couldn't be fetched from the app.",
  not_captured_in_app:
    "Some files were picked from the phone's gallery, not taken in the app — check they're recent.",
  time_in_future: "The app sent a time in the future; the time received is shown instead.",
  offence_vehicle_mismatch:
    "An offence doesn't apply to the vehicle type given — correct the vehicle type or the offence.",
};

export const VEHICLE_TYPES = {
  motorcycle: "Motorcycle",
  three_wheeler: "Three-wheeler",
  car: "Car",
  van: "Van",
  bus: "Bus",
  lorry: "Lorry",
  tractor: "Tractor",
  other: "Other",
};

/** @param {string} key @param {Record<string, string>} map */
export const label = (key, map) => map[key] ?? key;
