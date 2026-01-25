/**
 * Random Location Generator for Sri Lanka
 * Generates random coordinates within Sri Lanka bounds for testing
 * @version 1.0.0
 */

import { VALIDATION } from '../../src/config/constants.js';

// Sri Lanka administrative boundaries for realistic random locations
const SRI_LANKA_REGIONS = {
  WESTERN: { minLat: 6.5, maxLat: 7.5, minLng: 79.6, maxLng: 80.2 },
  CENTRAL: { minLat: 6.8, maxLat: 7.5, minLng: 80.2, maxLng: 81.0 },
  SOUTHERN: { minLat: 5.9, maxLat: 6.8, minLng: 80.0, maxLng: 81.2 },
  NORTHERN: { minLat: 8.5, maxLat: 9.9, minLng: 79.7, maxLng: 80.8 },
  EASTERN: { minLat: 6.8, maxLat: 8.6, minLng: 81.0, maxLng: 81.9 },
  NORTH_WESTERN: { minLat: 7.2, maxLat: 8.4, minLng: 79.6, maxLng: 80.4 },
  NORTH_CENTRAL: { minLat: 7.4, maxLat: 8.9, minLng: 80.0, maxLng: 81.3 },
  UVA: { minLat: 6.5, maxLat: 7.4, minLng: 80.8, maxLng: 81.6 },
  SABARAGAMUWA: { minLat: 6.3, maxLat: 7.3, minLng: 80.0, maxLng: 80.9 }
};

// Major cities with their approximate boundaries for focused testing
const MAJOR_CITIES = [
  { name: 'Colombo', lat: 6.9271, lng: 79.8612, radius: 0.2 },
  { name: 'Kandy', lat: 7.2906, lng: 80.6337, radius: 0.15 },
  { name: 'Galle', lat: 6.0329, lng: 80.2168, radius: 0.1 },
  { name: 'Jaffna', lat: 9.6615, lng: 80.0255, radius: 0.1 },
  { name: 'Negombo', lat: 7.2008, lng: 79.8407, radius: 0.08 },
  { name: 'Anuradhapura', lat: 8.3114, lng: 80.4037, radius: 0.1 },
  { name: 'Matara', lat: 5.9496, lng: 80.5480, radius: 0.08 },
  { name: 'Batticaloa', lat: 7.7170, lng: 81.7000, radius: 0.08 },
  { name: 'Trincomalee', lat: 8.5711, lng: 81.2335, radius: 0.08 },
  { name: 'Ratnapura', lat: 6.6828, lng: 80.3992, radius: 0.08 }
];

// Tourist locations for special testing scenarios
const TOURIST_LOCATIONS = [
  { name: 'Sigiriya', lat: 7.9541, lng: 80.7547 },
  { name: 'Ella', lat: 6.8667, lng: 81.0467 },
  { name: 'Mirissa', lat: 5.9467, lng: 80.4586 },
  { name: 'Nuwara Eliya', lat: 6.9497, lng: 80.7891 },
  { name: 'Dambulla', lat: 7.8742, lng: 80.6511 },
  { name: 'Polonnaruwa', lat: 7.9403, lng: 81.0188 },
  { name: 'Hikkaduwa', lat: 6.1400, lng: 80.1000 },
  { name: 'Bentota', lat: 6.4200, lng: 80.0050 },
  { name: 'Unawatuna', lat: 6.0105, lng: 80.2464 },
  { name: 'Arugam Bay', lat: 6.8400, lng: 81.8356 }
];

/**
 * Generates a random number between min and max
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random number
 */
function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Generates random coordinates within Sri Lanka bounds
 * @param {number} count - Number of coordinates to generate
 * @returns {Array<Object>} Array of random coordinates
 */
