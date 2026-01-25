/**
 * Selenium Tests for Police Stations System with Random Locations
 * Comprehensive test suite for all search functions using random Sri Lankan coordinates
 * @version 1.0.0
 */

import { 
  createWebDriver, 
  WebDriverUtils, 
  TestResults, 
  By, 
  until 
} from './webDriverUtils.js';

import {
  generateCompleteTestDataset,
  generateRandomSriLankanCoordinates,
  generateCityBasedCoordinates,
  generateTouristLocationCoordinates
} from '../data/randomLocationGenerator.js';

import {
  findNearestPoliceStations,
  getPoliceStationsWithinRadius,
  getPoliceStationsByArea,
  validateCoordinates
} from '../../src/index.js';

/**
 * Main test class for Police Stations System
 */
export class PoliceStationsSeleniumTests {
  constructor(browser = 'chrome', headless = false) {
    this.browser = browser;
    this.headless = headless;
    this.driver = null;
    this.utils = null;
    this.results = new TestResults();
    this.testData = null;
  }
  
  /**
   * Initialize test environment
   */
  async setup() {
    try {
      console.log('🚀 Setting up Selenium test environment...');
      
      // Initialize WebDriver
      this.driver = await createWebDriver(this.browser, { headless: this.headless });
      this.utils = new WebDriverUtils(this.driver);
      
      // Generate test data
      this.testData = generateCompleteTestDataset({
        randomCount: 30,
        regionalCount: 5,
        cityCount: 4,
        includeTourist: true,
        includeEdgeCases: true
      });
      
      console.log(`📊 Generated ${this.testData.metadata.totalCoordinates} test coordinates`);
      console.log('✅ Test environment setup completed');
      
    } catch (error) {
      console.error('❌ Test setup failed:', error);
      throw error;
    }
  }
  
  /**
   * Clean up test environment
   */
  async tearDown() {
    if (this.utils) {
      await this.utils.close();
    }
    this.results.printReport();
  }
  
  /**
   * Test nearest station search with random locations
   */
  async testNearestStationSearch() {
    console.log('\\n🔍 Testing nearest station search with random locations...');
    
    const testCoordinates = [
      ...this.testData.random.slice(0, 10),
      ...this.testData.cityBased.slice(0, 5),
      ...this.testData.tourist.slice(0, 3)
    ];
    
    for (const coord of testCoordinates) {
      const startTime = Date.now();
      let testPassed = false;
      let message = '';
      
      try {
        // Test the search function
        const searchParams = { lat: coord.lat, lng: coord.lng, limit: 5 };
        const results = await this.executePoliceStationSearch(searchParams);
        
        // Validate results
        if (results && results.length > 0) {
          const validation = this.validateSearchResults(results, searchParams);
          testPassed = validation.isValid;
          message = validation.message;
          
          // Additional checks
          if (testPassed) {
            testPassed = results.every(station => 
              station.hasOwnProperty('name') &&
              station.hasOwnProperty('distanceKm') &&
              station.distanceKm >= 0
            );
            message = testPassed ? 
              `Found ${results.length} stations, nearest: ${results[0].name} (${results[0].distanceKm}km)` :
              'Invalid station data structure';
          }
        } else {
          testPassed = false;
          message = 'No results returned';
        }
        
      } catch (error) {
        testPassed = false;
        message = `Search failed: ${error.message}`;
      }
      
      const duration = Date.now() - startTime;
      this.results.addResult(
        `Nearest Search [${coord.id}]`,
        testPassed,
        message,
        duration,
        { coordinate: coord, type: 'nearest' }
      );
    }
  }
  
