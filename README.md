# Sri Lanka Police Stations System

A comprehensive, high-performance JavaScript library for Sri Lankan police station data and geolocation services. Features 200+ police stations with precise coordinates, optimized distance calculations, and multiple search methods.

## 🌟 Features

- **📍 Comprehensive Dataset**: 200+ police stations across all 25 districts
- **🚀 High Performance**: Optimized with bounding box filtering and Haversine calculations
- **🔍 Multiple Search Methods**: Nearest stations, radius search, area search, and name lookup
- **✅ Input Validation**: Comprehensive validation with detailed error messages
- **📊 Performance Monitoring**: Built-in metrics and benchmarking tools
- **🔄 Backward Compatible**: Supports both modern and legacy API signatures
- **📚 Well Documented**: Comprehensive JSDoc documentation and examples

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/Rahal-Sathsara-Senadhira/E-Vigilence-Admin-Panel.git

# Navigate to the project
cd E-Vigilence-Admin-Panel/police

# Install dependencies (if any)
npm install
```

### Basic Usage

```javascript
import { 
  findNearestPoliceStations,
  getPoliceStationsWithinRadius,
  getPoliceStationsByArea 
} from './src/index.js';

// Find 5 nearest stations to Colombo Fort
const nearest = findNearestPoliceStations({
  lat: 6.9333,
  lng: 79.8430,
  limit: 5
});

console.log(nearest);
// Output: Array of 5 nearest police stations with distances
```

## 📖 API Documentation

### Main Functions

#### `findNearestPoliceStations(params)`

Finds the nearest police stations to a given coordinate.

```javascript
// Modern syntax (recommended)
const results = findNearestPoliceStations({
  lat: 6.9271,      // Latitude in degrees
  lng: 79.8612,     // Longitude in degrees  
  limit: 3          // Number of results (optional, default: 3)
});

// Legacy syntax (deprecated but supported)
const results = findNearestPoliceStations(6.9271, 79.8612, 3);
```

#### `getPoliceStationsWithinRadius(params)`

Gets all police stations within a specified radius.

```javascript
const stations = getPoliceStationsWithinRadius({
  lat: 7.2906,
  lng: 80.6337,
  radiusKm: 10      // Radius in kilometers
});
```

#### `getPoliceStationsByArea(area)`

Gets all police stations in a specific area or district.

```javascript
const colomboStations = getPoliceStationsByArea('Colombo');
const kandyStations = getPoliceStationsByArea('Kandy');
```

#### `getPoliceStationByName(name)`

Finds a specific police station by name.

```javascript
const station = getPoliceStationByName('Kandy Police Station');
```

### Utility Functions

#### `calculateDistance(lat1, lng1, lat2, lng2)`

Calculates the great circle distance between two points using the Haversine formula.

```javascript
import { calculateDistance } from './src/index.js';

const distance = calculateDistance(6.9271, 79.8612, 7.2906, 80.6337);
console.log(`Distance: ${distance.toFixed(2)} km`);
```

#### `validateCoordinates(lat, lng, strictSriLanka)`

Validates coordinate values.

```javascript
import { validateCoordinates } from './src/index.js';

const validation = validateCoordinates(6.9271, 79.8612, true);
if (!validation.isValid) {
  console.log('Errors:', validation.errors);
}
```

## 📁 Project Structure

```
police/
├── src/
│   ├── config/
│   │   └── constants.js          # Configuration & validation rules
│   ├── data/
│   │   └── policeStationsData.js # Police stations dataset
│   ├── utils/
│   │   ├── validation.js         # Input validation
│   │   ├── distance.js           # Distance calculations  
│   │   └── performance.js        # Performance monitoring
│   ├── services/
│   │   └── policeStationsService.js # Main search functions
│   └── index.js                  # Main entry point
├── examples/
│   └── usage.js                  # Usage examples
├── package.json
└── README.md
```

## 🎯 Usage Examples

### Example 1: Tourist Police Station Finder

```javascript
// Find nearest police stations for tourists in Galle
const touristSupport = findNearestPoliceStations({
  lat: 6.0329,  // Galle Fort
  lng: 80.2168,
  limit: 3
});