export function generateRandomSriLankanCoordinates(count = 10) {
  const coordinates = [];
  const bounds = VALIDATION.SRI_LANKA_BOUNDS;
  
  for (let i = 0; i < count; i++) {
    const lat = randomBetween(bounds.MIN_LAT, bounds.MAX_LAT);
    const lng = randomBetween(bounds.MIN_LNG, bounds.MAX_LNG);
    
    coordinates.push({
      id: i + 1,
      lat: Math.round(lat * 10000) / 10000, // 4 decimal precision
      lng: Math.round(lng * 10000) / 10000,
      region: getRegionForCoordinate(lat, lng),
      type: 'random'
    });
  }
  
  return coordinates;
}

/**
 * Generates random coordinates within specific regions
 * @param {string} regionName - Region name (WESTERN, CENTRAL, etc.)
 * @param {number} count - Number of coordinates
 * @returns {Array<Object>} Regional coordinates
 */
export function generateRegionalCoordinates(regionName, count = 5) {
  const region = SRI_LANKA_REGIONS[regionName];
  if (!region) {
    throw new Error(`Unknown region: ${regionName}`);
  }
  
  const coordinates = [];
  
  for (let i = 0; i < count; i++) {
    const lat = randomBetween(region.minLat, region.maxLat);
    const lng = randomBetween(region.minLng, region.maxLng);
    
    coordinates.push({
      id: `${regionName}_${i + 1}`,
      lat: Math.round(lat * 10000) / 10000,
      lng: Math.round(lng * 10000) / 10000,
      region: regionName,
      type: 'regional'
    });
  }
  
  return coordinates;
}

/**
 * Generates coordinates around major cities
 * @param {number} count - Number of coordinates per city
 * @returns {Array<Object>} City-based coordinates
 */
export function generateCityBasedCoordinates(count = 3) {
  const coordinates = [];
  
  MAJOR_CITIES.forEach((city, cityIndex) => {
    for (let i = 0; i < count; i++) {
      // Generate random offset within city radius
      const offsetLat = randomBetween(-city.radius, city.radius);
      const offsetLng = randomBetween(-city.radius, city.radius);
      
      const lat = city.lat + offsetLat;
      const lng = city.lng + offsetLng;
      
      coordinates.push({
        id: `${city.name.toLowerCase()}_${i + 1}`,
        lat: Math.round(lat * 10000) / 10000,
        lng: Math.round(lng * 10000) / 10000,
        city: city.name,
        region: getRegionForCoordinate(lat, lng),
        type: 'city-based'
      });
    }
  });
  
  return coordinates;
}

/**
 * Generates coordinates at tourist locations with slight variations
 * @returns {Array<Object>} Tourist location coordinates
 */
export function generateTouristLocationCoordinates() {
  const coordinates = [];
  
  TOURIST_LOCATIONS.forEach((location, index) => {
    // Add exact location
    coordinates.push({
      id: `tourist_${location.name.toLowerCase().replace(/\\s+/g, '_')}_exact`,
      lat: location.lat,
      lng: location.lng,
      location: location.name,
      region: getRegionForCoordinate(location.lat, location.lng),
      type: 'tourist-exact'
    });
    
    // Add nearby variations (within 2km)
    for (let i = 0; i < 2; i++) {
      const offsetLat = randomBetween(-0.02, 0.02); // ~2km variation
      const offsetLng = randomBetween(-0.02, 0.02);
      
      coordinates.push({
        id: `tourist_${location.name.toLowerCase().replace(/\\s+/g, '_')}_near_${i + 1}`,
        lat: Math.round((location.lat + offsetLat) * 10000) / 10000,
        lng: Math.round((location.lng + offsetLng) * 10000) / 10000,
        location: location.name,
        region: getRegionForCoordinate(location.lat, location.lng),
        type: 'tourist-nearby'
      });
    }
  });
  
  return coordinates;
}

/**
 * Generates extreme edge case coordinates for testing boundaries
 * @returns {Array<Object>} Edge case coordinates
 */