  /**
   * Test radius-based search with various radii
   */
  async testRadiusSearch() {
    console.log('\\n🎯 Testing radius-based search...');
    
    const testRadii = [5, 10, 20, 50, 100]; // km
    const testLocations = [
      ...this.testData.cityBased.slice(0, 3),
      ...this.testData.regional.WESTERN.slice(0, 2)
    ];
    
    for (const location of testLocations) {
      for (const radius of testRadii) {
        const startTime = Date.now();
        let testPassed = false;
        let message = '';
        
        try {
          const searchParams = { 
            lat: location.lat, 
            lng: location.lng, 
            radiusKm: radius 
          };
          
          const results = await this.executeRadiusSearch(searchParams);
          
          if (results) {
            // Validate all results are within radius
            const withinRadius = results.every(station => 
              station.distanceKm <= radius
            );
            
            testPassed = withinRadius;
            message = testPassed ?
              `Found ${results.length} stations within ${radius}km` :
              'Some stations exceed radius limit';
              
            // Log statistics
            if (results.length > 0) {
              const maxDistance = Math.max(...results.map(s => s.distanceKm));
              const avgDistance = results.reduce((sum, s) => sum + s.distanceKm, 0) / results.length;
              message += ` (max: ${maxDistance.toFixed(2)}km, avg: ${avgDistance.toFixed(2)}km)`;
            }
          } else {
            testPassed = true; // Empty results are valid for some remote areas
            message = `No stations found within ${radius}km (valid for remote areas)`;
          }
          
        } catch (error) {
          testPassed = false;
          message = `Radius search failed: ${error.message}`;
        }
        
        const duration = Date.now() - startTime;
        this.results.addResult(
          `Radius Search [${location.id}] - ${radius}km`,
          testPassed,
          message,
          duration,
          { coordinate: location, radius, type: 'radius' }
        );
      }
    }
  }
  
  /**
   * Test area-based search
   */
  async testAreaSearch() {
    console.log('\\n🏘️ Testing area-based search...');
    
    const testAreas = [
      'Colombo', 'Kandy', 'Galle', 'Jaffna', 'Negombo',
      'Western', 'Central', 'Southern', 'Northern'
    ];
    
    for (const area of testAreas) {
      const startTime = Date.now();
      let testPassed = false;
      let message = '';
      
      try {
        const results = await this.executeAreaSearch(area);
        
        if (results && Array.isArray(results)) {
          testPassed = results.length >= 0; // 0 results can be valid
          
          if (results.length > 0) {
            // Validate results contain the search area
            const relevantResults = results.filter(station =>
              station.area.toLowerCase().includes(area.toLowerCase()) ||
              station.name.toLowerCase().includes(area.toLowerCase())
            );
            
            const relevanceRate = (relevantResults.length / results.length) * 100;
            message = `Found ${results.length} stations (${relevanceRate.toFixed(1)}% relevant)`;
            
            // Pass test if most results are relevant
            testPassed = relevanceRate >= 50;
          } else {
            message = `No stations found for area: ${area}`;
            // Only fail if it's a major area that should have stations
            testPassed = !['Colombo', 'Kandy', 'Galle'].includes(area);
          }
        } else {
          testPassed = false;
          message = 'Invalid results format';
        }
        
      } catch (error) {
        testPassed = false;
        message = `Area search failed: ${error.message}`;
      }
      
      const duration = Date.now() - startTime;
      this.results.addResult(
        `Area Search [${area}]`,
        testPassed,
        message,
        duration,
        { area, type: 'area' }
      );
    }
  }
  
