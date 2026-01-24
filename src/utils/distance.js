/**
 * Distance Calculation Utilities
 * Provides geographic distance calculations using the Haversine formula
 * @version 1.0.0
 */

import { CONFIG } from '../config/constants.js';
import { validateCoordinates } from './validation.js';

/**
 * Converts degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 * @throws {Error} If input is invalid
 */
export function toRadians(degrees) {
  if (typeof degrees !== 'number' || isNaN(degrees)) {
    throw new Error('Input must be a valid number');
  }
  return (degrees * Math.PI) / 180;
}

/**
 * Converts radians to degrees
 * @param {number} radians - Angle in radians
 * @returns {number} Angle in degrees
 * @throws {Error} If input is invalid
 */
export function toDegrees(radians) {
  if (typeof radians !== 'number' || isNaN(radians)) {
    throw new Error('Input must be a valid number');
  }
  return (radians * 180) / Math.PI;
}

/**
 * Calculates the great circle distance between two points on Earth using the Haversine formula
 * More accurate than flat geometry for geographic distances
 * 
 * @param {number} lat1 - Latitude of first point in degrees
 * @param {number} lon1 - Longitude of first point in degrees
 * @param {number} lat2 - Latitude of second point in degrees
 * @param {number} lon2 - Longitude of second point in degrees
 * @returns {number} Distance in kilometers
 * @throws {Error} If coordinates are invalid
 * 
 * @example
 * const distance = calculateDistance(6.9271, 79.8612, 7.2906, 80.6337);
 * console.log(`Distance: ${distance.toFixed(2)} km`);
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  // Input validation
  const validation1 = validateCoordinates(lat1, lon1);
  const validation2 = validateCoordinates(lat2, lon2);
  
  if (!validation1.isValid) {
    throw new Error(`Invalid first coordinate: ${validation1.errors.join(', ')}`);
  }
  
  if (!validation2.isValid) {
    throw new Error(`Invalid second coordinate: ${validation2.errors.join(', ')}`);
  }
  
  try {
    // Convert degrees to radians
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const lat1Rad = toRadians(lat1);
    const lat2Rad = toRadians(lat2);
    
    // Haversine formula
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = CONFIG.EARTH_RADIUS_KM * c;
    
    // Round to reasonable precision
    return Math.round(distance * Math.pow(10, CONFIG.COORDINATE_PRECISION)) / Math.pow(10, CONFIG.COORDINATE_PRECISION);
    
  } catch (error) {
    throw new Error(`Distance calculation failed: ${error.message}`);
  }
}

/**
 * Calculates distances for an array of police stations from a target point
 * @param {Array} stations - Array of police station objects
 * @param {number} targetLat - Target latitude
 * @param {number} targetLng - Target longitude
 * @returns {Array} Stations with distance information added
 */
export function calculateDistancesForStations(stations, targetLat, targetLng) {
  if (!Array.isArray(stations)) {
    throw new Error('Stations must be an array');
  }
  
  return stations.map(station => {
    try {
      const distance = calculateDistance(targetLat, targetLng, station.lat, station.lng);
      return {
        ...station,
        distanceKm: distance
      };
    } catch (error) {
      console.warn(`Failed to calculate distance for ${station.name}:`, error.message);
      return {
        ...station,
        distanceKm: Infinity // Place failed calculations at the end
      };
    }
  }).filter(station => station.distanceKm !== Infinity); // Remove failed calculations
}

/**
 * Gets stations within a bounding box for performance optimization
 * Uses simple coordinate difference instead of expensive distance calculation
 * @param {Array} stations - Array of police stations
 * @param {number} centerLat - Center latitude
 * @param {number} centerLng - Center longitude
 * @param {number} thresholdDeg - Threshold in degrees (default from config)
 * @returns {Array} Filtered stations within bounding box
 */
export function getBoundingBoxCandidates(stations, centerLat, centerLng, thresholdDeg = CONFIG.BOUNDING_BOX_THRESHOLD_DEG) {
  if (!Array.isArray(stations)) {
    throw new Error('Stations must be an array');
  }
  
  const candidates = stations.filter(station => {
    const latDiff = Math.abs(station.lat - centerLat);
    const lngDiff = Math.abs(station.lng - centerLng);
    return latDiff < thresholdDeg && lngDiff < thresholdDeg;
  });
  
  // Fallback: If no stations in bounding box (remote area), return all stations
  if (candidates.length === 0) {
    console.warn('No stations found in bounding box, expanding search to all stations');
    return stations;
  }
  
  return candidates;
}

/**
 * Estimates distance using faster approximation (Equirectangular projection)
 * Less accurate but much faster than Haversine - good for rough filtering
 * @param {number} lat1 - Latitude of first point in degrees
 * @param {number} lon1 - Longitude of first point in degrees
 * @param {number} lat2 - Latitude of second point in degrees
 * @param {number} lon2 - Longitude of second point in degrees
 * @returns {number} Approximate distance in kilometers
 */
export function approximateDistance(lat1, lon1, lat2, lon2) {
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const x = dLon * Math.cos((lat1Rad + lat2Rad) / 2);
  const y = dLat;
  
  return Math.sqrt(x * x + y * y) * CONFIG.EARTH_RADIUS_KM;
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use calculateDistance instead
 */
export function calcDistance(lat1, lon1, lat2, lon2) {
  console.warn('calcDistance is deprecated. Use calculateDistance instead.');
  return calculateDistance(lat1, lon1, lat2, lon2);
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use toRadians instead
 */
export function toRad(degrees) {
  console.warn('toRad is deprecated. Use toRadians instead.');
  return toRadians(degrees);
}