export function generateEdgeCaseCoordinates() {
  const bounds = VALIDATION.SRI_LANKA_BOUNDS;
  const coordinates = [];
  
  // Corner coordinates
  const corners = [
    { name: 'northwest', lat: bounds.MAX_LAT, lng: bounds.MIN_LNG },
    { name: 'northeast', lat: bounds.MAX_LAT, lng: bounds.MAX_LNG },
    { name: 'southwest', lat: bounds.MIN_LAT, lng: bounds.MIN_LNG },
    { name: 'southeast', lat: bounds.MIN_LAT, lng: bounds.MAX_LNG }
  ];
  
  corners.forEach(corner => {
    coordinates.push({
      id: `edge_${corner.name}`,
      lat: corner.lat,
      lng: corner.lng,
      region: getRegionForCoordinate(corner.lat, corner.lng),
      type: 'edge-case'
    });
  });
  
  // Near-boundary coordinates (just inside bounds)
  const margin = 0.01;
  const nearBoundary = [
    { name: 'near_north', lat: bounds.MAX_LAT - margin, lng: randomBetween(bounds.MIN_LNG, bounds.MAX_LNG) },
    { name: 'near_south', lat: bounds.MIN_LAT + margin, lng: randomBetween(bounds.MIN_LNG, bounds.MAX_LNG) },
    { name: 'near_east', lat: randomBetween(bounds.MIN_LAT, bounds.MAX_LAT), lng: bounds.MAX_LNG - margin },
    { name: 'near_west', lat: randomBetween(bounds.MIN_LAT, bounds.MAX_LAT), lng: bounds.MIN_LNG + margin }
  ];
  
  nearBoundary.forEach(near => {
    coordinates.push({
      id: `edge_${near.name}`,
      lat: Math.round(near.lat * 10000) / 10000,
      lng: Math.round(near.lng * 10000) / 10000,
      region: getRegionForCoordinate(near.lat, near.lng),
      type: 'near-boundary'
    });
  });
  
  return coordinates;
}

/**
 * Determines the region for a given coordinate
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string} Region name
 */
function getRegionForCoordinate(lat, lng) {
  for (const [regionName, bounds] of Object.entries(SRI_LANKA_REGIONS)) {
    if (lat >= bounds.minLat && lat <= bounds.maxLat && 
        lng >= bounds.minLng && lng <= bounds.maxLng) {
      return regionName;
    }
  }
  return 'UNKNOWN';
}

/**
 * Generates a comprehensive test dataset with all coordinate types
 * @param {Object} options - Generation options
 * @returns {Object} Complete test dataset
 */
export function generateCompleteTestDataset(options = {}) {
  const {
    randomCount = 20,
    regionalCount = 3,
    cityCount = 2,
    includeTourist = true,
    includeEdgeCases = true
  } = options;
  
  const dataset = {
    random: generateRandomSriLankanCoordinates(randomCount),
    regional: {},
    cityBased: generateCityBasedCoordinates(cityCount),
    tourist: includeTourist ? generateTouristLocationCoordinates() : [],
    edgeCases: includeEdgeCases ? generateEdgeCaseCoordinates() : [],
    metadata: {
      generatedAt: new Date().toISOString(),
      totalCoordinates: 0,
      regions: Object.keys(SRI_LANKA_REGIONS),
      cities: MAJOR_CITIES.map(city => city.name),
      touristLocations: TOURIST_LOCATIONS.map(loc => loc.name)
    }
  };
  
  // Generate regional coordinates
  Object.keys(SRI_LANKA_REGIONS).forEach(region => {
    dataset.regional[region] = generateRegionalCoordinates(region, regionalCount);
  });
  
  // Calculate total coordinates
  dataset.metadata.totalCoordinates = 
    dataset.random.length +
    Object.values(dataset.regional).flat().length +
    dataset.cityBased.length +
    dataset.tourist.length +
    dataset.edgeCases.length;
  
  return dataset;
}

/**
 * Exports all available regions for testing
 */
export const AVAILABLE_REGIONS = Object.keys(SRI_LANKA_REGIONS);
export const AVAILABLE_CITIES = MAJOR_CITIES;
export const AVAILABLE_TOURIST_LOCATIONS = TOURIST_LOCATIONS;