  /**
   * Test performance with large datasets
   */
  async testPerformance() {
    console.log('\\n⚡ Testing performance with various scenarios...');
    
    const performanceTests = [
      {
        name: 'High-volume random searches',
        test: async () => {
          const coords = generateRandomSriLankanCoordinates(50);
          const promises = coords.map(coord => 
            this.executePoliceStationSearch({ lat: coord.lat, lng: coord.lng, limit: 3 })
          );
          const results = await Promise.all(promises);
          return { count: results.filter(r => r && r.length > 0).length, total: coords.length };
        }
      },
      {
        name: 'Large radius searches',
        test: async () => {
          const coords = generateCityBasedCoordinates(1);
          const result = await this.executeRadiusSearch({ 
            lat: coords[0].lat, 
            lng: coords[0].lng, 
            radiusKm: 200 
          });
          return { count: result ? result.length : 0 };
        }
      },
      {
        name: 'Tourist location searches',
        test: async () => {
          const coords = generateTouristLocationCoordinates();
          const promises = coords.slice(0, 10).map(coord =>
            this.executePoliceStationSearch({ lat: coord.lat, lng: coord.lng, limit: 5 })
          );
          const results = await Promise.all(promises);
          return { 
            count: results.filter(r => r && r.length > 0).length, 
            total: 10,
            avgResults: results.reduce((sum, r) => sum + (r ? r.length : 0), 0) / results.length
          };
        }
      }
    ];
    
    for (const perfTest of performanceTests) {
      const startTime = Date.now();
      let testPassed = false;
      let message = '';
      
      try {
        const result = await perfTest.test();
        const duration = Date.now() - startTime;
        
        testPassed = duration < 10000; // Should complete within 10 seconds
        message = `Completed in ${duration}ms`;
        
        if (result.count !== undefined) {
          message += `, Success rate: ${result.total ? ((result.count / result.total) * 100).toFixed(1) : 100}%`;
        }
        
        if (result.avgResults) {
          message += `, Avg results: ${result.avgResults.toFixed(1)}`;
        }
        
      } catch (error) {
        testPassed = false;
        message = `Performance test failed: ${error.message}`;
      }
      
      const duration = Date.now() - startTime;
      this.results.addResult(
        `Performance: ${perfTest.name}`,
        testPassed,
        message,
        duration,
        { type: 'performance' }
      );
    }
  }
  
  /**
   * Test error handling and edge cases
   */
  async testErrorHandling() {
    console.log('\\n🛡️ Testing error handling and edge cases...');
    
    const errorTests = [
      {
        name: 'Invalid coordinates (out of bounds)',
        params: { lat: 91, lng: 200, limit: 5 },
        expectError: true
      },
      {
        name: 'Invalid coordinates (non-numeric)',
        params: { lat: 'invalid', lng: 'invalid', limit: 5 },
        expectError: true
      },
      {
        name: 'Edge case - Sri Lanka boundaries',
        params: { lat: 5.916, lng: 79.652, limit: 5 }, // SW corner
        expectError: false
      },
      {
        name: 'Large limit parameter',
        params: { lat: 6.9271, lng: 79.8612, limit: 100 },
        expectError: true // Should enforce max limit
      },
      {
        name: 'Negative radius',
        radiusParams: { lat: 6.9271, lng: 79.8612, radiusKm: -10 },
        expectError: true
      },
      {
        name: 'Empty area string',
        area: '',
        expectError: true
      }
    ];
    
    for (const test of errorTests) {
      const startTime = Date.now();
      let testPassed = false;
      let message = '';
      
      try {
        let result = null;
        
        if (test.params) {
          result = await this.executePoliceStationSearch(test.params);
        } else if (test.radiusParams) {
          result = await this.executeRadiusSearch(test.radiusParams);
        } else if (test.area !== undefined) {
          result = await this.executeAreaSearch(test.area);
        }
        
        if (test.expectError) {
          testPassed = false;
          message = 'Expected error but operation succeeded';
        } else {
          testPassed = result !== null;
          message = testPassed ? 'Operation succeeded as expected' : 'Unexpected failure';
        }
        
      } catch (error) {
        if (test.expectError) {
          testPassed = true;
          message = `Correctly caught error: ${error.message.substring(0, 50)}...`;
        } else {
          testPassed = false;
          message = `Unexpected error: ${error.message}`;
        }
      }
      
      const duration = Date.now() - startTime;
      this.results.addResult(
        `Error Test: ${test.name}`,
        testPassed,
        message,
        duration,
        { type: 'error-handling' }
      );
    }
  }
  
