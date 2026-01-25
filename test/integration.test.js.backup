/**
 * Integration Tests for Complete System
 * 
 * Tests the interaction between all components working together
 */

import { strict as assert } from 'assert';
import { test, describe } from 'node:test';
import { TestHelpers, TestConstants } from './helpers/testUtils.js';

// Import the main module
import {
  findNearestPoliceStations,
  getPoliceStationsWithinRadius,
  calculateDistance,
  validateCoordinates,
  POLICE_STATIONS,
  CONFIG
} from '../src/index.js';

describe('Integration Tests', () => {

  describe('Complete System Workflow', () => {
    test('should handle complete search workflow', () => {
      const userLocation = { lat: 6.9271, lng: 79.8612, limit: 5 };
      
      // Step 1: Validate input
      const validation = validateCoordinates(userLocation.lat, userLocation.lng);
      assert.ok(validation.isValid, 'Coordinates should be valid');
      
      // Step 2: Find nearest stations
      const nearestStations = findNearestPoliceStations(userLocation);
      assert.ok(nearestStations.length > 0, 'Should find stations');
      assert.ok(nearestStations.length <= userLocation.limit, 'Should respect limit');
      
      // Step 3: Verify distances are calculated correctly
      const firstStation = nearestStations[0];
      const manualDistance = calculateDistance(
        userLocation.lat, userLocation.lng,
        firstStation.coordinates.lat, firstStation.coordinates.lng
      );
      
      const tolerance = 0.001; // 1 meter tolerance
      assert.ok(Math.abs(firstStation.distanceKm - manualDistance) < tolerance,
        'Distance calculation should be consistent');
      
      // Step 4: Cross-validate with radius search
      const radiusSearch = getPoliceStationsWithinRadius({
        lat: userLocation.lat,
        lng: userLocation.lng,
        radiusKm: firstStation.distanceKm * 1.5 // 50% more than nearest
      });
      
      assert.ok(radiusSearch.length >= 1, 'Radius search should include at least the nearest station');
    });

    test('should maintain data consistency across different search methods', () => {
      const testLocation = { lat: 7.2906, lng: 80.6337 }; // Kandy
      
      // Get same station through different methods
      const nearestStations = findNearestPoliceStations({ ...testLocation, limit: 10 });
      const radiusStations = getPoliceStationsWithinRadius({ 
        ...testLocation, 
        radiusKm: 50 
      });
      
      // Find common stations
      const commonStations = nearestStations.filter(nearest => 
        radiusStations.some(radius => 
          radius.name === nearest.name && 
          Math.abs(radius.distanceKm - nearest.distanceKm) < 0.01
        )
      );
      
      assert.ok(commonStations.length > 0, 'Should find common stations with consistent data');
    });
  });

  describe('Real-world Scenarios', () => {
    test('should handle tourist locations accurately', () => {
      const touristSpots = [
        { name: 'Sigiriya', lat: 7.9541, lng: 80.7547 },
        { name: 'Temple of Tooth Kandy', lat: 7.2906, lng: 80.6337 },
        { name: 'Galle Fort', lat: 6.0329, lng: 80.2168 }
      ];

      touristSpots.forEach(spot => {
        const nearestStations = findNearestPoliceStations({
          lat: spot.lat,
          lng: spot.lng,
          limit: 3
        });
        
        assert.ok(nearestStations.length > 0, 
          `Should find police stations near ${spot.name}`);
        assert.ok(nearestStations[0].distanceKm < 100, 
          `Nearest station to ${spot.name} should be within 100km`);
      });
    });

    test('should handle emergency response scenarios', () => {
      const emergencyLocation = { lat: 6.9271, lng: 79.8612 }; // Colombo city center
      
      // Emergency services typically need stations within 10km
      const emergencyStations = getPoliceStationsWithinRadius({
        ...emergencyLocation,
        radiusKm: 10
      });
      
      assert.ok(emergencyStations.length > 0, 
        'Should find stations for emergency response in city center');
      
      // Test response time (should be very fast for emergency scenarios)
      const startTime = Date.now();
      for (let i = 0; i < 10; i++) {
        findNearestPoliceStations({ ...emergencyLocation, limit: 3 });
      }
      const responseTime = Date.now() - startTime;
      
      assert.ok(responseTime < 500, 
        `Emergency queries should be fast, took ${responseTime}ms for 10 searches`);
    });

    test('should handle rural area searches', () => {
      const ruralLocation = { lat: 8.0, lng: 80.5 }; // Rural central area
      
      const nearestStations = findNearestPoliceStations({
        lat: ruralLocation.lat,
        lng: ruralLocation.lng,
        limit: 5
      });
      
      assert.ok(nearestStations.length > 0, 'Should find stations in rural areas');
      
      // Rural stations might be farther away
      const nearestDistance = nearestStations[0].distanceKm;
      assert.ok(nearestDistance >= 0, 'Should have valid distance');
      
      // But should still be within reasonable range for Sri Lanka
      assert.ok(nearestDistance < 200, 'Even rural stations should be within 200km');
    });
  });

  describe('Performance and Scale Tests', () => {
    test('should handle multiple concurrent searches', async () => {
      const locations = Array.from({ length: 20 }, () => 
        TestHelpers.generateSriLankanCoordinate()
      );
      
      const startTime = Date.now();
      
      const searchPromises = locations.map(location =>
        Promise.resolve(findNearestPoliceStations({
          lat: location.lat,
          lng: location.lng,
          limit: 3
        }))
      );
      
      const results = await Promise.all(searchPromises);
      const totalTime = Date.now() - startTime;
      
      assert.equal(results.length, locations.length, 'Should complete all searches');
      assert.ok(totalTime < 3000, `20 concurrent searches should complete within 3s, took ${totalTime}ms`);
      
      results.forEach((result, index) => {
        assert.ok(Array.isArray(result), `Result ${index} should be an array`);
        assert.ok(result.length > 0, `Result ${index} should contain stations`);
      });
    });

    test('should scale with different dataset sizes', () => {
      // Test with full dataset
      const fullDatasetTime = TestHelpers.measureExecutionTime(() => {
        findNearestPoliceStations({ lat: 6.9271, lng: 79.8612, limit: 10 });
      }, 50);
      
      // Performance should be reasonable even with full dataset
      assert.ok(fullDatasetTime < 2000, 
        `50 searches with full dataset should complete within 2s, took ${fullDatasetTime}ms`);
    });
  });

  describe('Data Integrity Tests', () => {
    test('should have consistent station data', () => {
      // Verify all stations have required fields
      POLICE_STATIONS.forEach((station, index) => {
        TestHelpers.assertHasProperties(station, 
          ['name', 'lat', 'lng', 'area'], 
          `Station at index ${index}`);
        
        // Verify coordinate ranges
        TestHelpers.assertInRange(station.lat, 
          TestConstants.SRI_LANKA_BOUNDS.MIN_LAT, 
          TestConstants.SRI_LANKA_BOUNDS.MAX_LAT,
          `Station ${station.name} latitude`);
          
        TestHelpers.assertInRange(station.lng,
          TestConstants.SRI_LANKA_BOUNDS.MIN_LNG,
          TestConstants.SRI_LANKA_BOUNDS.MAX_LNG,
          `Station ${station.name} longitude`);
      });
    });

    test('should have no duplicate stations', () => {
      const stationNames = POLICE_STATIONS.map(s => s.name.toLowerCase());
      const uniqueNames = [...new Set(stationNames)];
      
      assert.equal(stationNames.length, uniqueNames.length, 
        'Should not have duplicate station names');
    });

    test('should have realistic coordinate distances', () => {
      // Test some known distances within Sri Lanka
      Object.entries(TestConstants.KNOWN_DISTANCES).forEach(([name, data]) => {
        const calculated = calculateDistance(
          data.from[0], data.from[1],
          data.to[0], data.to[1]
        );
        
        const tolerance = data.expectedKm * 0.1; // 10% tolerance
        TestHelpers.assertInRange(calculated, 
          data.expectedKm - tolerance,
          data.expectedKm + tolerance,
          `Distance calculation for ${name}`);
      });
    });
  });

  describe('Configuration and Constants Validation', () => {
    test('should have valid configuration values', () => {
      assert.ok(CONFIG.EARTH_RADIUS_KM > 6000 && CONFIG.EARTH_RADIUS_KM < 7000,
        'Earth radius should be realistic');
      
      assert.ok(CONFIG.DEFAULT_SEARCH_LIMIT > 0 && CONFIG.DEFAULT_SEARCH_LIMIT < 10,
        'Default search limit should be reasonable');
        
      assert.ok(CONFIG.MAX_SEARCH_LIMIT > CONFIG.DEFAULT_SEARCH_LIMIT,
        'Max limit should be greater than default');
    });

    test('should handle edge cases with configuration limits', () => {
      // Test with maximum allowed limit
      const maxResult = findNearestPoliceStations({
        lat: 6.9271,
        lng: 79.8612,
        limit: CONFIG.MAX_SEARCH_LIMIT
      });
      
      assert.ok(maxResult.length <= CONFIG.MAX_SEARCH_LIMIT,
        'Should respect maximum search limit');
    });
  });

});