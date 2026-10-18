// Enumerated values for staff-created complaints. Keep VEHICLE_TYPES in step
// with Frontend/src/utils/violationOptions.js.

export const VEHICLE_TYPES = [
  "Car",
  "Bike",
  "Three-Wheeler",
  "Bus",
  "Truck",
  "Van",
  "SUV",
  "Tractor",
  "Ambulance",
  "Fire Engine",
];

// How the complaint reached the police.
export const COMPLAINT_CHANNELS = ["phone", "walk_in", "officer", "other"];

// Oldest incident a complaint may be filed for.
export const MAX_INCIDENT_AGE_DAYS = 30;

// Rough bounding box of Sri Lanka (incl. coastal waters) — rejects pins
// dropped abroad or in the open sea by a mistyped coordinate.
export const SRI_LANKA_BOUNDS = { minLat: 5.85, maxLat: 9.9, minLng: 79.5, maxLng: 81.95 };

export function isInSriLanka(lat, lng) {
  const b = SRI_LANKA_BOUNDS;
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}
