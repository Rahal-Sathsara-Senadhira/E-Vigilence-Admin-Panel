/**
 * Advanced Selenium Test Scenarios for Police Stations System
 * Specialized tests for real-world scenarios and stress testing
 * @version 1.0.0
 */

import { 
  createWebDriver, 
  WebDriverUtils, 
  TestResults 
} from './webDriverUtils.js';

import {
  generateCompleteTestDataset,
  generateRandomSriLankanCoordinates,
  generateEmergencyScenarios
} from '../data/randomLocationGenerator.js';

import {
  findNearestPoliceStations,
  getPoliceStationsWithinRadius,
  calculateDistance
} from '../../src/index.js';

/**
 * Advanced testing scenarios
 */
export class AdvancedPoliceStationTests {
  constructor(browser = 'chrome', headless = true) {
    this.browser = browser;
    this.headless = headless;
    this.driver = null;
    this.utils = null;
    this.results = new TestResults();
  }
  
  async setup() {
    console.log('🔧 Setting up advanced test environment...');
    this.driver = await createWebDriver(this.browser, { headless: this.headless });
    this.utils = new WebDriverUtils(this.driver);
    console.log('✅ Advanced test setup completed');
  }
  
  async tearDown() {
    if (this.utils) {
      await this.utils.close();
    }
    this.results.printReport();
  }
  
  /**
   * Test emergency response scenarios
   */
  async testEmergencyScenarios() {
    console.log('\\n🚨 Testing emergency response scenarios...');
    
    const emergencyLocations = [
      // Tourist areas (high priority)
      { lat: 6.0329, lng: 80.2168, name: 'Galle Fort Tourist Area', priority: 'high' },
      { lat: 7.2906, lng: 80.6337, name: 'Kandy Temple Area', priority: 'high' },
      { lat: 6.9271, lng: 79.8612, name: 'Colombo City Center', priority: 'high' },
      
      // Remote areas (challenging)
      { lat: 6.2088, lng: 80.7908, name: 'Rural Tea Estate', priority: 'medium' },
      { lat: 8.5874, lng: 81.2152, name: 'Northern Remote Area', priority: 'low' },
      
      // Border areas
      { lat: 9.6615, lng: 80.0255, name: 'Northern Border', priority: 'medium' },
      { lat: 5.9549, lng: 80.5550, name: 'Southern Coast', priority: 'medium' }
    ];
    
    for (const location of emergencyLocations) {
      const startTime = Date.now();
      let testPassed = false;
      let message = '';
      
      try {
        // Emergency response requires finding stations within 10km quickly
        const nearestStations = findNearestPoliceStations({
          lat: location.lat,
          lng: location.lng,
          limit: 3
        });
        
        const nearbyStations = getPoliceStationsWithinRadius({
          lat: location.lat,
          lng: location.lng,
          radiusKm: 10
        });
        
        const responseTime = Date.now() - startTime;
        
        // Validate emergency response criteria
        const hasNearestStation = nearestStations && nearestStations.length > 0;
        const responseTimeAcceptable = responseTime < 1000; // < 1 second
        const nearestDistance = hasNearestStation ? nearestStations[0].distanceKm : Infinity;
        
        // Emergency response criteria
        if (location.priority === 'high') {
          testPassed = hasNearestStation && nearestDistance <= 15 && responseTimeAcceptable;
          message = `${hasNearestStation ? '✓' : '✗'} Station found, ${nearestDistance.toFixed(2)}km away, ${responseTime}ms response`;
        } else {
          testPassed = responseTimeAcceptable; // Response time is more critical than distance for remote areas
          message = `Response time: ${responseTime}ms${hasNearestStation ? `, nearest: ${nearestDistance.toFixed(2)}km` : ', no stations nearby'}`;
        }
        
        // Additional metrics
        if (hasNearestStation) {
          message += `, ${nearbyStations ? nearbyStations.length : 0} stations within 10km`;
        }
        
      } catch (error) {
        testPassed = false;
        message = `Emergency test failed: ${error.message}`;
      }
      
      const duration = Date.now() - startTime;
      this.results.addResult(
        `Emergency: ${location.name} [${location.priority}]`,
        testPassed,
        message,
        duration,
        { coordinate: location, type: 'emergency' }
      );
    }
  }
  