touristSupport.forEach(station => {
  console.log(`${station.name}: ${station.distanceKm}km away`);
});
```

### Example 2: Emergency Services Integration

```javascript
// Emergency response system
function findEmergencyResponse(userLat, userLng) {
  try {
    const nearestStations = findNearestPoliceStations({
      lat: userLat,
      lng: userLng, 
      limit: 1
    });
    
    if (nearestStations.length > 0) {
      const station = nearestStations[0];
      return {
        station: station.name,
        distance: `${station.distanceKm}km`,
        area: station.area,
        coordinates: { lat: station.lat, lng: station.lng }
      };
    }
  } catch (error) {
    console.error('Emergency response lookup failed:', error);
    return null;
  }
}
```

### Example 3: Coverage Analysis

```javascript
// Analyze police coverage in different areas
import { getAllAreas, getPoliceStationsByArea } from './src/index.js';

const areas = getAllAreas();
const coverage = areas.map(area => ({
  area: area,
  stationCount: getPoliceStationsByArea(area).length
})).sort((a, b) => b.stationCount - a.stationCount);

console.table(coverage);
```

## ⚡ Performance Features

### Bounding Box Optimization

The system uses intelligent bounding box filtering to optimize searches:

```javascript
// Instead of calculating distance to all 200+ stations,
// first filter to ~10-20 candidates within a geographic box
// This provides 10-20x performance improvement!

const candidates = getBoundingBoxCandidates(stations, lat, lng);
// Only candidates are processed with expensive Haversine formula
```

### Performance Monitoring

```javascript
import { findNearestPoliceStationsWithMetrics } from './src/utils/performance.js';

const { results, metrics } = findNearestPoliceStationsWithMetrics({
  lat: 6.9271,
  lng: 79.8612,
  limit: 5
});

console.log('Performance:', metrics);
// Output: { executionTime: '2.34ms', resultsCount: 5, searchOptimized: true }
```

### Benchmarking

```javascript
import { runBenchmark } from './src/utils/performance.js';

// Run performance benchmark
const benchmarkResults = runBenchmark(100);
```

## 🔧 Configuration

### Environment Variables

- `NODE_ENV=development` - Enables detailed logging and performance metrics
- `NODE_ENV=production` - Optimized for production use

### Configuration Constants

```javascript
export const CONFIG = {
  EARTH_RADIUS_KM: 6371,                    // Earth's radius
  BOUNDING_BOX_THRESHOLD_DEG: 0.5,          // ~55km radius optimization
  DEFAULT_SEARCH_LIMIT: 3,                  // Default search results
  MAX_SEARCH_LIMIT: 50,                     // Maximum allowed results
  COORDINATE_PRECISION: 4                   // Decimal places
};
```

## 🛡️ Error Handling

The library provides comprehensive error handling:

```javascript
try {
  const results = findNearestPoliceStations({
    lat: 'invalid',  // This will throw an error
    lng: 79.8612
  });
} catch (error) {
  console.error('Search failed:', error.message);
  // Output: "Invalid coordinates: Coordinates must be numbers"
}
```

## 📊 Dataset Information

- **Total Stations**: 200+ police stations
- **Geographic Coverage**: All 25 districts of Sri Lanka  
- **Coordinate System**: WGS84 (EPSG:4326)
- **Data Sources**: Sri Lanka Police official records
- **Last Updated**: January 2026

### Districts Covered

- **Western Province**: Colombo, Gampaha, Kalutara
- **Southern Province**: Galle, Matara, Hambantota  
- **Central Province**: Kandy, Matale, Nuwara Eliya
- **Northern Province**: Jaffna, Kilinochchi, Mannar, Mullaitivu, Vavuniya
- **Eastern Province**: Ampara, Batticaloa, Trincomalee
- **North Western Province**: Kurunegala, Puttalam
- **North Central Province**: Anuradhapura, Polonnaruwa  
- **Uva Province**: Badulla, Monaragala
- **Sabaragamuwa Province**: Ratnapura, Kegalle

## 🚀 Running Examples

```bash
# Run all usage examples
npm run examples

# Run performance benchmark  
npm run benchmark

# Validate dataset integrity
npm run validate
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Repository**: [E-Vigilence Admin Panel](https://github.com/Rahal-Sathsara-Senadhira/E-Vigilence-Admin-Panel)
- **Branch**: `moksha`
- **Issues**: [GitHub Issues](https://github.com/Rahal-Sathsara-Senadhira/E-Vigilence-Admin-Panel/issues)

## ✨ Acknowledgments

- Sri Lanka Police Department for official station data
- OpenStreetMap contributors for geographic verification
- Haversine formula implementation based on geographic standards

---

**Made with ❤️ for Sri Lankan emergency services and location-based applications**