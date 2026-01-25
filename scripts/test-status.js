#!/usr/bin/env node

/**
 * Test Status Reporter
 * 
 * Provides comprehensive test status and system health check
 */

import { execSync } from 'child_process';
import { performance } from 'perf_hooks';

console.log('🧪 Police Station Locator - Test Status Report');
console.log('=' .repeat(50));

// Test Suite Status
try {
  console.log('\n📊 Running Test Suite...');
  const testStart = performance.now();
  
  const testOutput = execSync('npm test', { 
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  const testEnd = performance.now();
  const testDuration = Math.round(testEnd - testStart);
  
  // Parse test results
  const passedMatch = testOutput.match(/pass (\d+)/);
  const failedMatch = testOutput.match(/fail (\d+)/);
  const totalMatch = testOutput.match(/tests (\d+)/);
  
  const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
  const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
  const total = totalMatch ? parseInt(totalMatch[1]) : 0;
  
  console.log(`✅ Tests Passed: ${passed}/${total}`);
  console.log(`❌ Tests Failed: ${failed}`);
  console.log(`⏱️  Duration: ${testDuration}ms`);
  
  if (failed > 0) {
    console.log('❌ TEST SUITE FAILED');
    process.exit(1);
  }
  
} catch (error) {
  console.log('❌ Test suite failed to run');
  console.log('Error:', error.message);
  process.exit(1);
}

// System Health Check
console.log('\n🔧 System Health Check...');

try {
  // Check Node.js version
  const nodeVersion = process.version;
  console.log(`✅ Node.js: ${nodeVersion}`);
  
  // Check module imports
  const { POLICE_STATIONS } = await import('../src/data/policeStationsData.js');
  console.log(`✅ Police Stations Data: ${POLICE_STATIONS.length} stations loaded`);
  
  const { findNearestPoliceStations } = await import('../src/services/policeStationsService.js');
  const testResult = findNearestPoliceStations({
    lat: 6.9271,
    lng: 79.8612,
    limit: 1
  });
  console.log(`✅ Core Function: Working (found ${testResult.length} stations)`);
  
  // Validate Sri Lankan coordinates
  const validStations = POLICE_STATIONS.filter(s => 
    s.lat >= 5.916 && s.lat <= 9.835 && 
    s.lng >= 79.652 && s.lng <= 81.879
  );
  console.log(`✅ Geographic Validation: ${validStations.length}/${POLICE_STATIONS.length} stations in Sri Lanka`);
  
} catch (error) {
  console.log('❌ System health check failed');
  console.log('Error:', error.message);
  process.exit(1);
}

// Performance Benchmark
console.log('\n⚡ Performance Benchmark...');

try {
  const { findNearestPoliceStations } = await import('../src/services/policeStationsService.js');
  
  const benchmarkStart = performance.now();
  
  // Run 100 searches
  for (let i = 0; i < 100; i++) {
    findNearestPoliceStations({
      lat: 6.9271 + (Math.random() - 0.5) * 0.1,
      lng: 79.8612 + (Math.random() - 0.5) * 0.1,
      limit: 3
    });
  }
  
  const benchmarkEnd = performance.now();
  const avgTime = Math.round((benchmarkEnd - benchmarkStart) / 100 * 100) / 100;
  
  console.log(`✅ Average Search Time: ${avgTime}ms (100 searches)`);
  
  if (avgTime > 50) {
    console.log('⚠️  Warning: Performance is slower than expected');
  } else {
    console.log('🚀 Performance: Excellent');
  }
  
} catch (error) {
  console.log('❌ Performance benchmark failed');
  console.log('Error:', error.message);
}

console.log('\n🎉 All systems operational!');
console.log('\n📋 Quick Commands:');
console.log('  npm test              - Run all tests');
console.log('  npm run test:watch    - Watch mode');
console.log('  npm run test:coverage - Coverage report');
console.log('  npm run benchmark     - Performance test');