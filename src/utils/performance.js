/**
 * Performance Monitoring Utilities
 * Provides performance tracking and optimization insights
 * @version 1.0.0
 */

import { findNearestPoliceStations, getPoliceStationsWithinRadius } from '../services/policeStationsService.js';
import { POLICE_STATIONS } from '../data/policeStationsData.js';

/**
 * Performance monitoring wrapper for the main search function
 * Use in development to monitor performance characteristics
 * @param {Object} coords - Search coordinates and parameters
 * @param {number} legacyLng - Legacy longitude parameter
 * @param {number} legacyLimit - Legacy limit parameter
 * @returns {Object} Results with performance metrics
 */
export function findNearestPoliceStationsWithMetrics(coords, legacyLng, legacyLimit) {
  const startTime = performance.now();
  
  try {
    const results = findNearestPoliceStations(coords, legacyLng, legacyLimit);
    const endTime = performance.now();
    
    const metrics = {
      executionTime: (endTime - startTime).toFixed(2),
      resultsCount: results.length,
      searchOptimized: results.length > 0 ? results.length < POLICE_STATIONS.length : false,
      timestamp: new Date().toISOString()
    };
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Search Performance Metrics:', metrics);
    }
    
    return { results, metrics };
    
  } catch (error) {
    const endTime = performance.now();
    const metrics = {
      executionTime: (endTime - startTime).toFixed(2),
      error: error.message,
      timestamp: new Date().toISOString()
    };
    
    console.error('❌ Search Performance Metrics (failed):', metrics);
    throw error;
  }
}

/**
 * Performance monitoring wrapper for radius search
 * @param {Object} params - Search parameters
 * @returns {Object} Results with performance metrics
 */
export function getPoliceStationsWithinRadiusWithMetrics(params) {
  const startTime = performance.now();
  
  try {
    const results = getPoliceStationsWithinRadius(params);
    const endTime = performance.now();
    
    const metrics = {
      executionTime: (endTime - startTime).toFixed(2),
      resultsCount: results.length,
      searchRadius: params.radiusKm,
      efficiency: ((results.length / POLICE_STATIONS.length) * 100).toFixed(1) + '%',
      timestamp: new Date().toISOString()
    };
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🎯 Radius Search Performance Metrics:', metrics);
    }
    
    return { results, metrics };
    
  } catch (error) {
    const endTime = performance.now();
    const metrics = {
      executionTime: (endTime - startTime).toFixed(2),
      error: error.message,
      timestamp: new Date().toISOString()
    };
    
    console.error('❌ Radius Search Performance Metrics (failed):', metrics);
    throw error;
  }
}

/**
 * Benchmarks the search functions with various parameters
 * @param {number} iterations - Number of test iterations
 * @returns {Object} Benchmark results
 */
export function runBenchmark(iterations = 100) {
  console.log(`🚀 Running performance benchmark (${iterations} iterations)...`);
  
  // Test coordinates (Colombo area)
  const testCoords = [
    { lat: 6.9271, lng: 79.8612, area: 'Colombo Fort' },
    { lat: 7.2906, lng: 80.6337, area: 'Kandy' },
    { lat: 6.0329, lng: 80.2168, area: 'Galle' },
    { lat: 8.3114, lng: 80.4037, area: 'Anuradhapura' },
    { lat: 9.6615, lng: 80.0255, area: 'Jaffna' }
  ];
  
  const results = {
    nearestSearch: { totalTime: 0, avgTime: 0, iterations: iterations },
    radiusSearch: { totalTime: 0, avgTime: 0, iterations: iterations },
    testCoordinates: testCoords.length
  };
  
  // Benchmark nearest search
  for (let i = 0; i < iterations; i++) {
    const coord = testCoords[i % testCoords.length];
    const startTime = performance.now();
    
    try {
      findNearestPoliceStations({ lat: coord.lat, lng: coord.lng, limit: 5 });
      const endTime = performance.now();
      results.nearestSearch.totalTime += (endTime - startTime);
    } catch (error) {
      console.warn(`Benchmark iteration ${i} failed:`, error.message);
    }
  }
  
  // Benchmark radius search
  for (let i = 0; i < iterations; i++) {
    const coord = testCoords[i % testCoords.length];
    const startTime = performance.now();
    
    try {
      getPoliceStationsWithinRadius({ lat: coord.lat, lng: coord.lng, radiusKm: 20 });
      const endTime = performance.now();
      results.radiusSearch.totalTime += (endTime - startTime);
    } catch (error) {
      console.warn(`Benchmark iteration ${i} failed:`, error.message);
    }
  }
  
  // Calculate averages
  results.nearestSearch.avgTime = (results.nearestSearch.totalTime / iterations).toFixed(3);
  results.radiusSearch.avgTime = (results.radiusSearch.totalTime / iterations).toFixed(3);
  
  console.log('📊 Benchmark Results:');
  console.table(results);
  
  return results;
}

