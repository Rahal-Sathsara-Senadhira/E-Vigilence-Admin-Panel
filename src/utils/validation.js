/**
 * Input Validation Utilities for Police Stations System
 * Provides comprehensive validation for coordinates, limits, and other inputs
 * @version 1.0.0
 */

import { VALIDATION, ERROR_MESSAGES } from '../config/constants.js';

/**
 * Validates coordinate values
 * @param {number} lat - Latitude value
 * @param {number} lng - Longitude value
 * @param {boolean} strictSriLanka - Whether to validate within Sri Lanka bounds
 * @returns {{isValid: boolean, errors: string[]}} Validation result
 */
export function validateCoordinates(lat, lng, strictSriLanka = false) {
  const errors = [];
  
  // Type validation
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    errors.push('Coordinates must be numbers');
    return { isValid: false, errors };
  }
  
  // Range validation
  if (lat < VALIDATION.COORDINATE_RANGE.MIN_LAT || lat > VALIDATION.COORDINATE_RANGE.MAX_LAT) {
    errors.push(`Latitude must be between ${VALIDATION.COORDINATE_RANGE.MIN_LAT} and ${VALIDATION.COORDINATE_RANGE.MAX_LAT}`);
  }
  
  if (lng < VALIDATION.COORDINATE_RANGE.MIN_LNG || lng > VALIDATION.COORDINATE_RANGE.MAX_LNG) {
    errors.push(`Longitude must be between ${VALIDATION.COORDINATE_RANGE.MIN_LNG} and ${VALIDATION.COORDINATE_RANGE.MAX_LNG}`);
  }
  
  // NaN validation
  if (isNaN(lat) || isNaN(lng)) {
    errors.push('Coordinates cannot be NaN');
  }
  
  // Sri Lanka bounds validation
  if (strictSriLanka) {
    const bounds = VALIDATION.SRI_LANKA_BOUNDS;
    if (lat < bounds.MIN_LAT || lat > bounds.MAX_LAT || lng < bounds.MIN_LNG || lng > bounds.MAX_LNG) {
      errors.push('Coordinates are outside Sri Lanka bounds');
    }
  }
  
  return { isValid: errors.length === 0, errors };
}

/**
 * Validates search limit parameter
 * @param {number} limit - Search limit value
 * @param {number} maxLimit - Maximum allowed limit
 * @returns {{isValid: boolean, errors: string[]}} Validation result
 */
export function validateLimit(limit, maxLimit) {
  const errors = [];
  
  if (typeof limit !== 'number') {
    errors.push('Limit must be a number');
    return { isValid: false, errors };
  }
  
  if (isNaN(limit)) {
    errors.push('Limit cannot be NaN');
  }
  
  if (limit < 1) {
    errors.push('Limit must be at least 1');
  }
  
  if (limit > maxLimit) {
    errors.push(`Limit cannot exceed ${maxLimit}`);
  }
  
  return { isValid: errors.length === 0, errors };
}

/**
 * Validates radius parameter for radius-based searches
 * @param {number} radius - Radius value in kilometers
 * @returns {{isValid: boolean, errors: string[]}} Validation result
 */
export function validateRadius(radius) {
  const errors = [];
  
  if (typeof radius !== 'number') {
    errors.push('Radius must be a number');
    return { isValid: false, errors };
  }
  
  if (isNaN(radius)) {
    errors.push('Radius cannot be NaN');
  }
  
  if (radius <= 0) {
    errors.push('Radius must be greater than 0');
  }
  
  if (radius > 1000) { // Reasonable max radius for Sri Lanka
    errors.push('Radius cannot exceed 1000km');
  }
  
  return { isValid: errors.length === 0, errors };
}

/**
 * Validates area/district name parameter
 * @param {string} area - Area or district name
 * @returns {{isValid: boolean, errors: string[]}} Validation result
 */
export function validateArea(area) {
  const errors = [];
  
  if (typeof area !== 'string') {
    errors.push('Area must be a string');
    return { isValid: false, errors };
  }
  
  if (area.trim().length === 0) {
    errors.push('Area cannot be empty');
  }
  
  if (area.length > 100) {
    errors.push('Area name is too long (max 100 characters)');
  }
  
  return { isValid: errors.length === 0, errors };
}

/**
 * Validates a police station object structure
 * @param {Object} station - Police station object
 * @returns {{isValid: boolean, errors: string[]}} Validation result
 */
export function validateStationObject(station) {
  const errors = [];
  
  if (!station || typeof station !== 'object') {
    errors.push('Station must be an object');
    return { isValid: false, errors };
  }
  
  // Required fields validation
  const requiredFields = ['name', 'lat', 'lng', 'area'];
  requiredFields.forEach(field => {
    if (!(field in station)) {
      errors.push(`Missing required field: ${field}`);
    }
  });
  
  if (errors.length > 0) {
    return { isValid: false, errors };
  }
  
  // Field type validation
  if (typeof station.name !== 'string') {
    errors.push('Station name must be a string');
  }
  
  if (typeof station.area !== 'string') {
    errors.push('Station area must be a string');
  }
  
  // Coordinate validation
  const coordValidation = validateCoordinates(station.lat, station.lng);
  if (!coordValidation.isValid) {
    errors.push(...coordValidation.errors);
  }
  
  return { isValid: errors.length === 0, errors };
}

/**
 * Sanitizes and normalizes search parameters
 * @param {Object} params - Raw search parameters
 * @returns {Object} Sanitized parameters
 */
export function sanitizeSearchParams(params) {
  const sanitized = { ...params };
  
  // Normalize coordinates to reasonable precision
  if (typeof sanitized.lat === 'number') {
    sanitized.lat = Math.round(sanitized.lat * 10000) / 10000;
  }
  
  if (typeof sanitized.lng === 'number') {
    sanitized.lng = Math.round(sanitized.lng * 10000) / 10000;
  }
  
  // Normalize limit to integer
  if (typeof sanitized.limit === 'number') {
    sanitized.limit = Math.floor(Math.abs(sanitized.limit));
  }
  
  // Normalize radius
  if (typeof sanitized.radiusKm === 'number') {
    sanitized.radiusKm = Math.abs(sanitized.radiusKm);
  }
  
  // Normalize area string
  if (typeof sanitized.area === 'string') {
    sanitized.area = sanitized.area.trim();
  }
  
  return sanitized;
}