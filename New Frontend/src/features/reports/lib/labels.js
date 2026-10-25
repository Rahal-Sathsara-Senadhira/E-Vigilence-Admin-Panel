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
  evidence_download_failed: "Some of the reporter's evidence hasn't arrived from the app yet.",
  not_captured_in_app:
    "Some files were picked from the phone's gallery, not taken in the app — check they're recent.",
  time_in_future: "The app sent a time in the future; the time received is shown instead.",
  offence_vehicle_mismatch:
    "An offence doesn't apply to the vehicle type given — correct the vehicle type or the offence.",
  location_imprecise:
    "The pin came from a phone location less precise than 100 m — check the place before dispatch.",
};

/** How a mobile-app reporter set the pin (docs/11 §4). @type {Record<string, string>} */
export const LOCATION_SOURCE_LABELS = {
  gps: "the reporter's phone location at the time",
  photo: "where their photo was taken",
  map: "placed on the map",
  link: "from a Google Maps link",
  coordinates: "typed coordinates",
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
