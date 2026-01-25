/**
 * Police Stations Search Service
 * 
 * Core service module providing search and lookup functionality
 * for police stations across Sri Lanka with optimized performance.
 */

import { POLICE_STATIONS } from '../data/policeStationsData.js';
import { CONFIG } from '../config/constants.js';
import { 
  validateCoordinates, 
  validateLimit, 
  validateRadius, 
  validateArea,
  sanitizeSearchParams 
} from '../utils/validation.js';
import { 
  calculateDistancesForStations, 
  getBoundingBoxCandidates 
} from '../utils/distance.js';

/**
 * Finds the nearest police stations to a given coordinate
 * Uses bounding box optimization for performance with large datasets
 * 
 * @param {Object|number} coords - Coordinate object {lat, lng, limit?} or latitude number (legacy)
 * @param {number} coords.lat - Latitude in degrees (-90 to 90)
 * @param {number} coords.lng - Longitude in degrees (-180 to 180)
 * @param {number} [coords.limit=3] - Maximum number of stations to return (1-50)
 * @param {number} [legacyLng] - Legacy: longitude when first param is latitude
 * @param {number} [legacyLimit] - Legacy: limit when using legacy signature
 * 
 * @returns {Array<Object>} Array of police stations with distance information
 * @returns {string} returns[].name - Police station name
 * @returns {number} returns[].lat - Station latitude
 * @returns {number} returns[].lng - Station longitude
 * @returns {string} returns[].area - Station area/district
 * @returns {number} returns[].distanceKm - Distance from query point in kilometers
 * 
 * @throws {Error} If coordinates are invalid or out of bounds
 * 
 * @example
 * // Modern usage (recommended)
 * const nearest = findNearestPoliceStations({
 *   lat: 6.9271, 
 *   lng: 79.8612, 
 *   limit: 5
 * });
 * 
 * @example
 * // Legacy usage (still supported)
 * const nearest = findNearestPoliceStations(6.9271, 79.8612, 5);
 */
export function findNearestPoliceStations(coords, legacyLng, legacyLimit) {
  let lat, lng, limit;
  
  try {
    // Handle both modern object syntax and legacy parameters
    if (typeof coords === 'object' && coords !== null) {
      ({ lat, lng, limit = CONFIG.DEFAULT_SEARCH_LIMIT } = coords);
    } else if (typeof coords === 'number' && typeof legacyLng === 'number') {
      // Legacy signature support: findNearestPoliceStations(lat, lng, limit)
      lat = coords;
      lng = legacyLng;
      limit = legacyLimit || CONFIG.DEFAULT_SEARCH_LIMIT;
      console.warn('Using deprecated signature. Please use object syntax: {lat, lng, limit}');
    } else {
      throw new Error('Invalid arguments. Expected {lat, lng, limit?} or (lat, lng, limit?)');
    }
    
    // Sanitize inputs
    const sanitized = sanitizeSearchParams({ lat, lng, limit });
    ({ lat, lng, limit } = sanitized);
    
    // Validate and sanitize inputs
    const coordValidation = validateCoordinates(lat, lng, true); // Strict Sri Lanka validation
    if (!coordValidation.isValid) {
      throw new Error(`Invalid coordinates: ${coordValidation.errors.join(', ')}`);
    }
    
    const limitValidation = validateLimit(limit, CONFIG.MAX_SEARCH_LIMIT);
    if (!limitValidation.isValid) {
      throw new Error(`Invalid limit: ${limitValidation.errors.join(', ')}`);
    }
    
    // Performance optimization: Bounding box pre-filtering
    const candidates = getBoundingBoxCandidates(POLICE_STATIONS, lat, lng);
    
    // Calculate distances for candidates
    const stationsWithDistance = calculateDistancesForStations(candidates, lat, lng);
    
    // Sort by distance and return top results
    stationsWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);
    
    const results = stationsWithDistance.slice(0, limit);
    
    // Log performance info in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`Optimized search: ${candidates.length}/${POLICE_STATIONS.length} candidates evaluated`);
    }
    
    return results;
    
  } catch (error) {
    console.error('Error in findNearestPoliceStations:', error.message);
    throw new Error(`Police station search failed: ${error.message}`);
  }
}

/**
 * Gets all police stations within a specified radius
 * @param {Object} params - Search parameters
 * @param {number} params.lat - Center latitude
 * @param {number} params.lng - Center longitude
 * @param {number} params.radiusKm - Search radius in kilometers
 * @returns {Array<Object>} Police stations within radius, sorted by distance
 * @throws {Error} If parameters are invalid
 */
