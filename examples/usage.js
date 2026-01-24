/**
 * Usage Examples for Police Stations System
 * Demonstrates best practices and common use cases
 * @version 1.0.0
 */

import {
  findNearestPoliceStations,
  getPoliceStationsWithinRadius,
  getPoliceStationsByArea,
  getPoliceStationByName,
  getAllAreas,
  getDatasetStatistics,
  validateCoordinates
} from '../src/index.js';

import {
  findNearestPoliceStationsWithMetrics,
  runBenchmark,
  validateDatasetPerformance
} from '../src/utils/performance.js';

/**
 * Example 1: Find nearest police stations to a specific location
 */
export function exampleNearestStations() {
  console.log('🏛️ Example 1: Finding nearest stations to Colombo Fort');
  
  try {
    const nearestToFort = findNearestPoliceStations({
      lat: 6.9333,
      lng: 79.8430,
      limit: 5
    });
    
    console.log(`Found ${nearestToFort.length} nearest stations:`);
    nearestToFort.forEach((station, index) => {
      console.log(`  ${index + 1}. ${station.name} - ${station.distanceKm}km away (${station.area})`);
    });
    
    return nearestToFort;
    
  } catch (error) {
    console.error('❌ Error finding nearest stations:', error.message);
    return [];
  }
}

/**
 * Example 2: Find all stations within a specific radius
 */
export function exampleRadiusSearch() {
  console.log('🎯 Example 2: Finding stations within 10km of Kandy');
  
  try {
    const stationsNearKandy = getPoliceStationsWithinRadius({
      lat: 7.2906,
      lng: 80.6337,
      radiusKm: 10
    });
    
    console.log(`Found ${stationsNearKandy.length} stations within 10km of Kandy:`);
    stationsNearKandy.forEach(station => {
      console.log(`  • ${station.name} - ${station.distanceKm}km (${station.area})`);
    });
    
    return stationsNearKandy;
    
  } catch (error) {
    console.error('❌ Error in radius search:', error.message);
    return [];
  }
}

/**
 * Example 3: Search stations by area/district
 */
export function exampleAreaSearch() {
  console.log('🏘️ Example 3: Finding stations in Colombo area');
  
  try {
    const colomboStations = getPoliceStationsByArea('Colombo');
    console.log(`Found ${colomboStations.length} stations in Colombo area:`);
    
    // Group by specific areas
    const groupedStations = colomboStations.reduce((groups, station) => {
      const area = station.area;
      if (!groups[area]) groups[area] = [];
      groups[area].push(station);
      return groups;
    }, {});
    
    Object.entries(groupedStations).forEach(([area, stations]) => {
      console.log(`  📍 ${area}: ${stations.length} stations`);
      stations.forEach(station => {
        console.log(`    - ${station.name}`);
      });
    });
    
    return colomboStations;
    
  } catch (error) {
    console.error('❌ Error in area search:', error.message);
    return [];
  }
}

/**
 * Example 4: Search for a specific police station
 */
export function exampleStationSearch() {
  console.log('🔍 Example 4: Finding specific police station');
  
  try {
    const stationName = 'Kandy Police Station';
    const station = getPoliceStationByName(stationName);
    
    if (station) {
      console.log(`✅ Found: ${station.name}`);
      console.log(`   Location: ${station.lat}, ${station.lng}`);
      console.log(`   Area: ${station.area}`);
    } else {
      console.log(`❌ Station "${stationName}" not found`);
    }
    
    return station;
    
  } catch (error) {
    console.error('❌ Error searching for station:', error.message);
    return null;
  }
}

/**
 * Example 5: Get dataset overview and statistics
 */
export function exampleDatasetOverview() {
  console.log('📊 Example 5: Dataset overview and statistics');
  
  try {
    const stats = getDatasetStatistics();
    const areas = getAllAreas();
    
    console.log('Dataset Statistics:');
    console.log(`  Total Stations: ${stats.totalStations}`);
    console.log(`  Total Areas: ${stats.totalAreas}`);
    console.log(`  Coordinate Coverage:`);
    console.log(`    Latitude: ${stats.coordinateRanges.latitude.min}° to ${stats.coordinateRanges.latitude.max}°`);
    console.log(`    Longitude: ${stats.coordinateRanges.longitude.min}° to ${stats.coordinateRanges.longitude.max}°`);
    
    console.log('\\n📍 All Areas/Districts:');
    areas.forEach((area, index) => {
      const stationCount = getPoliceStationsByArea(area).length;
      console.log(`  ${(index + 1).toString().padStart(2, '0')}. ${area.padEnd(20)} (${stationCount} stations)`);
    });
    
    return { stats, areas };
    
  } catch (error) {
    console.error('❌ Error getting dataset overview:', error.message);
    return null;
  }
}