  /**
   * Execute police station search (simulates web interface)
   */
  async executePoliceStationSearch(params) {
    try {
      // In a real web test, this would interact with web elements
      // For now, we'll test the underlying function directly
      const results = findNearestPoliceStations(params);
      
      // Simulate web interaction delay
      await this.driver.sleep(100);
      
      return results;
    } catch (error) {
      throw new Error(`Search execution failed: ${error.message}`);
    }
  }
  
  /**
   * Execute radius search
   */
  async executeRadiusSearch(params) {
    try {
      const results = getPoliceStationsWithinRadius(params);
      await this.driver.sleep(100);
      return results;
    } catch (error) {
      throw new Error(`Radius search failed: ${error.message}`);
    }
  }
  
  /**
   * Execute area search
   */
  async executeAreaSearch(area) {
    try {
      const results = getPoliceStationsByArea(area);
      await this.driver.sleep(100);
      return results;
    } catch (error) {
      throw new Error(`Area search failed: ${error.message}`);
    }
  }
  
  /**
   * Validate search results
   */
  validateSearchResults(results, params) {
    const validation = { isValid: true, message: '' };
    
    if (!Array.isArray(results)) {
      validation.isValid = false;
      validation.message = 'Results is not an array';
      return validation;
    }
    
    if (results.length === 0) {
      validation.message = 'No results found (may be valid for remote areas)';
      return validation;
    }
    
    // Check if results are sorted by distance
    let sortedByDistance = true;
    for (let i = 1; i < results.length; i++) {
      if (results[i].distanceKm < results[i-1].distanceKm) {
        sortedByDistance = false;
        break;
      }
    }
    
    if (!sortedByDistance) {
      validation.isValid = false;
      validation.message = 'Results not sorted by distance';
      return validation;
    }
    
    // Check limit enforcement
    if (params.limit && results.length > params.limit) {
      validation.isValid = false;
      validation.message = `Results exceed limit (${results.length} > ${params.limit})`;
      return validation;
    }
    
    validation.message = 'Results validation passed';
    return validation;
  }
  
  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🧪 Starting comprehensive Police Stations Selenium tests...');
    console.log(`Browser: ${this.browser}, Headless: ${this.headless}`);
    console.log('='.repeat(70));
    
    try {
      await this.setup();
      
      // Run test suites
      await this.testNearestStationSearch();
      await this.testRadiusSearch();
      await this.testAreaSearch();
      await this.testPerformance();
      await this.testErrorHandling();
      
      console.log('\\n✅ All test suites completed!');
      
    } catch (error) {
      console.error('❌ Test execution failed:', error);
      this.results.addResult('Test Setup', false, error.message, 0);
    } finally {
      await this.tearDown();
    }
    
    return this.results.getSummary();
  }
}

/**
 * Run tests with multiple browsers
 */
export async function runCrossBrowserTests() {
  const browsers = ['chrome', 'firefox', 'edge'];
  const allResults = {};
  
  console.log('🌐 Running cross-browser tests...');
  
  for (const browser of browsers) {
    try {
      console.log(`\\n🔄 Testing with ${browser}...`);
      const tester = new PoliceStationsSeleniumTests(browser, true); // headless
      const results = await tester.runAllTests();
      allResults[browser] = results;
    } catch (error) {
      console.error(`❌ ${browser} tests failed:`, error);
      allResults[browser] = { error: error.message };
    }
  }
  
  // Print cross-browser summary
  console.log('\\n🌐 CROSS-BROWSER TEST SUMMARY');
  console.log('='.repeat(50));
  Object.entries(allResults).forEach(([browser, results]) => {
    if (results.error) {
      console.log(`❌ ${browser.toUpperCase()}: Failed - ${results.error}`);
    } else {
      console.log(`${results.failedTests === 0 ? '✅' : '⚠️'} ${browser.toUpperCase()}: ${results.successRate}% (${results.passedTests}/${results.totalTests})`);
    }
  });
  console.log('='.repeat(50));
  
  return allResults;
}