#!/usr/bin/env node

/**
 * CLI Tool for Random Sri Lankan Location Generation
 * Standalone utility for generating test coordinates
 * @version 1.0.0
 */

import { 
  generateCompleteTestDataset,
  generateRandomSriLankanCoordinates,
  generateCityBasedCoordinates,
  generateTouristLocationCoordinates,
  generateRegionalCoordinates
} from './randomLocationGenerator.js';

import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * CLI Location Generator
 */
class LocationGeneratorCLI {
  constructor() {
    this.args = process.argv.slice(2);
    this.options = this.parseArguments();
  }
  
  /**
   * Parse command line arguments
   */
  parseArguments() {
    const options = {
      type: 'complete',
      count: 20,
      output: null,
      format: 'json',
      includeMetadata: true,
      region: null,
      help: false
    };
    
    for (let i = 0; i < this.args.length; i++) {
      const arg = this.args[i];
      
      switch (arg) {
        case '--help':
        case '-h':
          options.help = true;
          break;
          
        case '--type':
        case '-t':
          options.type = this.args[++i];
          break;
          
        case '--count':
        case '-c':
          options.count = parseInt(this.args[++i]);
          break;
          
        case '--output':
        case '-o':
          options.output = this.args[++i];
          break;
          
        case '--format':
        case '-f':
          options.format = this.args[++i];
          break;
          
        case '--region':
        case '-r':
          options.region = this.args[++i];
          break;
          
        case '--no-metadata':
          options.includeMetadata = false;
          break;
      }
    }
    
    return options;
  }
  
  /**
   * Display help information
   */
  displayHelp() {
    console.log(`
🗺️  Sri Lankan Location Generator CLI

USAGE:
  node locationGeneratorCli.js [options]

OPTIONS:
  -t, --type <type>       Location type (default: complete)
                          • complete    - Full dataset with all types
                          • random      - Random coordinates only
                          • cities      - Major cities only
                          • tourist     - Tourist locations only  
                          • regional    - Region-specific coordinates
                          
  -c, --count <number>    Number of locations to generate (default: 20)
                          
  -o, --output <file>     Output file path (default: console output)
                          
  -f, --format <format>   Output format (default: json)
                          • json        - JSON format
                          • csv         - CSV format
                          • geojson     - GeoJSON format
                          
  -r, --region <region>   Specific region for regional type
                          • WESTERN, CENTRAL, SOUTHERN, NORTHERN,
                          • EASTERN, NORTH_WESTERN, NORTH_CENTRAL,
                          • UVA, SABARAGAMUWA
                          
      --no-metadata       Exclude metadata in output
      
  -h, --help              Display this help message

EXAMPLES:
  # Generate 50 random locations and save to file
  node locationGeneratorCli.js -t random -c 50 -o random_locations.json
  
  # Generate complete dataset with all location types
  node locationGeneratorCli.js -t complete -o test_data.json
  
  # Generate city coordinates in CSV format
  node locationGeneratorCli.js -t cities -f csv -o cities.csv
  
  # Generate tourist locations in GeoJSON format
  node locationGeneratorCli.js -t tourist -f geojson -o tourist_spots.geojson
  
  # Generate regional coordinates for Western Province
  node locationGeneratorCli.js -t regional -r WESTERN -c 10

SUPPORTED REGIONS:
  WESTERN, CENTRAL, SOUTHERN, NORTHERN, EASTERN,
  NORTH_WESTERN, NORTH_CENTRAL, UVA, SABARAGAMUWA
`);
  }
  
