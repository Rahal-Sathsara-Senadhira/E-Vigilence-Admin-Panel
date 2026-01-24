/**
 * Police Stations System for Sri Lanka
 * Main entry point - exports all public APIs
 * @version 1.0.0
 * @author Sri Lanka Police Stations System
 */

// ====== MAIN SERVICE FUNCTIONS ======
export {
  findNearestPoliceStations,
  getPoliceStationsWithinRadius,
  getPoliceStationsByArea,
  getPoliceStationByName,
  getAllAreas,
  getDatasetStatistics
} from './services/policeStationsService.js';

// ====== DATA EXPORTS ======
export { 
  POLICE_STATIONS,
  DATASET_STATS 
} from './data/policeStationsData.js';

// ====== UTILITY FUNCTIONS ======
export {
  calculateDistance,
  calculateDistancesForStations,
  getBoundingBoxCandidates,
  approximateDistance,
  toRadians,
  toDegrees,
  // Legacy functions (deprecated)
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

// ====== CONFIGURATION ======
export {
  CONFIG,
  VALIDATION,
  ERROR_MESSAGES
} from './config/constants.js';

// ====== DEFAULT EXPORT ======
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