/**
 * System Configuration Constants
 * 
 * Contains all configuration values, validation rules, and error messages
 * used throughout the Sri Lanka Police Stations system.
 */

// System configuration parameters
export const CONFIG = {
  EARTH_RADIUS_KM: 6371,              // Earth's radius in kilometers for distance calculations
  BOUNDING_BOX_THRESHOLD_DEG: 0.5,    // Degree threshold for bounding box optimization (~55km)
  DEGREES_TO_KM_FACTOR: 111,          // Approximate kilometers per degree of latitude/longitude
  DEFAULT_SEARCH_LIMIT: 3,            // Default number of stations to return
  MAX_SEARCH_LIMIT: 50,               // Maximum allowed search results
  COORDINATE_PRECISION: 4             // Decimal places for coordinate precision
};

// Validation boundaries and ranges
export const VALIDATION = {
  // Sri Lanka geographical boundaries
  SRI_LANKA_BOUNDS: {
    MIN_LAT: 5.916, MAX_LAT: 9.835,   // Latitude range covering Sri Lanka
    MIN_LNG: 79.652, MAX_LNG: 81.879  // Longitude range covering Sri Lanka
  },
  // Global coordinate validation ranges
  COORDINATE_RANGE: {
    MIN_LAT: -90, MAX_LAT: 90,        // Valid latitude range globally
    MIN_LNG: -180, MAX_LNG: 180       // Valid longitude range globally
  }
};

// User-friendly error messages
export const ERROR_MESSAGES = {
  INVALID_COORDINATES: 'Invalid coordinates provided',
  OUT_OF_BOUNDS: 'Coordinates are outside valid range',
  INVALID_LIMIT: 'Search limit must be a positive number',
  CALCULATION_FAILED: 'Distance calculation failed',
  INVALID_RADIUS: 'Radius must be a positive number',
  INVALID_AREA: 'Area must be a non-empty string'
};