/**
 * Memory usage analyzer for the police stations dataset
 * @returns {Object} Memory usage statistics
 */
export function analyzeMemoryUsage() {
  if (typeof performance.measureUserAgentSpecificMemory === 'function') {
    // Modern browsers with memory API
    return performance.measureUserAgentSpecificMemory().then(result => {
      console.log('💾 Memory Analysis:', result);
      return result;
    }).catch(() => {
      return getBasicMemoryInfo();
    });
  } else {
    return getBasicMemoryInfo();
  }
}

/**
 * Basic memory information fallback
 * @private
 * @returns {Object} Basic memory statistics
 */
function getBasicMemoryInfo() {
  const dataSize = JSON.stringify(POLICE_STATIONS).length;
  const estimatedMemoryKB = (dataSize / 1024).toFixed(2);
  
  const info = {
    datasetSize: `${estimatedMemoryKB} KB`,
    stationCount: POLICE_STATIONS.length,
    avgStationSize: `${(dataSize / POLICE_STATIONS.length).toFixed(0)} bytes`,
    timestamp: new Date().toISOString()
  };
  
  console.log('💾 Basic Memory Info:', info);
  return info;
}

/**
 * Validates the entire police stations dataset for performance issues
 * @returns {Object} Performance validation report
 */
export function validateDatasetPerformance() {
  console.log('🔍 Validating dataset performance...');
  
  const startTime = performance.now();
  const report = {
    totalStations: POLICE_STATIONS.length,
    duplicateCoordinates: 0,
    duplicateNames: 0,
    coordinateRange: { lat: { min: 90, max: -90 }, lng: { min: 180, max: -180 } },
    issues: [],
    performanceScore: 0
  };
  
  const seenCoordinates = new Set();
  const seenNames = new Set();
  
  POLICE_STATIONS.forEach((station, index) => {
    const coordKey = `${station.lat},${station.lng}`;
    const nameKey = station.name.toLowerCase();
    
    // Check for duplicate coordinates
    if (seenCoordinates.has(coordKey)) {
      report.duplicateCoordinates++;
      report.issues.push(`Duplicate coordinates at index ${index}: ${station.name}`);
    } else {
      seenCoordinates.add(coordKey);
    }
    
    // Check for duplicate names
    if (seenNames.has(nameKey)) {
      report.duplicateNames++;
      report.issues.push(`Duplicate name at index ${index}: ${station.name}`);
    } else {
      seenNames.add(nameKey);
    }
    
    // Update coordinate ranges
    report.coordinateRange.lat.min = Math.min(report.coordinateRange.lat.min, station.lat);
    report.coordinateRange.lat.max = Math.max(report.coordinateRange.lat.max, station.lat);
    report.coordinateRange.lng.min = Math.min(report.coordinateRange.lng.min, station.lng);
    report.coordinateRange.lng.max = Math.max(report.coordinateRange.lng.max, station.lng);
  });
  
  const endTime = performance.now();
  report.validationTime = `${(endTime - startTime).toFixed(2)}ms`;
  
  // Calculate performance score (0-100)
  let score = 100;
  score -= report.duplicateCoordinates * 5; // -5 per duplicate coordinate
  score -= report.duplicateNames * 3; // -3 per duplicate name
  score -= report.issues.length * 2; // -2 per issue
  
  report.performanceScore = Math.max(0, score);
  
  console.log('📋 Dataset Performance Report:', report);
  return report;
}