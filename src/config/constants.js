/**
 * Configuration Constants for Police Stations System
 * @version 1.0.0
 */

// ====== SYSTEM CONFIGURATION ======
export const CONFIG = {
  EARTH_RADIUS_KM: 6371, // Earth's radius in kilometers
  BOUNDING_BOX_THRESHOLD_DEG: 0.5, // ~55km radius for optimization
  DEGREES_TO_KM_FACTOR: 111, // Approximate km per degree
  DEFAULT_SEARCH_LIMIT: 3,
  MAX_SEARCH_LIMIT: 50,
  COORDINATE_PRECISION: 4 // Decimal places for coordinates
};

// ====== DATA VALIDATION CONSTANTS ======
export const VALIDATION = {
  SRI_LANKA_BOUNDS: {
    MIN_LAT: 5.916, MAX_LAT: 9.835,
    MIN_LNG: 79.652, MAX_LNG: 81.879
  },
  COORDINATE_RANGE: {
    MIN_LAT: -90, MAX_LAT: 90,
    MIN_LNG: -180, MAX_LNG: 180
  }
};

// ====== ERROR MESSAGES ======
export const ERROR_MESSAGES = {
  INVALID_COORDINATES: 'Invalid coordinates provided',
  OUT_OF_BOUNDS: 'Coordinates are outside valid range',
  INVALID_LIMIT: 'Search limit must be a positive number',
  CALCULATION_FAILED: 'Distance calculation failed',
  INVALID_RADIUS: 'Radius must be a positive number',
  INVALID_AREA: 'Area must be a non-empty string'
};