  /**
   * Generate locations based on type
   */
  generateLocations() {
    let locations = [];
    let metadata = {};
    
    try {
      switch (this.options.type.toLowerCase()) {
        case 'complete':
          const completeData = generateCompleteTestDataset({
            randomCount: this.options.count,
            regionalCount: Math.max(2, Math.floor(this.options.count / 10)),
            cityCount: Math.max(3, Math.floor(this.options.count / 7)),
            includeTourist: true,
            includeEdgeCases: true
          });
          locations = completeData.all;
          metadata = completeData.metadata;
          break;
          
        case 'random':
          locations = generateRandomSriLankanCoordinates(this.options.count);
          metadata = {
            type: 'random',
            count: locations.length,
            generatedAt: new Date().toISOString()
          };
          break;
          
        case 'cities':
          locations = generateCityBasedCoordinates(this.options.count);
          metadata = {
            type: 'cities',
            count: locations.length,
            generatedAt: new Date().toISOString()
          };
          break;
          
        case 'tourist':
          locations = generateTouristLocationCoordinates(this.options.count);
          metadata = {
            type: 'tourist',
            count: locations.length,
            generatedAt: new Date().toISOString()
          };
          break;
          
        case 'regional':
          if (!this.options.region) {
            throw new Error('Region must be specified for regional type. Use -r option.');
          }
          locations = generateRegionalCoordinates(this.options.region.toUpperCase(), this.options.count);
          metadata = {
            type: 'regional',
            region: this.options.region.toUpperCase(),
            count: locations.length,
            generatedAt: new Date().toISOString()
          };
          break;
          
        default:
          throw new Error(`Unknown location type: ${this.options.type}`);
      }
      
      return { locations, metadata };
      
    } catch (error) {
      console.error(`❌ Error generating locations: ${error.message}`);
      process.exit(1);
    }
  }
  
  /**
   * Format output data
   */
  formatOutput(locations, metadata) {
    switch (this.options.format.toLowerCase()) {
      case 'json':
        const jsonData = this.options.includeMetadata ? 
          { metadata, locations } : 
          locations;
        return JSON.stringify(jsonData, null, 2);
        
      case 'csv':
        let csv = 'id,lat,lng,name,type\\n';
        locations.forEach(loc => {
          csv += `"${loc.id}",${loc.lat},${loc.lng},"${loc.name || 'Unknown'}","${loc.type || 'random'}"\\n`;
        });
        return csv;
        
      case 'geojson':
        const geojson = {
          type: 'FeatureCollection',
          features: locations.map(loc => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [loc.lng, loc.lat]
            },
            properties: {
              id: loc.id,
              name: loc.name || 'Generated Location',
              type: loc.type || 'random'
            }
          }))
        };
        
        if (this.options.includeMetadata) {
          geojson.metadata = metadata;
        }
        
        return JSON.stringify(geojson, null, 2);
        
      default:
        throw new Error(`Unknown format: ${this.options.format}`);
    }
  }
  
  /**
   * Save output to file
   */
  async saveToFile(content, filepath) {
    try {
      await fs.writeFile(filepath, content, 'utf8');
      console.log(`✅ Generated locations saved to: ${filepath}`);
    } catch (error) {
      console.error(`❌ Error saving file: ${error.message}`);
      process.exit(1);
    }
  }
  
  /**
   * Display summary statistics
   */
  displaySummary(locations, metadata) {
    console.log('\\n📊 GENERATION SUMMARY');
    console.log('='.repeat(40));
    console.log(`Type: ${this.options.type}`);
    console.log(`Count: ${locations.length} locations`);
    console.log(`Format: ${this.options.format.toUpperCase()}`);
    
    if (metadata.region) {
      console.log(`Region: ${metadata.region}`);
    }
    
    // Calculate bounds
    if (locations.length > 0) {
      const lats = locations.map(l => l.lat);
      const lngs = locations.map(l => l.lng);
      const bounds = {
        north: Math.max(...lats).toFixed(4),
        south: Math.min(...lats).toFixed(4),
        east: Math.max(...lngs).toFixed(4),
        west: Math.min(...lngs).toFixed(4)
      };
      
      console.log(`Bounds: N${bounds.north}°, S${bounds.south}°, E${bounds.east}°, W${bounds.west}°`);
    }
    
    console.log(`Generated: ${metadata.generatedAt || new Date().toISOString()}`);
    console.log('='.repeat(40));
  }
  
  /**
   * Main execution function
   */
  async run() {
    if (this.options.help) {
      this.displayHelp();
      return;
    }
    
    console.log('🗺️  Sri Lankan Location Generator');
    console.log('-'.repeat(40));
    
    // Generate locations
    const { locations, metadata } = this.generateLocations();
    
    // Format output
    const formattedOutput = this.formatOutput(locations, metadata);
    
    // Save to file or display
    if (this.options.output) {
      await this.saveToFile(formattedOutput, this.options.output);
    } else {
      console.log('\\n📍 GENERATED LOCATIONS:\\n');
      console.log(formattedOutput);
    }
    
    // Display summary
    this.displaySummary(locations, metadata);
  }
}

// Execute CLI
const cli = new LocationGeneratorCLI();
cli.run().catch(error => {
  console.error('💥 CLI execution failed:', error);
  process.exit(1);
});