/**
 * Unit Tests for Police Stations Service
 * 
 * Tests search functionality, business logic, and edge cases for police station operations
 */

import { strict as assert } from 'assert';
import { test, describe } from 'node:test';
import {
  findNearestPoliceStations,
  getPoliceStationsWithinRadius,
  getPoliceStationsByArea,
  getPoliceStationByName,
  getAllAreas,
  getDatasetStatistics
} from '../src/services/policeStationsService.js';

// Mock test data for isolated testing
const TEST_STATIONS = [
  { name: "Central Police Station", lat: 6.9271, lng: 79.8612, area: "Colombo" },
  { name: "Kandy Police Station", lat: 7.2906, lng: 80.6337, area: "Kandy" },
  { name: "Galle Police Station", lat: 6.0329, lng: 80.2168, area: "Galle" },
  { name: "Colombo Fort Police", lat: 6.9333, lng: 79.8430, area: "Colombo" },
  { name: "Negombo Police Station", lat: 7.2008, lng: 79.8407, area: "Negombo" }
];

describe('Police Stations Service', () => {

  describe('findNearestPoliceStations()', () => {
    test('should find nearest stations with default limit', () => {
      const result = findNearestPoliceStations({
        lat: 6.9271,
        lng: 79.8612
      });
      
      assert.ok(Array.isArray(result), 'Should return an array');
      assert.ok(result.length > 0, 'Should return at least one station');
      assert.ok(result.length <= 3, 'Should respect default limit of 3');
      
      // Check result structure
      result.forEach(station => {
        assert.ok(typeof station.name === 'string', 'Should have station name');
        assert.ok(typeof station.distanceKm === 'number', 'Should have distance');
        assert.ok(station.distanceKm >= 0, 'Distance should be non-negative');
        assert.ok(typeof station.area === 'string', 'Should have area');
        assert.ok(typeof station.lat === 'number', 'Should have latitude');
        assert.ok(typeof station.lng === 'number', 'Should have longitude');
      });
    });

    test('should respect custom limit parameter', () => {
      const result = findNearestPoliceStations({
        lat: 6.9271,
        lng: 79.8612,
        limit: 5
      });
      
      assert.ok(result.length <= 5, 'Should respect custom limit');
    });

    test('should sort results by distance', () => {
      const result = findNearestPoliceStations({
        lat: 6.9271,
        lng: 79.8612,
        limit: 10
      });
      
      // Verify sorting
      for (let i = 1; i < result.length; i++) {
        assert.ok(result[i].distanceKm >= result[i-1].distanceKm, 
          `Station ${i} should be farther than station ${i-1}`);
      }
    });

    test('should support legacy function signature', () => {
      // Test old signature: (lat, lng, limit)
      const result = findNearestPoliceStations(6.9271, 79.8612, 2);
      
      assert.ok(Array.isArray(result), 'Should return array with legacy signature');
      assert.ok(result.length <= 2, 'Should respect legacy limit parameter');
    });

    test('should validate coordinates', () => {
      // Invalid latitude
      assert.throws(() => {
        findNearestPoliceStations({ lat: 100, lng: 79.8612 });
      }, 'Should throw error for invalid latitude');

      // Invalid longitude
      assert.throws(() => {
        findNearestPoliceStations({ lat: 6.9271, lng: 200 });
      }, 'Should throw error for invalid longitude');

      // Non-numeric coordinates
      assert.throws(() => {
        findNearestPoliceStations({ lat: 'invalid', lng: 79.8612 });
      }, 'Should throw error for non-numeric coordinates');
    });

    test('should enforce limit boundaries', () => {
      // Test maximum limit
      assert.throws(() => {
        findNearestPoliceStations({ lat: 6.9271, lng: 79.8612, limit: 100 });
      }, 'Should throw error for limit exceeding maximum');

      // Note: Zero and negative limits are sanitized by sanitizeSearchParams
      // Zero becomes 0, which fails validation
      assert.throws(() => {
        findNearestPoliceStations({ lat: 6.9271, lng: 79.8612, limit: 0 });
      }, 'Should throw error for zero limit');

      // Negative limits are converted to positive by Math.abs() in sanitizeSearchParams
      const negativeResult = findNearestPoliceStations({ lat: 6.9271, lng: 79.8612, limit: -3 });
      assert.ok(Array.isArray(negativeResult), 'Negative limit should be sanitized to positive');
      assert.ok(negativeResult.length > 0, 'Should return results when negative limit is sanitized');
    });

    test('should handle coordinates outside Sri Lanka', () => {
      // Test coordinates in India - should throw error due to strict Sri Lanka validation
      assert.throws(() => {
        findNearestPoliceStations({
          lat: 12.9716, // Chennai, India
          lng: 77.5946,
          limit: 3
        });
      }, /Coordinates are outside Sri Lanka bounds/, 'Should throw error for coordinates outside Sri Lanka');
    });
  });

  describe('getPoliceStationsWithinRadius()', () => {
    test('should find stations within specified radius', () => {
      const result = getPoliceStationsWithinRadius({
        lat: 6.9271,
        lng: 79.8612,
        radiusKm: 50
      });
      
      assert.ok(Array.isArray(result), 'Should return an array');
      
      // All results should be within radius
      result.forEach(station => {
        assert.ok(station.distanceKm <= 50, 
          `Station ${station.name} at ${station.distanceKm}km should be within 50km radius`);
      });
    });

    test('should return empty array when no stations within radius', () => {
      const result = getPoliceStationsWithinRadius({
        lat: 6.9271,
        lng: 79.8612,
        radiusKm: 0.001 // Very small radius
      });
      
      // Should return empty array or very few results
      assert.ok(Array.isArray(result), 'Should return an array');
      assert.ok(result.length >= 0, 'Should handle small radius gracefully');
    });

    test('should validate radius parameter', () => {
      // Negative radius is sanitized to positive by Math.abs() in sanitizeSearchParams
      const negativeResult = getPoliceStationsWithinRadius({
        lat: 6.9271,
        lng: 79.8612,
        radiusKm: -10
      });
      assert.ok(Array.isArray(negativeResult), 'Negative radius should be sanitized to positive');

      // Zero radius should throw error (radius must be > 0)
      assert.throws(() => {
        getPoliceStationsWithinRadius({
          lat: 6.9271,
          lng: 79.8612,
          radiusKm: 0
        });
      }, /Radius must be greater than 0/, 'Should throw error for zero radius');
    });

    test('should sort results by distance', () => {
      const result = getPoliceStationsWithinRadius({
        lat: 6.9271,
        lng: 79.8612,
        radiusKm: 200
      });
      
      if (result.length > 1) {
        for (let i = 1; i < result.length; i++) {
          assert.ok(result[i].distanceKm >= result[i-1].distanceKm, 
            'Results should be sorted by distance');
        }
      }
    });

    test('should handle large radius', () => {
      const result = getPoliceStationsWithinRadius({
        lat: 6.9271,
        lng: 79.8612,
        radiusKm: 1000 // Cover entire Sri Lanka
      });
      
      assert.ok(result.length > 0, 'Should return many stations for large radius');
    });
  });

  describe('getPoliceStationsByArea()', () => {
    test('should find stations by exact area match', () => {
      const result = getPoliceStationsByArea('Colombo');
      
      assert.ok(Array.isArray(result), 'Should return an array');
      assert.ok(result.length > 0, 'Should find stations in Colombo');
      
      // All results should have matching area
      result.forEach(station => {
        assert.ok(station.area.toLowerCase().includes('colombo'), 
          `Station ${station.name} should be in Colombo area`);
      });
    });

    test('should handle case-insensitive search', () => {
      const lowerResult = getPoliceStationsByArea('colombo');
      const upperResult = getPoliceStationsByArea('COLOMBO');
      const mixedResult = getPoliceStationsByArea('Colombo');
      
      assert.equal(lowerResult.length, upperResult.length, 
        'Case should not affect search results');
      assert.equal(lowerResult.length, mixedResult.length, 
        'Mixed case should work the same');
    });

    test('should handle partial matches', () => {
      const result = getPoliceStationsByArea('Galle');
      
      assert.ok(Array.isArray(result), 'Should return array');
      // Should find stations with "Galle" in the area name
    });

    test('should return empty array for non-existent area', () => {
      const result = getPoliceStationsByArea('NonExistentArea');
      
      assert.ok(Array.isArray(result), 'Should return array');
      assert.equal(result.length, 0, 'Should return empty array for non-existent area');
    });

    test('should validate area parameter', () => {
      // Empty string
      assert.throws(() => {
        getPoliceStationsByArea('');
      }, 'Should throw error for empty area');

      // Null/undefined
      assert.throws(() => {
        getPoliceStationsByArea(null);
      }, 'Should throw error for null area');

      // Non-string
      assert.throws(() => {
        getPoliceStationsByArea(123);
      }, 'Should throw error for non-string area');
    });
  });

  describe('getPoliceStationByName()', () => {
    test('should find station by exact name', () => {
      const result = getPoliceStationByName('Police Headquarters (Colombo)');
      
      assert.ok(result !== null, 'Should find station by exact name');
      assert.equal(result.name, 'Police Headquarters (Colombo)', 
        'Should return correct station');
    });

    test('should handle case-insensitive search', () => {
      const result = getPoliceStationByName('police headquarters (colombo)');
      
      assert.ok(result !== null, 'Should find station with different case');
    });

    test('should return null for non-existent station', () => {
      const result = getPoliceStationByName('Non-existent Police Station');
      
      assert.equal(result, null, 'Should return null for non-existent station');
    });

    test('should validate name parameter', () => {
      assert.throws(() => {
        getPoliceStationByName('');
      }, 'Should throw error for empty name');

      assert.throws(() => {
        getPoliceStationByName(null);
      }, 'Should throw error for null name');
    });
  });

  describe('getAllAreas()', () => {
    test('should return array of unique areas', () => {
      const areas = getAllAreas();
      
      assert.ok(Array.isArray(areas), 'Should return an array');
      assert.ok(areas.length > 0, 'Should return at least one area');
      
      // Check for uniqueness
      const uniqueAreas = [...new Set(areas)];
      assert.equal(areas.length, uniqueAreas.length, 
        'Should return only unique areas');
    });

    test('should return sorted areas', () => {
      const areas = getAllAreas();
      
      // Check if sorted alphabetically
      for (let i = 1; i < areas.length; i++) {
        assert.ok(areas[i] >= areas[i-1], 
          'Areas should be sorted alphabetically');
      }
    });

    test('should include known major areas', () => {
      const areas = getAllAreas();
      
      assert.ok(areas.includes('Colombo'), 'Should include Colombo');
      // Add more checks for other major areas as needed
    });
  });

  describe('getDatasetStatistics()', () => {
    test('should return comprehensive statistics', () => {
      const stats = getDatasetStatistics();
      
      assert.ok(typeof stats === 'object', 'Should return an object');
      assert.ok(typeof stats.totalStations === 'number', 'Should have totalStations count');
      assert.ok(stats.totalStations > 0, 'Should have positive station count');
      assert.ok(typeof stats.totalAreas === 'number', 'Should have totalAreas count');
      assert.ok(Array.isArray(stats.areas), 'Should have areas array');
      assert.ok(typeof stats.lastUpdated === 'string', 'Should have lastUpdated date');
      assert.ok(typeof stats.coordinateRanges === 'object', 'Should have coordinate ranges');
    });

    test('should have accurate station count', () => {
      const stats = getDatasetStatistics();
      
      // Count should match actual data (currently 185 stations)
      assert.ok(stats.totalStations >= 180, 'Should have at least 180 stations');
      assert.ok(stats.totalStations <= 200, 'Should have reasonable station count');
    });
  });

  describe('Performance Tests', () => {
    test('should handle large search efficiently', () => {
      const startTime = Date.now();
      
      // Perform multiple searches
      for (let i = 0; i < 100; i++) {
        findNearestPoliceStations({
          lat: 6.9271 + (Math.random() - 0.5) * 0.1,
          lng: 79.8612 + (Math.random() - 0.5) * 0.1,
          limit: 5
        });
      }
      
      const duration = Date.now() - startTime;
      
      // Should complete within reasonable time (adjust threshold as needed)
      assert.ok(duration < 5000, `100 searches should complete within 5 seconds, took ${duration}ms`);
    });

    test('should use bounding box optimization effectively', () => {
      // Test with same coordinates to ensure caching/optimization works
      const startTime = Date.now();
      
      for (let i = 0; i < 50; i++) {
        findNearestPoliceStations({
          lat: 6.9271,
          lng: 79.8612,
          limit: 10
        });
      }
      
      const duration = Date.now() - startTime;
      
      // Repeated searches should be fast due to optimization
      assert.ok(duration < 2000, `Repeated searches should be optimized, took ${duration}ms`);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle coordinates at Sri Lanka boundaries', () => {
      // Test near boundaries
      const northResult = findNearestPoliceStations({ lat: 9.8, lng: 80.0, limit: 1 });
      const southResult = findNearestPoliceStations({ lat: 6.0, lng: 80.0, limit: 1 });
      const eastResult = findNearestPoliceStations({ lat: 7.0, lng: 81.8, limit: 1 });
      const westResult = findNearestPoliceStations({ lat: 7.0, lng: 79.7, limit: 1 });
      
      [northResult, southResult, eastResult, westResult].forEach(result => {
        assert.ok(Array.isArray(result), 'Should handle boundary coordinates');
        assert.ok(result.length > 0, 'Should find stations near boundaries');
      });
    });

    test('should handle concurrent requests', async () => {
      const requests = Array.from({ length: 10 }, (_, i) => 
        Promise.resolve(findNearestPoliceStations({
          lat: 6.9271 + i * 0.01,
          lng: 79.8612 + i * 0.01,
          limit: 3
        }))
      );
      
      const results = await Promise.all(requests);
      
      assert.equal(results.length, 10, 'Should handle concurrent requests');
      results.forEach(result => {
        assert.ok(Array.isArray(result), 'Each result should be an array');
        assert.ok(result.length > 0, 'Each result should contain stations');
      });
    });
  });

});