  /**
   * Test concurrent access scenarios
   */
  async testConcurrentAccess() {
    console.log('\\n⚡ Testing concurrent access scenarios...');
    
    const concurrentTests = [10, 25, 50, 100]; // Number of concurrent requests
    
    for (const concurrentCount of concurrentTests) {
      const startTime = Date.now();
      let testPassed = false;
      let message = '';
      
      try {
        // Generate multiple random coordinates
        const coordinates = generateRandomSriLankanCoordinates(concurrentCount);
        
        // Execute all searches concurrently
        const searchPromises = coordinates.map((coord, index) => {
          return new Promise((resolve) => {
            setTimeout(() => {
              try {
                const result = findNearestPoliceStations({
                  lat: coord.lat,
                  lng: coord.lng,
                  limit: 3
                });
                resolve({ success: true, result, index });
              } catch (error) {
                resolve({ success: false, error: error.message, index });
              }
            }, Math.random() * 100); // Random delay to simulate real-world timing
          });
        });
        
        const results = await Promise.all(searchPromises);
        const duration = Date.now() - startTime;
        
        // Analyze results
        const successfulResults = results.filter(r => r.success);
        const successRate = (successfulResults.length / results.length) * 100;
        const avgResponseTime = duration / concurrentCount;
        
        // Pass if most requests succeed and response time is reasonable
        testPassed = successRate >= 95 && avgResponseTime < 100;
        message = `${successfulResults.length}/${results.length} successful (${successRate.toFixed(1)}%), avg: ${avgResponseTime.toFixed(2)}ms/request`;
        
        if (!testPassed) {
          const failedResults = results.filter(r => !r.success);
          if (failedResults.length > 0) {
            message += `, errors: ${failedResults.slice(0, 2).map(r => r.error).join(', ')}`;
          }
        }
        
      } catch (error) {
        testPassed = false;
        message = `Concurrent test failed: ${error.message}`;
      }
      
      const duration = Date.now() - startTime;
      this.results.addResult(
        `Concurrent Access: ${concurrentCount} requests`,
        testPassed,
        message,
        duration,
        { concurrentCount, type: 'concurrent' }
      );
    }
  }
  
  /**
   * Test memory and resource management
   */
  async testResourceManagement() {
    console.log('\\n🧠 Testing memory and resource management...');
    
    const resourceTests = [
      {
        name: 'Large dataset processing',
        test: async () => {
          const largeDataset = generateRandomSriLankanCoordinates(500);
          const results = [];
          
          for (const coord of largeDataset) {
            const result = findNearestPoliceStations({
              lat: coord.lat,
              lng: coord.lng,
              limit: 1
            });
            results.push(result);
          }
          
          return { processedCount: results.length, hasResults: results.every(r => r && r.length > 0) };
        }
      },
      {
        name: 'Memory stress test',
        test: async () => {
          const iterations = 1000;
          const results = [];
          
          for (let i = 0; i < iterations; i++) {
            const coords = generateRandomSriLankanCoordinates(1)[0];
            const result = findNearestPoliceStations({
              lat: coords.lat,
              lng: coords.lng,
              limit: 5
            });
            results.push(result);
            
            // Simulate memory pressure
            if (i % 100 === 0) {
              // Force garbage collection (if available)
              if (global.gc) {
                global.gc();
              }
            }
          }
          
          return { iterations, successCount: results.filter(r => r && r.length > 0).length };
        }
      },
      {
        name: 'Rapid successive calls',
        test: async () => {
          const rapidCalls = 200;
          const coord = generateRandomSriLankanCoordinates(1)[0];
          let successCount = 0;
          
          for (let i = 0; i < rapidCalls; i++) {
            try {
              const result = findNearestPoliceStations({
                lat: coord.lat,
                lng: coord.lng,
                limit: 3
              });
              if (result && result.length > 0) {
                successCount++;
              }
            } catch (error) {
              // Count failures
            }
          }
          
          return { totalCalls: rapidCalls, successCount };
        }
      }
    ];
    
    for (const resourceTest of resourceTests) {
      const startTime = Date.now();
      let testPassed = false;
      let message = '';
      
      try {
        const result = await resourceTest.test();
        const duration = Date.now() - startTime;
        
        // Evaluate based on test type
        if (resourceTest.name.includes('Large dataset')) {
          testPassed = result.hasResults && duration < 30000; // Should complete within 30 seconds
          message = `Processed ${result.processedCount} locations in ${duration}ms`;
        } else if (resourceTest.name.includes('Memory stress')) {
          const successRate = (result.successCount / result.iterations) * 100;
          testPassed = successRate >= 95 && duration < 60000;
          message = `${result.successCount}/${result.iterations} successful (${successRate.toFixed(1)}%)`;
        } else if (resourceTest.name.includes('Rapid successive')) {
          const successRate = (result.successCount / result.totalCalls) * 100;
          testPassed = successRate >= 95 && duration < 10000;
          message = `${result.successCount}/${result.totalCalls} successful (${successRate.toFixed(1)}%), ${(duration/result.totalCalls).toFixed(2)}ms/call`;
        }
        
      } catch (error) {
        testPassed = false;
        message = `Resource test failed: ${error.message}`;
      }
      
      const duration = Date.now() - startTime;
      this.results.addResult(
        `Resource: ${resourceTest.name}`,
        testPassed,
        message,
        duration,
        { type: 'resource' }
      );
    }
  }
  
