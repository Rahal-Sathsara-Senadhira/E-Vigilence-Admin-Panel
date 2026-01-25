/**
 * Unit Tests for Distance Calculation Utilities
 * 
 * Tests mathematical accuracy and edge cases for geographic distance calculations
 */

import { strict as assert } from 'assert';
import { test, describe } from 'node:test';
import {
  calculateDistance,
  toRadians,
  toDegrees,
  approximateDistance,
  getBoundingBoxCandidates,
  calculateDistancesForStations
} from '../src/utils/distance.js';

describe('Distance Calculation Utilities', () => {

  describe('toRadians()', () => {
    test('should convert degrees to radians correctly', () => {
      assert.equal(toRadians(0), 0);
      assert.equal(toRadians(90), Math.PI / 2);
      assert.equal(toRadians(180), Math.PI);
      assert.equal(toRadians(360), Math.PI * 2);
    });

    test('should handle negative degrees', () => {
      assert.equal(toRadians(-90), -Math.PI / 2);
      assert.equal(toRadians(-180), -Math.PI);
    });

    test('should throw error for invalid input', () => {
      assert.throws(() => toRadians('invalid'), /Input must be a valid number/);
      assert.throws(() => toRadians(NaN), /Input must be a valid number/);
      assert.throws(() => toRadians(null), /Input must be a valid number/);
    });
  });

  describe('toDegrees()', () => {
    test('should convert radians to degrees correctly', () => {
      assert.equal(toDegrees(0), 0);
      assert.equal(toDegrees(Math.PI / 2), 90);
      assert.equal(toDegrees(Math.PI), 180);
      assert.equal(toDegrees(Math.PI * 2), 360);
    });

    test('should handle negative radians', () => {
      assert.equal(toDegrees(-Math.PI / 2), -90);
      assert.equal(toDegrees(-Math.PI), -180);
    });

    test('should throw error for invalid input', () => {
      assert.throws(() => toDegrees('invalid'), /Input must be a valid number/);
      assert.throws(() => toDegrees(NaN), /Input must be a valid number/);
    });
  });

  describe('calculateDistance()', () => {
    test('should calculate distance between known locations accurately', () => {
      // Distance between Colombo and Kandy (approximately 94 km)
      const colomboLat = 6.9271, colomboLng = 79.8612;
      const kandyLat = 7.2906, kandyLng = 80.6337;
      
      const distance = calculateDistance(colomboLat, colomboLng, kandyLat, kandyLng);
      
      // Should be approximately 94 km (allow 5km tolerance for precision)
      assert.ok(distance > 89 && distance < 99, `Expected ~94km, got ${distance}km`);
    });

    test('should return 0 for identical coordinates', () => {
      const distance = calculateDistance(6.9271, 79.8612, 6.9271, 79.8612);
      assert.ok(distance < 0.001, `Expected ~0km, got ${distance}km`);
    });

    test('should handle coordinates at different hemispheres', () => {
      // North to South hemisphere
      const distance = calculateDistance(45.0, 0.0, -45.0, 0.0);
      assert.ok(distance > 9900 && distance < 10100, `Expected ~10000km, got ${distance}km`);
    });

    test('should throw error for invalid coordinates', () => {
      assert.throws(() => calculateDistance('invalid', 79.8612, 7.2906, 80.6337));
      assert.throws(() => calculateDistance(6.9271, 'invalid', 7.2906, 80.6337));
      assert.throws(() => calculateDistance(6.9271, 79.8612, null, 80.6337));
    });

    test('should handle edge case coordinates', () => {
      // North Pole to South Pole
      const distance = calculateDistance(90, 0, -90, 0);
      const expectedHalfCircumference = Math.PI * 6371;
      assert.ok(Math.abs(distance - expectedHalfCircumference) < 1, 
        `Expected ~${expectedHalfCircumference}km, got ${distance}km`);
    });
  });

  describe('approximateDistance()', () => {
    test('should provide reasonable approximation', () => {
      const lat1 = 6.9271, lng1 = 79.8612;
      const lat2 = 7.2906, lng2 = 80.6337;
      
      const accurate = calculateDistance(lat1, lng1, lat2, lng2);
      const approximate = approximateDistance(lat1, lng1, lat2, lng2);
      
      // Approximation should be within 20% of accurate distance
      const percentDiff = Math.abs(approximate - accurate) / accurate * 100;
      assert.ok(percentDiff < 20, `Approximation too inaccurate: ${percentDiff}% difference`);
    });

    test('should be faster than precise calculation', () => {
      const lat1 = 6.9271, lng1 = 79.8612;
      const lat2 = 7.2906, lng2 = 80.6337;
      
      const iterations = 1000;
      
      // Time approximate calculation
      const startApprox = Date.now();
      for (let i = 0; i < iterations; i++) {
        approximateDistance(lat1, lng1, lat2, lng2);
      }
      const approxTime = Date.now() - startApprox;
      
      // Time accurate calculation
      const startAccurate = Date.now();
      for (let i = 0; i < iterations; i++) {
        calculateDistance(lat1, lng1, lat2, lng2);
      }
      const accurateTime = Date.now() - startAccurate;
      
      // Approximate should be faster (or at least not significantly slower)
      assert.ok(approxTime <= accurateTime * 1.5, 
        `Approximate (${approxTime}ms) should be faster than accurate (${accurateTime}ms)`);
    });
  });

  describe('getBoundingBoxCandidates()', () => {
    test('should return subset of stations within bounding box', () => {
      const testStations = [
        { name: 'Close Station', lat: 6.9271, lng: 79.8612, area: 'Colombo' },
        { name: 'Far Station', lat: 8.5874, lng: 81.2152, area: 'Trincomalee' },
        { name: 'Medium Station', lat: 7.2906, lng: 80.6337, area: 'Kandy' }
      ];
      
      const candidates = getBoundingBoxCandidates(6.9271, 79.8612, testStations, 0.5);
      
      // Should include close station, exclude far station
      assert.ok(candidates.length > 0, 'Should return some candidates');
      assert.ok(candidates.length <= testStations.length, 'Should not return more than input');
      
      // Verify bounding box logic
      const closeStationIncluded = candidates.some(s => s.name === 'Close Station');
      assert.ok(closeStationIncluded, 'Close station should be included');
    });

    test('should handle empty station array', () => {
      const candidates = getBoundingBoxCandidates(6.9271, 79.8612, [], 0.5);
      assert.equal(candidates.length, 0, 'Should return empty array for empty input');
    });

    test('should handle large threshold', () => {
      const testStations = [
        { name: 'Station 1', lat: 6.0, lng: 79.0, area: 'Area1' },
        { name: 'Station 2', lat: 9.0, lng: 82.0, area: 'Area2' }
      ];
      
      const candidates = getBoundingBoxCandidates(7.0, 80.0, testStations, 5.0);
      assert.equal(candidates.length, testStations.length, 'Large threshold should include all stations');
    });
  });

  describe('calculateDistancesForStations()', () => {
    test('should calculate distances for multiple stations', () => {
      const testStations = [
        { name: 'Station A', lat: 6.9271, lng: 79.8612, area: 'Colombo' },
        { name: 'Station B', lat: 7.2906, lng: 80.6337, area: 'Kandy' },
        { name: 'Station C', lat: 6.0329, lng: 80.2168, area: 'Galle' }
      ];
      
      const userLat = 6.9271, userLng = 79.8612;
      const results = calculateDistancesForStations(userLat, userLng, testStations);
      
      assert.equal(results.length, testStations.length, 'Should return same number of results');
      
      // Check structure of results
      results.forEach(result => {
        assert.ok(typeof result.name === 'string', 'Should have name');
        assert.ok(typeof result.distanceKm === 'number', 'Should have distance');
        assert.ok(result.distanceKm >= 0, 'Distance should be non-negative');
        assert.ok(result.coordinates, 'Should have coordinates');
        assert.ok(typeof result.coordinates.lat === 'number', 'Should have lat coordinate');
        assert.ok(typeof result.coordinates.lng === 'number', 'Should have lng coordinate');
      });
      
      // Results should be sorted by distance
      for (let i = 1; i < results.length; i++) {
        assert.ok(results[i].distanceKm >= results[i-1].distanceKm, 
          'Results should be sorted by distance');
      }
    });

    test('should handle single station', () => {
      const testStations = [
        { name: 'Only Station', lat: 7.2906, lng: 80.6337, area: 'Kandy' }
      ];
      
      const results = calculateDistancesForStations(6.9271, 79.8612, testStations);
      assert.equal(results.length, 1, 'Should return single result');
      assert.ok(results[0].distanceKm > 0, 'Should calculate distance correctly');
    });

    test('should handle empty stations array', () => {
      const results = calculateDistancesForStations(6.9271, 79.8612, []);
      assert.equal(results.length, 0, 'Should return empty array');
    });
  });

  describe('Mathematical Precision', () => {
    test('should maintain precision with very close coordinates', () => {
      // Test with coordinates 1 meter apart (approximately)
      const lat1 = 6.927100, lng1 = 79.861200;
      const lat2 = 6.927109, lng2 = 79.861200; // ~1 meter north
      
      const distance = calculateDistance(lat1, lng1, lat2, lng2);
      
      // Should detect small differences (within reasonable precision)
      assert.ok(distance > 0, 'Should detect small coordinate differences');
      assert.ok(distance < 0.01, 'Should be very small distance for close coordinates');
    });

    test('should handle coordinate precision limits', () => {
      // Test with maximum coordinate precision
      const distance = calculateDistance(
        6.927100000001, 79.861200000001,
        6.927100000002, 79.861200000002
      );
      
      assert.ok(typeof distance === 'number', 'Should return valid number');
      assert.ok(!isNaN(distance), 'Should not return NaN');
    });
  });

});