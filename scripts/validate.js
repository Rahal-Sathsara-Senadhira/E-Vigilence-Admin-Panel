#!/usr/bin/env node

/**
 * Validation Script for CI/CD
 * 
 * Validates code syntax and data integrity
 */

import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';

console.log('🔍 Running validation checks...');

// Function to recursively find all JS files
function findJSFiles(dir, filesList = []) {
  const files = readdirSync(dir);
  
  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules and other unwanted directories
      if (!['node_modules', '.git', '.github'].includes(file)) {
        findJSFiles(filePath, filesList);
      }
    } else if (file.endsWith('.js')) {
      filesList.push(filePath);
    }
  }
  
  return filesList;
}

try {
  // 1. Syntax validation
  console.log('📋 Checking JavaScript syntax...');
  const srcDir = resolve('src');
  const jsFiles = findJSFiles(srcDir);
  
  let syntaxErrors = 0;
  for (const file of jsFiles) {
    try {
      execSync(`node --check "${file}"`, { stdio: 'pipe' });
      console.log(`✅ ${file.replace(process.cwd(), '.')}`);
    } catch (error) {
      console.log(`❌ ${file.replace(process.cwd(), '.')}`);
      syntaxErrors++;
    }
  }
  
  if (syntaxErrors > 0) {
    console.log(`❌ Found ${syntaxErrors} syntax errors`);
    process.exit(1);
  }
  
  // 2. Data validation
  console.log('\n🇱🇰 Validating police station data...');
  const { POLICE_STATIONS } = await import('../src/data/policeStationsData.js');
  
  const validStations = POLICE_STATIONS.filter(s => 
    s.lat >= 5.916 && s.lat <= 9.835 && 
    s.lng >= 79.652 && s.lng <= 81.879
  );
  
  console.log(`✅ ${validStations.length}/${POLICE_STATIONS.length} stations have valid Sri Lankan coordinates`);
  
  if (validStations.length !== POLICE_STATIONS.length) {
    console.log('❌ Some stations have invalid coordinates');
    process.exit(1);
  }
  
  // 3. Module imports
  console.log('\n📦 Validating module imports...');
  const { findNearestPoliceStations } = await import('../src/services/policeStationsService.js');
  const testResult = findNearestPoliceStations({
    lat: 6.9271,
    lng: 79.8612,
    limit: 1
  });
  
  console.log(`✅ Core functions working (found ${testResult.length} stations)`);
  
  console.log('\n🎉 All validation checks passed!');
  
} catch (error) {
  console.log('❌ Validation failed:', error.message);
  process.exit(1);
}