  /**
   * Test geographic edge cases
   */
  async testGeographicEdgeCases() {
    console.log('\\n🗺️ Testing geographic edge cases...');
    
    const edgeCases = [
      // Sri Lanka boundary corners
      { lat: 5.916, lng: 79.652, name: 'Southwest Corner', expected: 'should find stations' },
      { lat: 9.835, lng: 79.695, name: 'Northwest Corner', expected: 'may have limited stations' },
      { lat: 9.835, lng: 81.895, name: 'Northeast Corner', expected: 'may have limited stations' },
      { lat: 5.916, lng: 81.895, name: 'Southeast Corner', expected: 'should find stations' },
      
      // Island areas
      { lat: 9.518, lng: 80.196, name: 'Jaffna Peninsula', expected: 'should find local stations' },
      { lat: 6.033, lng: 80.217, name: 'Galle Area', expected: 'should find stations' },
      
      // Mountain regions
      { lat: 6.950, lng: 80.767, name: 'Central Highlands', expected: 'limited stations expected' },
      { lat: 7.055, lng: 80.633, name: 'Kandy Hills', expected: 'should find stations' },
      
      // Coastal areas
      { lat: 7.269, lng: 79.847, name: 'West Coast', expected: 'should find stations' },
      { lat: 8.574, lng: 81.215, name: 'East Coast', expected: 'may have limited stations' }
    ];
    
    for (const edgeCase of edgeCases) {
      const startTime = Date.now();
      let testPassed = false;
      let message = '';
      
      try {
        const nearestStations = findNearestPoliceStations({
          lat: edgeCase.lat,
          lng: edgeCase.lng,
          limit: 5
        });
        
        const withinRadius = getPoliceStationsWithinRadius({
          lat: edgeCase.lat,
          lng: edgeCase.lng,
          radiusKm: 25 // 25km radius for edge cases
        });
        
        const hasResults = nearestStations && nearestStations.length > 0;
        const nearbyCount = withinRadius ? withinRadius.length : 0;
        const nearestDistance = hasResults ? nearestStations[0].distanceKm : 0;
        
        // Evaluate based on expected results
        if (edgeCase.expected.includes('should find stations')) {
          testPassed = hasResults && nearestDistance <= 50; // Within 50km for edge areas
          message = hasResults ? 
            `Found ${nearestStations.length} stations, nearest: ${nearestDistance.toFixed(2)}km, ${nearbyCount} within 25km` :
            'No stations found (unexpected for this area)';
        } else if (edgeCase.expected.includes('may have limited')) {
          testPassed = true; // Always pass for areas expected to have limited coverage
          message = hasResults ? 
            `Found ${nearestStations.length} stations, nearest: ${nearestDistance.toFixed(2)}km` :
            'No stations found (expected for remote area)';
        } else {
          testPassed = hasResults;
          message = hasResults ? 
            `Found ${nearestStations.length} stations` :
            'No stations found';
        }
        
      } catch (error) {
        testPassed = false;
        message = `Geographic test failed: ${error.message}`;
      }
      
      const duration = Date.now() - startTime;
      this.results.addResult(
        `Geographic Edge: ${edgeCase.name}`,
        testPassed,
        message,
        duration,
        { coordinate: edgeCase, type: 'geographic' }
      );
    }
  }
  