/**
 * Example 6: Performance monitoring and optimization
 */
export function examplePerformanceMonitoring() {
  console.log('⚡ Example 6: Performance monitoring');
  
  try {
    // Search with performance metrics
    const { results, metrics } = findNearestPoliceStationsWithMetrics({
      lat: 6.9271,
      lng: 79.8612,
      limit: 3
    });
    
    console.log('Performance Results:');
    console.log(`  Execution Time: ${metrics.executionTime}ms`);
    console.log(`  Results Count: ${metrics.resultsCount}`);
    console.log(`  Search Optimized: ${metrics.searchOptimized}`);
    
    return { results, metrics };
    
  } catch (error) {
    console.error('❌ Error in performance monitoring:', error.message);
    return null;
  }
}

/**
 * Example 7: Input validation and error handling
 */
export function exampleValidationAndErrorHandling() {
  console.log('🛡️ Example 7: Input validation and error handling');
  
  const testCases = [
    { lat: 6.9271, lng: 79.8612, desc: 'Valid Colombo coordinates' },
    { lat: 91, lng: 79.8612, desc: 'Invalid latitude (out of range)' },
    { lat: 6.9271, lng: 181, desc: 'Invalid longitude (out of range)' },
    { lat: 'invalid', lng: 79.8612, desc: 'Non-numeric latitude' },
    { lat: 6.9271, lng: 79.8612, desc: 'Coordinates outside Sri Lanka', strict: true }
  ];
  
  testCases.forEach(testCase => {
    try {
      const validation = validateCoordinates(testCase.lat, testCase.lng, testCase.strict);
      
      console.log(`\\n${validation.isValid ? '✅' : '❌'} ${testCase.desc}`);
      if (!validation.isValid) {
        console.log(`   Errors: ${validation.errors.join(', ')}`);
      }
      
      // Try to perform search
      if (validation.isValid) {
        const results = findNearestPoliceStations({
          lat: testCase.lat,
          lng: testCase.lng,
          limit: 1
        });
        console.log(`   Search successful: ${results.length} result(s)`);
      }
      
    } catch (error) {
      console.log(`❌ ${testCase.desc}: ${error.message}`);
    }
  });
}

/**
 * Example 8: Legacy compatibility
 */
export function exampleLegacyCompatibility() {
  console.log('🔄 Example 8: Legacy function compatibility');
  
  try {
    console.log('Using legacy syntax (deprecated):');
    
    // Legacy syntax - still works but shows warnings
    const legacyResults = findNearestPoliceStations(6.9271, 79.8612, 3);
    
    console.log('Modern syntax (recommended):');
    const modernResults = findNearestPoliceStations({
      lat: 6.9271,
      lng: 79.8612,
      limit: 3
    });
    
    console.log(`Legacy results: ${legacyResults.length}`);
    console.log(`Modern results: ${modernResults.length}`);
    console.log('Both should return the same results');
    
    return { legacyResults, modernResults };
    
  } catch (error) {
    console.error('❌ Error in legacy compatibility test:', error.message);
    return null;
  }
}

/**
 * Run all examples
 */
export function runAllExamples() {
  console.log('🚀 Running all Police Stations System examples...\\n');
  
  const results = {};
  
  results.nearest = exampleNearestStations();
  console.log('\\n' + '='.repeat(60) + '\\n');
  
  results.radius = exampleRadiusSearch();
  console.log('\\n' + '='.repeat(60) + '\\n');
  
  results.area = exampleAreaSearch();
  console.log('\\n' + '='.repeat(60) + '\\n');
  
  results.station = exampleStationSearch();
  console.log('\\n' + '='.repeat(60) + '\\n');
  
  results.overview = exampleDatasetOverview();
  console.log('\\n' + '='.repeat(60) + '\\n');
  
  results.performance = examplePerformanceMonitoring();
  console.log('\\n' + '='.repeat(60) + '\\n');
  
  exampleValidationAndErrorHandling();
  console.log('\\n' + '='.repeat(60) + '\\n');
  
  results.legacy = exampleLegacyCompatibility();
  
  console.log('\\n✅ All examples completed successfully!');
  return results;
}

// Uncomment to run examples when importing this file
// runAllExamples();