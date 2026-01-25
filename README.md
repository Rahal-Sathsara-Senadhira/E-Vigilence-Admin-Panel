# Sri Lanka Police Stations Locator 🚔

[![Unit Tests](https://github.com/YOUR_USERNAME/police/actions/workflows/test.yml/badge.svg)](https://github.com/YOUR_USERNAME/police/actions/workflows/test.yml)
[![Test Coverage](https://github.com/YOUR_USERNAME/police/actions/workflows/coverage.yml/badge.svg)](https://github.com/YOUR_USERNAME/police/actions/workflows/coverage.yml)
[![Code Quality](https://github.com/YOUR_USERNAME/police/actions/workflows/quality.yml/badge.svg)](https://github.com/YOUR_USERNAME/police/actions/workflows/quality.yml)
[![Node.js Version](https://img.shields.io/node/v/sri-lanka-police-stations.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A high-performance Node.js system for finding the nearest police stations in Sri Lanka using precise geolocation calculations.

## 🌟 Features

- **Accurate Distance Calculations**: Uses Haversine formula for precise geographic distances
- **Performance Optimized**: Bounding box pre-filtering for large datasets 
- **Sri Lanka Focused**: Validated coordinates and comprehensive station coverage
- **Multiple Search Methods**: Find by distance, radius, area, or name
- **Legacy Support**: Backward compatible function signatures
- **Comprehensive Testing**: 51 unit tests with 100% core functionality coverage

## 🚀 Quick Start

```javascript
import { findNearestPoliceStations } from './src/index.js';

// Find 5 nearest stations to Colombo
const nearest = findNearestPoliceStations({
  lat: 6.9271, 
  lng: 79.8612, 
  limit: 5
});

console.log('Nearest stations:', nearest);
```

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/police.git
cd police

# Install dependencies (none required - uses Node.js built-ins only)
npm install

# Run tests
npm test
```

## 🧪 Testing

Our comprehensive test suite ensures mathematical accuracy and business logic correctness:

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:distance      # Mathematical accuracy tests
npm run test:service       # Business logic tests

# Run tests with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Test Coverage

- **51 unit tests** covering all core functionality
- **Mathematical precision** validation for distance calculations
- **Geographic boundary** testing for Sri Lankan coordinates  
- **Performance benchmarks** for large dataset operations
- **Error handling** for edge cases and invalid inputs
- **Legacy compatibility** testing

## 📊 API Reference

### Core Functions

#### `findNearestPoliceStations(params)`
Find nearest police stations to coordinates.

```javascript
const stations = findNearestPoliceStations({
  lat: 6.9271,      // Latitude
  lng: 79.8612,     // Longitude  
  limit: 5          // Max results (optional, default: 3)
});
```

#### `getPoliceStationsWithinRadius(params)`
Get all stations within specified radius.

```javascript
const stations = getPoliceStationsWithinRadius({
  lat: 6.9271,
  lng: 79.8612,
  radiusKm: 10     // Search radius in kilometers
});
```

#### `calculateDistance(lat1, lng1, lat2, lng2)`
Calculate precise distance between two coordinates.

```javascript
const distance = calculateDistance(6.9271, 79.8612, 7.2906, 80.6337);
// Returns: ~94.3 km (Colombo to Kandy)
```

## 🏗️ CI/CD Pipeline

This project uses GitHub Actions for automated testing:

- **Multi-Node Testing**: Tests against Node.js 18.x, 20.x, and 22.x
- **Automatic Triggers**: Runs on push to `main`/`moksha` branches and pull requests
- **Quality Checks**: Code syntax validation and dependency verification
- **Coverage Reports**: Automated test coverage analysis

### Workflow Files

- `.github/workflows/test.yml` - Main test suite
- `.github/workflows/coverage.yml` - Test coverage reporting  
- `.github/workflows/quality.yml` - Code quality checks

## 📈 Performance

- **Search Speed**: <100ms for typical queries
- **Dataset Size**: 185+ verified police stations
- **Coverage Area**: All 25 districts of Sri Lanka
- **Optimization**: Bounding box pre-filtering reduces computational overhead

## 🗃️ Data Source

Police station coordinates are compiled from official sources and verified for accuracy. The dataset includes:

- Station names and locations
- District/area classifications  
- Precise WGS84 coordinates
- Regular validation and updates

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Run tests: `npm test`
4. Commit changes: `git commit -m 'Add amazing feature'`
5. Push to branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

All PRs automatically run the test suite. Please ensure:
- All tests pass ✅
- Code follows existing patterns
- New features include tests

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🏆 Status

- ✅ **Core functionality complete**
- ✅ **Comprehensive test suite**
- ✅ **CI/CD pipeline configured**  
- ✅ **Documentation complete**
- ✅ **Performance optimized**

---

**Built with ❤️ for Sri Lanka** 🇱🇰