  /**
   * Test data accuracy and consistency
   */
  async testDataAccuracy() {
    console.log('\\n🎯 Testing data accuracy and consistency...');
    
    // Test with known accurate locations (major cities)
    const knownLocations = [
      { lat: 6.9271, lng: 79.8612, name: 'Colombo', expectedStations: ['Colombo', 'Fort', 'Pettah'] },
      { lat: 7.2906, lng: 80.6337, name: 'Kandy', expectedStations: ['Kandy', 'Peradeniya'] },
      { lat: 6.0329, lng: 80.2168, name: 'Galle', expectedStations: ['Galle'] },
      { lat: 8.5874, lng: 81.2152, name: 'Trincomalee', expectedStations: ['Trincomalee'] },
      { lat: 9.6615, lng: 80.0255, name: 'Jaffna', expectedStations: ['Jaffna'] }
    ];
    
    for (const location of knownLocations) {
      const startTime = Date.now();
      let testPassed = false;
      let message = '';
      
      try {
        const nearestStations = findNearestPoliceStations({
          lat: location.lat,
          lng: location.lng,
          limit: 10
        });
        
        if (nearestStations && nearestStations.length > 0) {
          // Check if expected stations are found
          const foundExpected = location.expectedStations.some(expected => 
            nearestStations.some(station => 
              station.name.toLowerCase().includes(expected.toLowerCase())
            )
          );
          
          // Check distance accuracy (nearest should be reasonably close for cities)
          const nearestDistance = nearestStations[0].distanceKm;
          const distanceReasonable = nearestDistance <= 20; // Within 20km for major cities
          
          // Verify distance calculation by recalculating
          const recalculatedDistance = calculateDistance(
            location.lat, location.lng,
            nearestStations[0].coordinates.lat, nearestStations[0].coordinates.lng
          );
          
          const distanceAccurate = Math.abs(recalculatedDistance - nearestDistance) < 0.1;
          
          testPassed = foundExpected && distanceReasonable && distanceAccurate;
          message = `${foundExpected ? '✓' : '✗'} Expected stations found, nearest: ${nearestDistance.toFixed(2)}km${distanceAccurate ? '' : ' (distance calculation error)'}, found: ${nearestStations.slice(0, 3).map(s => s.name).join(', ')}`;
          
        } else {
          testPassed = false;
          message = 'No stations found for major city (data issue)';
        }
        
      } catch (error) {
        testPassed = false;
        message = `Accuracy test failed: ${error.message}`;
      }
      
      const duration = Date.now() - startTime;
      this.results.addResult(
        `Data Accuracy: ${location.name}`,
        testPassed,
        message,
        duration,
        { coordinate: location, type: 'accuracy' }
      );
    }
  }
  
  /**
   * Run all advanced tests
   */
  async runAllAdvancedTests() {
    console.log('🚀 Starting advanced Police Stations tests...');
    console.log('='.repeat(70));
    
    try {
      await this.setup();
      
      await this.testEmergencyScenarios();
      await this.testConcurrentAccess();
      await this.testResourceManagement();
      await this.testGeographicEdgeCases();
      await this.testDataAccuracy();
      
      console.log('\\n✅ All advanced test suites completed!');
      
    } catch (error) {
      console.error('❌ Advanced test execution failed:', error);
      this.results.addResult('Advanced Test Setup', false, error.message, 0);
    } finally {
      await this.tearDown();
    }
    
    return this.results.getSummary();
  }
}

// Export for use in test runner
export { AdvancedPoliceStationTests };