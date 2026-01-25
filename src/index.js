/**
 * Sri Lanka Police Stations Locator System
 * 
 * Main entry point that exports all public APIs for finding and managing
 * police station data across Sri Lanka.
 */

// Core service functions for police station search operations
export {
  findNearestPoliceStations,
  getPoliceStationsWithinRadius,
  getPoliceStationsByArea,
  getPoliceStationByName,
  getAllAreas,
  getDatasetStatistics
} from './services/policeStationsService.js';

// Police station data and statistics
export { 
  POLICE_STATIONS,
  DATASET_STATS 
} from './data/policeStationsData.js';

// Distance calculation and geographic utility functions
export {
  calculateDistance,
  calculateDistancesForStations,
  getBoundingBoxCandidates,
  approximateDistance,
  toRadians,
  toDegrees,
  // Legacy functions - maintained for backward compatibility
  calcDistance,
  toRad
} from './utils/distance.js';

export {
  validateCoordinates,
  validateLimit,
  validateRadius,
  validateArea,
  validateStationObject,
  sanitizeSearchParams
} from './utils/validation.js';

// System configuration and validation constants
export {
  CONFIG,
  VALIDATION,
  ERROR_MESSAGES
} from './config/constants.js';

// Default export object containing all main functionality
export default {
  // Primary functions
  findNearestPoliceStations,
  getPoliceStationsWithinRadius,
  getPoliceStationsByArea,
  getPoliceStationByName,
  getAllAreas,
  getDatasetStatistics,
  
  // Data
  POLICE_STATIONS,
  DATASET_STATS,
  
  // Utilities
  calculateDistance,
  validateCoordinates,
  
  // Configuration
  CONFIG
};