export function getPoliceStationsWithinRadius({ lat, lng, radiusKm }) {
  try {
    // Sanitize inputs
    const sanitized = sanitizeSearchParams({ lat, lng, radiusKm });
    ({ lat, lng, radiusKm } = sanitized);
    
    // Validation
    const coordValidation = validateCoordinates(lat, lng, true);
    if (!coordValidation.isValid) {
      throw new Error(`Invalid coordinates: ${coordValidation.errors.join(', ')}`);
    }
    
    const radiusValidation = validateRadius(radiusKm);
    if (!radiusValidation.isValid) {
      throw new Error(`Invalid radius: ${radiusValidation.errors.join(', ')}`);
    }
    
    // Get candidates within expanded bounding box (optimization)
    const expandedThreshold = (radiusKm / CONFIG.DEGREES_TO_KM_FACTOR) * 1.5; // 1.5x safety margin
    const candidates = getBoundingBoxCandidates(POLICE_STATIONS, lat, lng, expandedThreshold);
    
    // Calculate distances and filter by radius
    const allStationsWithDistance = calculateDistancesForStations(candidates, lat, lng);
    
    const results = allStationsWithDistance
      .filter(station => station.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`Radius search: ${results.length} stations found within ${radiusKm}km`);
    }
    
    return results;
    
  } catch (error) {
    console.error('Error in getPoliceStationsWithinRadius:', error.message);
    throw new Error(`Radius search failed: ${error.message}`);
  }
}

/**
 * Gets all police stations in a specific area/district
 * @param {string} area - Area or district name (case-insensitive)
 * @returns {Array<Object>} Police stations in the specified area
 * @throws {Error} If area parameter is invalid
 */
export function getPoliceStationsByArea(area) {
  try {
    // Validation
    const areaValidation = validateArea(area);
    if (!areaValidation.isValid) {
      throw new Error(`Invalid area: ${areaValidation.errors.join(', ')}`);
    }
    
    const searchArea = area.toLowerCase().trim();
    
    const results = POLICE_STATIONS.filter(station => 
      station.area.toLowerCase().includes(searchArea) ||
      station.name.toLowerCase().includes(searchArea)
    );
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`Area search: ${results.length} stations found for "${area}"`);
    }
    
    return results;
    
  } catch (error) {
    console.error('Error in getPoliceStationsByArea:', error.message);
    throw new Error(`Area search failed: ${error.message}`);
  }
}

/**
 * Gets a police station by exact name match
 * @param {string} name - Police station name
 * @returns {Object|null} Police station object or null if not found
 */
export function getPoliceStationByName(name) {
  try {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Station name must be a non-empty string');
    }
    
    const searchName = name.trim();
    
    // Try exact match first
    let station = POLICE_STATIONS.find(s => s.name === searchName);
    
    // Try case-insensitive match if exact match fails
    if (!station) {
      station = POLICE_STATIONS.find(s => 
        s.name.toLowerCase() === searchName.toLowerCase()
      );
    }
    
    return station || null;
    
  } catch (error) {
    console.error('Error in getPoliceStationByName:', error.message);
    throw new Error(`Station name search failed: ${error.message}`);
  }
}

/**
 * Gets all available areas/districts
 * @returns {Array<string>} Sorted list of unique areas
 */
export function getAllAreas() {
  const areas = [...new Set(POLICE_STATIONS.map(station => station.area))];
  return areas.sort();
}

/**
 * Gets statistics about the police stations dataset
 * @returns {Object} Dataset statistics
 */
export function getDatasetStatistics() {
  const areas = getAllAreas();
  const coordinates = POLICE_STATIONS.map(s => ({ lat: s.lat, lng: s.lng }));
  
  const latitudes = coordinates.map(c => c.lat);
  const longitudes = coordinates.map(c => c.lng);
  
  return {
    totalStations: POLICE_STATIONS.length,
    totalAreas: areas.length,
    areas: areas,
    coordinateRanges: {
      latitude: {
        min: Math.min(...latitudes),
        max: Math.max(...latitudes)
      },
      longitude: {
        min: Math.min(...longitudes),
        max: Math.max(...longitudes)
      }
    },
    lastUpdated: new Date().toISOString().split('T')[0]
  };
}