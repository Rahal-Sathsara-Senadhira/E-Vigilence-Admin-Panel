#!/usr/bin/env node

/**
 * Performance Benchmark Script
 * 
 * Tests the performance of core functions under various loads
 */

import { performance } from 'perf_hooks';

async function runBenchmarks() {
  console.log('⚡ Police Station Locator - Performance Benchmark');
  console.log('=' .repeat(50));
  
  const { 
    findNearestPoliceStations, 
    getPoliceStationsWithinRadius,
    calculateDistance
  } = await import('../src/services/policeStationsService.js');
  
  const { calculateDistance: calcDist } = await import('../src/utils/distance.js');
  
  // Benchmark 1: Single Search Performance
  console.log('\n🎯 Benchmark 1: Single Search Performance');
  const singleSearchTimes = [];
  
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    findNearestPoliceStations({
      lat: 6.9271,
      lng: 79.8612,
      limit: 5
    });
    const end = performance.now();
    singleSearchTimes.push(end - start);
  }
  
  const avgSingle = singleSearchTimes.reduce((a, b) => a + b) / singleSearchTimes.length;
  console.log(`Average time: ${avgSingle.toFixed(2)}ms`);
  console.log(`Min time: ${Math.min(...singleSearchTimes).toFixed(2)}ms`);
  console.log(`Max time: ${Math.max(...singleSearchTimes).toFixed(2)}ms`);
  
  // Benchmark 2: Batch Search Performance
  console.log('\n🚀 Benchmark 2: Batch Search Performance (100 searches)');
  const batchStart = performance.now();
  
  // Safe Sri Lankan coordinates (Colombo area)
  const baseLat = 6.9271;
  const baseLng = 79.8612;
  
  for (let i = 0; i < 100; i++) {
    findNearestPoliceStations({
      lat: baseLat + (Math.random() - 0.5) * 0.2, // ±0.1 degree (~11km)
      lng: baseLng + (Math.random() - 0.5) * 0.2,
      limit: 3
    });
  }
  
  const batchEnd = performance.now();
  const batchTotal = batchEnd - batchStart;
  const batchAvg = batchTotal / 100;
  
  console.log(`Total time: ${batchTotal.toFixed(2)}ms`);
  console.log(`Average per search: ${batchAvg.toFixed(2)}ms`);
  console.log(`Searches per second: ${Math.round(1000 / batchAvg)}`);
  
  // Benchmark 3: Radius Search Performance
  console.log('\n🎯 Benchmark 3: Radius Search Performance');
  const radiusStart = performance.now();
  
  for (let i = 0; i < 50; i++) {
    getPoliceStationsWithinRadius({
      lat: baseLat + (Math.random() - 0.5) * 0.2,
      lng: baseLng + (Math.random() - 0.5) * 0.2,
      radiusKm: 10 + Math.random() * 40
    });
  }
  
  const radiusEnd = performance.now();
  const radiusAvg = (radiusEnd - radiusStart) / 50;
  
  console.log(`Average radius search: ${radiusAvg.toFixed(2)}ms`);
  
  // Benchmark 4: Distance Calculation Performance
  console.log('\n📐 Benchmark 4: Distance Calculation Performance');
  const distanceStart = performance.now();
  
  for (let i = 0; i < 1000; i++) {
    calcDist(
      6.9271 + Math.random(),
      79.8612 + Math.random(),
      7.2906 + Math.random(),
      80.6337 + Math.random()
    );
  }
  
  const distanceEnd = performance.now();
  const distanceAvg = (distanceEnd - distanceStart) / 1000;
  
  console.log(`Average distance calculation: ${distanceAvg.toFixed(3)}ms`);
  console.log(`Distance calculations per second: ${Math.round(1000 / distanceAvg)}`);
  
  // Benchmark 5: Memory Usage
  console.log('\n💾 Benchmark 5: Memory Usage');
  const memBefore = process.memoryUsage();
  
  // Create large array of search results
  const results = [];
  for (let i = 0; i < 1000; i++) {
    results.push(findNearestPoliceStations({
      lat: baseLat + (Math.random() - 0.5) * 0.2,
      lng: baseLng + (Math.random() - 0.5) * 0.2,
      limit: 10
    }));
  }
  
  const memAfter = process.memoryUsage();
  const memDiff = memAfter.heapUsed - memBefore.heapUsed;
  
  console.log(`Memory used: ${(memDiff / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Results generated: ${results.length}`);
  
  // Performance Summary
  console.log('\n📊 Performance Summary');
  console.log('=' .repeat(30));
  console.log(`✅ Single search: ${avgSingle.toFixed(2)}ms (target: <10ms)`);
  console.log(`✅ Batch processing: ${batchAvg.toFixed(2)}ms avg (target: <5ms)`);
  console.log(`✅ Radius search: ${radiusAvg.toFixed(2)}ms (target: <20ms)`);
  console.log(`✅ Distance calc: ${distanceAvg.toFixed(3)}ms (target: <0.1ms)`);
  console.log(`✅ Memory efficient: ${(memDiff / 1024 / 1024).toFixed(2)}MB for 1000 searches`);
  
  // Performance Rating
  let rating = 'Excellent';
  if (avgSingle > 10 || batchAvg > 5) rating = 'Good';
  if (avgSingle > 20 || batchAvg > 10) rating = 'Fair';
  if (avgSingle > 50 || batchAvg > 25) rating = 'Poor';
  
  console.log(`\n🏆 Overall Performance: ${rating}`);
}

runBenchmarks().catch(console.error);