/**
 * Test Configuration and Setup
 * 
 * Configuration for running unit tests across the police stations system
 */

import { strict as assert } from 'assert';
import { test, describe } from 'node:test';

// Test helper functions
export const TestHelpers = {
  /**
   * Assert that a value is within expected range
   */
  assertInRange(actual, min, max, message = '') {
    assert.ok(actual >= min && actual <= max, 
      `${message} Expected ${actual} to be between ${min} and ${max}`);
  },

  /**
   * Assert array is sorted in ascending order
   */
  assertSorted(array, property = null, message = 'Array should be sorted') {
    for (let i = 1; i < array.length; i++) {
      const current = property ? array[i][property] : array[i];
      const previous = property ? array[i-1][property] : array[i-1];
      assert.ok(current >= previous, `${message} - Item at index ${i} is out of order`);
    }
  },

  /**
   * Assert object has required properties
   */
  assertHasProperties(obj, properties, message = 'Object missing required properties') {
    properties.forEach(prop => {
      assert.ok(obj.hasOwnProperty(prop), `${message} - Missing property: ${prop}`);
    });
  },

  /**
   * Generate test coordinates within Sri Lanka bounds
   */
  generateSriLankanCoordinate() {
    return {
      lat: 5.916 + Math.random() * (9.835 - 5.916),
      lng: 79.652 + Math.random() * (81.879 - 79.652)
    };
  },

  /**
   * Measure execution time of a function
   */
  measureExecutionTime(func, iterations = 1) {
    const start = Date.now();
    for (let i = 0; i < iterations; i++) {
      func();
    }
    return Date.now() - start;
  },

  /**
   * Test data for police stations
   */
  getTestStations() {
    return [
      { name: "Test Central Police", lat: 6.9271, lng: 79.8612, area: "Colombo" },
      { name: "Test Kandy Police", lat: 7.2906, lng: 80.6337, area: "Kandy" },
      { name: "Test Galle Police", lat: 6.0329, lng: 80.2168, area: "Galle" },
      { name: "Test Jaffna Police", lat: 9.6615, lng: 80.0255, area: "Jaffna" },
      { name: "Test Negombo Police", lat: 7.2008, lng: 79.8407, area: "Negombo" }
    ];
  }
};

// Test constants
export const TestConstants = {
  // Sri Lanka boundaries
  SRI_LANKA_BOUNDS: {
    MIN_LAT: 5.916, MAX_LAT: 9.835,
    MIN_LNG: 79.652, MAX_LNG: 81.879
  },
  
  // Known distances for validation
  KNOWN_DISTANCES: {
    COLOMBO_KANDY: { from: [6.9271, 79.8612], to: [7.2906, 80.6337], expectedKm: 94 },
    COLOMBO_GALLE: { from: [6.9271, 79.8612], to: [6.0329, 80.2168], expectedKm: 119 },
    KANDY_GALLE: { from: [7.2906, 80.6337], to: [6.0329, 80.2168], expectedKm: 168 }
  },
  
  // Performance thresholds
  PERFORMANCE: {
    SINGLE_SEARCH_MS: 100,
    BATCH_SEARCH_MS: 1000,
    LARGE_DATASET_MS: 5000
  }
};

// Export test utilities for use in other test files
export default { TestHelpers, TestConstants };