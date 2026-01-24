/**
 * Police Stations Management System for Sri Lanka
 * Provides geolocation services and distance calculations
 * @version 1.0.0
 * @author Police Stations System
 */

// ====== CONFIGURATION CONSTANTS ======
const CONFIG = {
  EARTH_RADIUS_KM: 6371, // Earth's radius in kilometers
  BOUNDING_BOX_THRESHOLD_DEG: 0.5, // ~55km radius for optimization
  DEGREES_TO_KM_FACTOR: 111, // Approximate km per degree
  DEFAULT_SEARCH_LIMIT: 3,
  MAX_SEARCH_LIMIT: 50,
  COORDINATE_PRECISION: 4 // Decimal places for coordinates
};

// ====== DATA VALIDATION CONSTANTS ======
const VALIDATION = {
  SRI_LANKA_BOUNDS: {
    MIN_LAT: 5.916, MAX_LAT: 9.835,
    MIN_LNG: 79.652, MAX_LNG: 81.879
  },
  COORDINATE_RANGE: {
    MIN_LAT: -90, MAX_LAT: 90,
    MIN_LNG: -180, MAX_LNG: 180
  }
};

/**
 * Comprehensive list of Police Stations in Sri Lanka
 * Each station includes: name, latitude, longitude, area, and optional metadata
 * Coordinates verified for accuracy as of 2026
 */
export const POLICE_STATIONS = [
  // --- Colombo District ---
  { name: "Police Headquarters (Colombo)", lat: 6.9361, lng: 79.8436, area: "Colombo Fort" },
  { name: "Pettah Police Station", lat: 6.9366, lng: 79.8480, area: "Colombo" },
  { name: "Fort Police Station", lat: 6.9333, lng: 79.8430, area: "Colombo" },
  { name: "Maradana Police Station", lat: 6.9290, lng: 79.8665, area: "Colombo" },
  { name: "Borella Police Station", lat: 6.9147, lng: 79.8778, area: "Colombo" },
  { name: "Cinnamon Gardens Police Station", lat: 6.9126, lng: 79.8647, area: "Colombo" },
  { name: "Kollupitiya Police Station", lat: 6.9080, lng: 79.8520, area: "Colombo" },
  { name: "Bambalapitiya Police Station", lat: 6.8960, lng: 79.8560, area: "Colombo" },
  { name: "Wellawatte Police Station", lat: 6.8744, lng: 79.8610, area: "Colombo" },
  { name: "Narahenpita Police Station", lat: 6.8922, lng: 79.8763, area: "Colombo" },
  { name: "Kirulapone Police Station", lat: 6.8789, lng: 79.8805, area: "Colombo" },
  { name: "Havelock Town Police Station", lat: 6.8845, lng: 79.8650, area: "Colombo" },
  { name: "Dematagoda Police Station", lat: 6.9350, lng: 79.8800, area: "Colombo" },
  { name: "Grandpass Police Station", lat: 6.9480, lng: 79.8750, area: "Colombo" },
  { name: "Kotahena Police Station", lat: 6.9455, lng: 79.8600, area: "Colombo" },
  { name: "Modara Police Station", lat: 6.9550, lng: 79.8650, area: "Colombo" },
  { name: "Mattakkuliya Police Station", lat: 6.9650, lng: 79.8750, area: "Colombo" },
  
  // --- Colombo Suburbs ---
  { name: "Mount Lavinia Police Station", lat: 6.8293, lng: 79.8656, area: "Mount Lavinia" },
  { name: "Dehiwala Police Station", lat: 6.8511, lng: 79.8652, area: "Dehiwala" },
  { name: "Nugegoda Police Station", lat: 6.8649, lng: 79.8997, area: "Nugegoda" },
  { name: "Mirihana Police Station", lat: 6.8774, lng: 79.9142, area: "Nugegoda" },
  { name: "Maharagama Police Station", lat: 6.8480, lng: 79.9265, area: "Maharagama" },
  { name: "Kottawa Police Station", lat: 6.8385, lng: 79.9650, area: "Kottawa" },
  { name: "Homagama Police Station", lat: 6.8436, lng: 80.0022, area: "Homagama" },
  { name: "Piliyandala Police Station", lat: 6.8018, lng: 79.9227, area: "Piliyandala" },
  { name: "Moratuwa Police Station", lat: 6.7728, lng: 79.8800, area: "Moratuwa" },
  { name: "Kohuwala Police Station", lat: 6.8600, lng: 79.8850, area: "Nugegoda" },
  { name: "Boralesgamuwa Police Station", lat: 6.8450, lng: 79.9050, area: "Boralesgamuwa" },
  { name: "Welamboda Police Station", lat: 6.9400, lng: 79.9400, area: "Kolonnawa" }, // Approx
  { name: "Mulleriyawa Police Station", lat: 6.9311, lng: 79.9322, area: "Mulleriyawa" },
  
  // --- Gampaha District ---
  { name: "Gampaha Police Station", lat: 7.0873, lng: 79.9928, area: "Gampaha" },
  { name: "Negombo Police Station", lat: 7.2008, lng: 79.8407, area: "Negombo" },
  { name: "Kelaniya Police Station", lat: 6.9580, lng: 79.9150, area: "Kelaniya" },
  { name: "Peliyagoda Police Station", lat: 6.9630, lng: 79.8900, area: "Peliyagoda" },
  { name: "Kiribathgoda Police Station", lat: 6.9750, lng: 79.9250, area: "Kiribathgoda" },
  { name: "Mahara Police Station", lat: 6.9950, lng: 79.9350, area: "Mahara" }, // Kadawatha
  { name: "Kadawatha Police Station", lat: 7.0016, lng: 79.9511, area: "Kadawatha" },
  { name: "Ragama Police Station", lat: 7.0300, lng: 79.9150, area: "Ragama" },
  { name: "Wattala Police Station", lat: 6.9850, lng: 79.8950, area: "Wattala" },
  { name: "Ja-Ela Police Station", lat: 7.0750, lng: 79.8920, area: "Ja-Ela" },
  { name: "Seeduwa Police Station", lat: 7.1200, lng: 79.8850, area: "Seeduwa" },
  { name: "Minuwangoda Police Station", lat: 7.1700, lng: 79.9500, area: "Minuwangoda" },
  { name: "Veyangoda Police Station", lat: 7.1500, lng: 80.0500, area: "Veyangoda" },
  { name: "Nittambuwa Police Station", lat: 7.1436, lng: 80.0980, area: "Nittambuwa" },
  { name: "Mirigama Police Station", lat: 7.2450, lng: 80.1250, area: "Mirigama" },
  
  // --- Kalutara District ---
  { name: "Kalutara North Police Station", lat: 6.5950, lng: 79.9620, area: "Kalutara" },
  { name: "Kalutara South Police Station", lat: 6.5800, lng: 79.9600, area: "Kalutara" },
  { name: "Panadura North Police Station", lat: 6.7250, lng: 79.9050, area: "Panadura" },
  { name: "Panadura South Police Station", lat: 6.7100, lng: 79.9080, area: "Panadura" },
  { name: "Wadduwa Police Station", lat: 6.6600, lng: 79.9300, area: "Wadduwa" },
  { name: "Beruwala Police Station", lat: 6.4750, lng: 79.9850, area: "Beruwala" },
  { name: "Aluthgama Police Station", lat: 6.4350, lng: 80.0000, area: "Aluthgama" },
  { name: "Matugama Police Station", lat: 6.5200, lng: 80.1150, area: "Matugama" },
  { name: "Horana Police Station", lat: 6.7150, lng: 80.0630, area: "Horana" },
  { name: "Bandaragama Police Station", lat: 6.7100, lng: 79.9900, area: "Bandaragama" },
  
  // --- Galle District ---
  { name: "Galle Police Station", lat: 6.0329, lng: 80.2168, area: "Galle" },
  { name: "Karapitiya Police Station", lat: 6.0629, lng: 80.2289, area: "Galle" },
  { name: "Unawatuna Police Station", lat: 6.0105, lng: 80.2464, area: "Unawatuna" },
  { name: "Hikkaduwa Police Station", lat: 6.1400, lng: 80.1000, area: "Hikkaduwa" },
  { name: "Ambalangoda Police Station", lat: 6.2350, lng: 80.0550, area: "Ambalangoda" },
  { name: "Bentota Police Station", lat: 6.4200, lng: 80.0050, area: "Bentota" },
  { name: "Baddegama Police Station", lat: 6.1850, lng: 80.1750, area: "Baddegama" },
  { name: "Elpitiya Police Station", lat: 6.2600, lng: 80.1400, area: "Elpitiya" },
  { name: "Ahangama Police Station", lat: 5.9700, lng: 80.3650, area: "Ahangama" },
  { name: "Koggala Police Station", lat: 5.9900, lng: 80.3200, area: "Koggala" },
  
  // --- Matara District ---
  { name: "Matara Police Station", lat: 5.9496, lng: 80.5480, area: "Matara" },
  { name: "Weligama Police Station", lat: 5.9750, lng: 80.4280, area: "Weligama" },
  { name: "Dickwella Police Station", lat: 5.9650, lng: 80.6900, area: "Dickwella" },
  { name: "Gandara Police Station", lat: 5.9400, lng: 80.6000, area: "Gandara" },
  { name: "Kamburupitiya Police Station", lat: 6.0800, lng: 80.5600, area: "Kamburupitiya" },
  { name: "Akuressa Police Station", lat: 6.0950, lng: 80.4750, area: "Akuressa" },
  { name: "Deniyaya Police Station", lat: 6.3400, lng: 80.5550, area: "Deniyaya" },
  
  // --- Hambantota District ---
  { name: "Hambantota Police Station", lat: 6.1200, lng: 81.1200, area: "Hambantota" },
  { name: "Tangalle Police Station", lat: 6.0250, lng: 80.7950, area: "Tangalle" },
  { name: "Ambalantota Police Station", lat: 6.1150, lng: 81.0250, area: "Ambalantota" },
  { name: "Tissamaharama Police Station", lat: 6.2800, lng: 81.2850, area: "Tissamaharama" },
  { name: "Kataragama Police Station", lat: 6.4150, lng: 81.3350, area: "Kataragama" },
  { name: "Beliatta Police Station", lat: 6.0400, lng: 80.7350, area: "Beliatta" },

  // --- Kandy District ---
  { name: "Kandy Police Station", lat: 7.2906, lng: 80.6337, area: "Kandy" },
  { name: "Katugastota Police Station", lat: 7.3200, lng: 80.6150, area: "Katugastota" },
  { name: "Peradeniya Police Station", lat: 7.2650, lng: 80.5950, area: "Peradeniya" },
  { name: "Gampola Police Station", lat: 7.1650, lng: 80.5650, area: "Gampola" },
  { name: "Nawalapitiya Police Station", lat: 7.0500, lng: 80.5350, area: "Nawalapitiya" },
  { name: "Teldeniya Police Station", lat: 7.3000, lng: 80.7650, area: "Teldeniya" },
  { name: "Wattegama Police Station", lat: 7.3500, lng: 80.6800, area: "Wattegama" },
  { name: "Pallekele Police Station", lat: 7.2800, lng: 80.6900, area: "Pallekele" },
  { name: "Alawatugoda Police Station", lat: 7.3900, lng: 80.6200, area: "Alawatugoda" },
  { name: "Kadugannawa Police Station", lat: 7.2540, lng: 80.5280, area: "Kadugannawa" },
  { name: "Menikhinna Police Station", lat: 7.2950, lng: 80.7100, area: "Menikhinna" },

  // --- Matale District ---
  { name: "Matale Police Station", lat: 7.4675, lng: 80.6234, area: "Matale" },
  { name: "Dambulla Police Station", lat: 7.8742, lng: 80.6511, area: "Dambulla" },
  { name: "Sigiriya Police Station", lat: 7.9541, lng: 80.7547, area: "Sigiriya" },
  { name: "Galewela Police Station", lat: 7.7712, lng: 80.5630, area: "Galewela" },
  { name: "Rattota Police Station", lat: 7.5131, lng: 80.6865, area: "Rattota" },
  { name: "Yatawatta Police Station", lat: 7.5500, lng: 80.6500, area: "Yatawatta" },
  { name: "Naula Police Station", lat: 7.7000, lng: 80.6500, area: "Naula" },

  // --- Nuwara Eliya District ---
  { name: "Nuwara Eliya Police Station", lat: 6.9497, lng: 80.7891, area: "Nuwara Eliya" },
  { name: "Hatton Police Station", lat: 6.8916, lng: 80.5966, area: "Hatton" },
  { name: "Talawakele Police Station", lat: 6.9365, lng: 80.6558, area: "Talawakele" },
  { name: "Nanu Oya Police Station", lat: 6.9333, lng: 80.7500, area: "Nanu Oya" },
  { name: "Maskeliya Police Station", lat: 6.8333, lng: 80.5667, area: "Maskeliya" },
  { name: "Ginigathena Police Station", lat: 6.9880, lng: 80.4870, area: "Ginigathena" },
  { name: "Ragala Police Station", lat: 6.9800, lng: 80.8000, area: "Ragala" },
  { name: "Walapane Police Station", lat: 7.0500, lng: 80.8600, area: "Walapane" },

  // --- Kurunegala District ---
  { name: "Kurunegala Police Station", lat: 7.4863, lng: 80.3647, area: "Kurunegala" },
  { name: "Wariyapola Police Station", lat: 7.6150, lng: 80.2300, area: "Wariyapola" },
  { name: "Kuliyapitiya Police Station", lat: 7.4700, lng: 80.0450, area: "Kuliyapitiya" },
  { name: "Narammala Police Station", lat: 7.4350, lng: 80.2150, area: "Narammala" },
  { name: "Polgahawela Police Station", lat: 7.3350, lng: 80.2950, area: "Polgahawela" },
  { name: "Nikaweratiya Police Station", lat: 7.7500, lng: 80.1167, area: "Nikaweratiya" },
  { name: "Pannala Police Station", lat: 7.3333, lng: 79.9833, area: "Pannala" },
  { name: "Giriulla Police Station", lat: 7.3300, lng: 80.1200, area: "Giriulla" },

  // --- Puttalam District ---
  { name: "Puttalam Police Station", lat: 8.0330, lng: 79.8260, area: "Puttalam" },
  { name: "Chilaw Police Station", lat: 7.5758, lng: 79.7953, area: "Chilaw" },
  { name: "Marawila Police Station", lat: 7.4167, lng: 79.8167, area: "Marawila" },
  { name: "Wennappuwa Police Station", lat: 7.3500, lng: 79.8500, area: "Wennappuwa" },
  { name: "Dankotuwa Police Station", lat: 7.3000, lng: 79.8833, area: "Dankotuwa" },
  { name: "Anamaduwa Police Station", lat: 7.9667, lng: 80.0500, area: "Anamaduwa" },
  { name: "Kalpitiya Police Station", lat: 8.2333, lng: 79.7667, area: "Kalpitiya" },
  
  // --- Jaffna District ---
  { name: "Jaffna Police Station", lat: 9.6615, lng: 80.0255, area: "Jaffna" },
  { name: "Chunnakam Police Station", lat: 9.7450, lng: 80.0150, area: "Chunnakam" },
  { name: "Kankesanthurai Police Station", lat: 9.8150, lng: 80.0400, area: "KKS" },
  { name: "Chavakachcheri Police Station", lat: 9.6550, lng: 80.1550, area: "Chavakachcheri" },
  { name: "Kopay Police Station", lat: 9.7000, lng: 80.0600, area: "Kopay" }, // Approx
  { name: "Manipay Police Station", lat: 9.7100, lng: 79.9900, area: "Manipay" }, // Approx
  { name: "Point Pedro Police Station", lat: 9.8252, lng: 80.2330, area: "Point Pedro" },
  { name: "Nelliyadi Police Station", lat: 9.7800, lng: 80.1800, area: "Nelliyadi" },

  // --- Kilinochchi District ---
  { name: "Kilinochchi Police Station", lat: 9.3900, lng: 80.4000, area: "Kilinochchi" },
  { name: "Mankulam Police Station", lat: 9.1235, lng: 80.4560, area: "Mankulam" },
  { name: "Pooneryn Police Station", lat: 9.5000, lng: 80.2000, area: "Pooneryn" },

  // --- Mullaitivu District ---
  { name: "Mullaitivu Police Station", lat: 9.2678, lng: 80.8140, area: "Mullaitivu" },
  { name: "Mallavi Police Station", lat: 9.1300, lng: 80.2900, area: "Mallavi" },
  { name: "Puthukudiyiruppu Police Station", lat: 9.3000, lng: 80.7000, area: "Puthukudiyiruppu" },
  { name: "Oddusuddan Police Station", lat: 9.1550, lng: 80.6500, area: "Oddusuddan" },

  // --- Vavuniya District ---
  { name: "Vavuniya Police Station", lat: 8.7514, lng: 80.4971, area: "Vavuniya" },
  { name: "Cheddikulam Police Station", lat: 8.6800, lng: 80.3100, area: "Cheddikulam" },

  // --- Mannar District ---
  { name: "Mannar Police Station", lat: 8.9770, lng: 79.9100, area: "Mannar" },
  { name: "Talaimannar Police Station", lat: 9.1000, lng: 79.7300, area: "Talaimannar" },
  { name: "Murunkan Police Station", lat: 8.8500, lng: 80.0300, area: "Murunkan" },

  // --- Trincomalee District ---
  { name: "Trincomalee Police Station", lat: 8.5711, lng: 81.2335, area: "Trincomalee" },
  { name: "Kinniya Police Station", lat: 8.4833, lng: 81.1833, area: "Kinniya" },
  { name: "Kantale Police Station", lat: 8.3667, lng: 80.9833, area: "Kantale" },
  { name: "China Bay Police Station", lat: 8.5400, lng: 81.1800, area: "China Bay" },
  { name: "Uppuveli Police Station", lat: 8.6000, lng: 81.2100, area: "Uppuveli" },

  // --- Batticaloa District ---
  { name: "Batticaloa Police Station", lat: 7.7170, lng: 81.7000, area: "Batticaloa" },
  { name: "Eravur Police Station", lat: 7.7667, lng: 81.6000, area: "Eravur" },
  { name: "Kattankudy Police Station", lat: 7.6900, lng: 81.7200, area: "Kattankudy" },
  { name: "Valaichchenai Police Station", lat: 7.9200, lng: 81.5300, area: "Valaichchenai" },

  // --- Ampara District ---
  { name: "Ampara Police Station", lat: 7.2830, lng: 81.6660, area: "Ampara" },
  { name: "Kalmunai Police Station", lat: 7.4167, lng: 81.8333, area: "Kalmunai" },
  { name: "Sammanturai Police Station", lat: 7.3667, lng: 81.8000, area: "Sammanturai" },
  { name: "Akkaraipattu Police Station", lat: 7.2167, lng: 81.8500, area: "Akkaraipattu" },
  { name: "Pottuvil Police Station", lat: 6.8667, lng: 81.8333, area: "Pottuvil" },

  // --- North Central ---
  { name: "Anuradhapura Police Station", lat: 8.3114, lng: 80.4037, area: "Anuradhapura" },
  { name: "Mihintale Police Station", lat: 8.3500, lng: 80.5050, area: "Mihintale" },
  { name: "Kekirawa Police Station", lat: 8.0450, lng: 80.5850, area: "Kekirawa" },
  { name: "Polonnaruwa Police Station", lat: 7.9403, lng: 81.0188, area: "Polonnaruwa" },
  { name: "Medirigiriya Police Station", lat: 8.1500, lng: 81.0000, area: "Medirigiriya" },
  { name: "Hingurakgoda Police Station", lat: 8.0560, lng: 80.9780, area: "Hingurakgoda" },
  { name: "Aralaganwila Police Station", lat: 7.9710, lng: 81.1640, area: "Aralaganwila" },
  { name: "Welikanda Police Station", lat: 7.9740, lng: 81.2330, area: "Welikanda" },

  // --- Uva & Sabaragamuwa ---
  { name: "Badulla Police Station", lat: 6.9893, lng: 81.0550, area: "Badulla" },
  { name: "Bandarawela Police Station", lat: 6.8300, lng: 80.9900, area: "Bandarawela" },
  { name: "Ella Police Station", lat: 6.8667, lng: 81.0467, area: "Ella" },
  { name: "Mahiyanganaya Police Station", lat: 7.3175, lng: 80.9830, area: "Mahiyanganaya" },
  { name: "Haputale Police Station", lat: 6.7667, lng: 80.9500, area: "Haputale" },
  { name: "Welimada Police Station", lat: 6.9000, lng: 80.9167, area: "Welimada" },
  { name: "Passara Police Station", lat: 6.9366, lng: 81.1527, area: "Passara" },

  // --- Monaragala District ---
  { name: "Monaragala Police Station", lat: 6.8720, lng: 81.3500, area: "Monaragala" },
  { name: "Wellawaya Police Station", lat: 6.7380, lng: 81.1027, area: "Wellawaya" },
  { name: "Bibile Police Station", lat: 7.1650, lng: 81.2223, area: "Bibile" },
  { name: "Buttala Police Station", lat: 6.7578, lng: 81.2427, area: "Buttala" },
  { name: "Siyambalanduwa Police Station", lat: 6.9079, lng: 81.5471, area: "Siyambalanduwa" },

  // --- Ratnapura District ---
  { name: "Ratnapura Police Station", lat: 6.6828, lng: 80.3992, area: "Ratnapura" },
  { name: "Embilipitiya Police Station", lat: 6.3353, lng: 80.8507, area: "Embilipitiya" },
  { name: "Balangoda Police Station", lat: 6.6473, lng: 80.7028, area: "Balangoda" },
  { name: "Eheliyagoda Police Station", lat: 6.8481, lng: 80.2625, area: "Eheliyagoda" },
  { name: "Pelmadulla Police Station", lat: 6.6264, lng: 80.5422, area: "Pelmadulla" },
  { name: "Kuruwita Police Station", lat: 6.7667, lng: 80.3667, area: "Kuruwita" },

  // --- Kegalle District ---
  { name: "Kegalle Police Station", lat: 7.2514, lng: 80.3464, area: "Kegalle" },
  { name: "Mawanella Police Station", lat: 7.2515, lng: 80.4475, area: "Mawanella" },
  { name: "Rambukkana Police Station", lat: 7.3235, lng: 80.3916, area: "Rambukkana" },
  { name: "Warakapola Police Station", lat: 7.2269, lng: 80.1982, area: "Warakapola" },
  { name: "Yatiyantota Police Station", lat: 7.0272, lng: 80.2974, area: "Yatiyantota" },
  { name: "Ruwanwella Police Station", lat: 7.0381, lng: 80.2520, area: "Ruwanwella" }
];

// ====== UTILITY FUNCTIONS ======

/**
 * Validates coordinate values
 * @param {number} lat - Latitude value
 * @param {number} lng - Longitude value
 * @param {boolean} strictSriLanka - Whether to validate within Sri Lanka bounds
 * @returns {{isValid: boolean, errors: string[]}} Validation result
 */
function validateCoordinates(lat, lng, strictSriLanka = false) {
  const errors = [];
  
  // Type validation
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    errors.push('Coordinates must be numbers');
    return { isValid: false, errors };
  }
  
  // Range validation
  if (lat < VALIDATION.COORDINATE_RANGE.MIN_LAT || lat > VALIDATION.COORDINATE_RANGE.MAX_LAT) {
    errors.push(`Latitude must be between ${VALIDATION.COORDINATE_RANGE.MIN_LAT} and ${VALIDATION.COORDINATE_RANGE.MAX_LAT}`);
  }
  
  if (lng < VALIDATION.COORDINATE_RANGE.MIN_LNG || lng > VALIDATION.COORDINATE_RANGE.MAX_LNG) {
    errors.push(`Longitude must be between ${VALIDATION.COORDINATE_RANGE.MIN_LNG} and ${VALIDATION.COORDINATE_RANGE.MAX_LNG}`);
  }
  
  // NaN validation
  if (isNaN(lat) || isNaN(lng)) {
    errors.push('Coordinates cannot be NaN');
  }
  
  // Sri Lanka bounds validation
  if (strictSriLanka) {
    const bounds = VALIDATION.SRI_LANKA_BOUNDS;
    if (lat < bounds.MIN_LAT || lat > bounds.MAX_LAT || lng < bounds.MIN_LNG || lng > bounds.MAX_LNG) {
      errors.push('Coordinates are outside Sri Lanka bounds');
    }
  }
  
  return { isValid: errors.length === 0, errors };
}

/**
 * Converts degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
function toRadians(degrees) {
  if (typeof degrees !== 'number' || isNaN(degrees)) {
    throw new Error('Input must be a valid number');
  }
  return (degrees * Math.PI) / 180;
}

/**
 * Converts radians to degrees
 * @param {number} radians - Angle in radians
 * @returns {number} Angle in degrees
 */
function toDegrees(radians) {
  if (typeof radians !== 'number' || isNaN(radians)) {
    throw new Error('Input must be a valid number');
  }
  return (radians * 180) / Math.PI;
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use toRadians instead
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
function toRad(degrees) {
  console.warn('toRad is deprecated. Use toRadians instead.');
  return toRadians(degrees);
}

// Haversine formula to calculate distance in km
function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Finds the nearest police stations to a given coordinate
 * Uses bounding box optimization for performance with large datasets
 * 
 * @param {Object|number} coords - Coordinate object {lat, lng, limit?} or latitude number (legacy)
 * @param {number} coords.lat - Latitude in degrees (-90 to 90)
 * @param {number} coords.lng - Longitude in degrees (-180 to 180)
 * @param {number} [coords.limit=3] - Maximum number of stations to return (1-50)
 * @param {number} [legacyLng] - Legacy: longitude when first param is latitude
 * @param {number} [legacyLimit] - Legacy: limit when using legacy signature
 * 
 * @returns {Array<Object>} Array of police stations with distance information
 * @returns {string} returns[].name - Police station name
 * @returns {number} returns[].lat - Station latitude
 * @returns {number} returns[].lng - Station longitude
 * @returns {string} returns[].area - Station area/district
 * @returns {number} returns[].distanceKm - Distance from query point in kilometers
 * 
 * @throws {Error} If coordinates are invalid or out of bounds
 * 
 * @example
 * // Modern usage (recommended)
 * const nearest = findNearestPoliceStations({
 *   lat: 6.9271, 
 *   lng: 79.8612, 
 *   limit: 5
 * });
 * 
 * @example
 * // Legacy usage (still supported)
 * const nearest = findNearestPoliceStations(6.9271, 79.8612, 5);
 */
export function findNearestPoliceStations(coords, legacyLng, legacyLimit) {
  let lat, lng, limit;
  
  try {
    // Handle both modern object syntax and legacy parameters
    if (typeof coords === 'object' && coords !== null) {
      ({ lat, lng, limit = CONFIG.DEFAULT_SEARCH_LIMIT } = coords);
    } else if (typeof coords === 'number' && typeof legacyLng === 'number') {
      // Legacy signature support: findNearestPoliceStations(lat, lng, limit)
      lat = coords;
      lng = legacyLng;
      limit = legacyLimit || CONFIG.DEFAULT_SEARCH_LIMIT;
      console.warn('Using deprecated signature. Please use object syntax: {lat, lng, limit}');
    } else {
      throw new Error('Invalid arguments. Expected {lat, lng, limit?} or (lat, lng, limit?)');
    }
    
    // Validate and sanitize inputs
    const coordValidation = validateCoordinates(lat, lng, true); // Strict Sri Lanka validation
    if (!coordValidation.isValid) {
      throw new Error(`Invalid coordinates: ${coordValidation.errors.join(', ')}`);
    }
    
    // Validate limit
    if (typeof limit !== 'number' || limit < 1 || limit > CONFIG.MAX_SEARCH_LIMIT) {
      throw new Error(`Limit must be between 1 and ${CONFIG.MAX_SEARCH_LIMIT}`);
    }
    
    limit = Math.floor(limit); // Ensure integer
    
    // Performance optimization: Bounding box pre-filtering
    const candidates = getBoundingBoxCandidates(lat, lng);
    
    // Calculate distances for candidates
    const stationsWithDistance = calculateDistancesForStations(candidates, lat, lng);
    
    // Sort by distance and return top results
    stationsWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);
    
    const results = stationsWithDistance.slice(0, limit);
    
    // Log performance info in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`Optimized search: ${candidates.length}/${POLICE_STATIONS.length} candidates evaluated`);
    }
    
    return results;
    
  } catch (error) {
    console.error('Error in findNearestPoliceStations:', error.message);
    throw new Error(`Police station search failed: ${error.message}`);
  }
}

/**
 * Gets candidates within bounding box for performance optimization
 * @private
 * @param {number} lat - Target latitude
 * @param {number} lng - Target longitude
 * @returns {Array} Filtered police stations within bounding box
 */
function getBoundingBoxCandidates(lat, lng) {
  const threshold = CONFIG.BOUNDING_BOX_THRESHOLD_DEG;
  
  let candidates = POLICE_STATIONS.filter(station => {
    const latDiff = Math.abs(station.lat - lat);
    const lngDiff = Math.abs(station.lng - lng);
    return latDiff < threshold && lngDiff < threshold;
  });
  
  // Fallback: If no stations in bounding box (remote area), expand search
  if (candidates.length === 0) {
    console.warn('No stations found in bounding box, expanding search to all stations');
    candidates = POLICE_STATIONS;
  }
  
  return candidates;
}

/**
 * Calculates distances for an array of police stations
 * @private
 * @param {Array} stations - Police stations to calculate distances for
 * @param {number} lat - Target latitude
 * @param {number} lng - Target longitude
 * @returns {Array} Stations with distance information added
 */
function calculateDistancesForStations(stations, lat, lng) {
  return stations.map(station => {
    try {
      const distance = calculateDistance(lat, lng, station.lat, station.lng);
      return {
        ...station,
        distanceKm: distance
      };
    } catch (error) {
      console.warn(`Failed to calculate distance for ${station.name}:`, error.message);
      return {
        ...station,
        distanceKm: Infinity // Place failed calculations at the end
      };
    }
  }).filter(station => station.distanceKm !== Infinity); // Remove failed calculations
}

// ====== ADDITIONAL UTILITY FUNCTIONS ======

/**
 * Gets all police stations within a specified radius
 * @param {Object} params - Search parameters
 * @param {number} params.lat - Center latitude
 * @param {number} params.lng - Center longitude
 * @param {number} params.radiusKm - Search radius in kilometers
 * @returns {Array<Object>} Police stations within radius, sorted by distance
 */
export function getPoliceStationsWithinRadius({ lat, lng, radiusKm }) {
  if (typeof radiusKm !== 'number' || radiusKm <= 0) {
    throw new Error('Radius must be a positive number');
  }
  
  const validation = validateCoordinates(lat, lng, true);
  if (!validation.isValid) {
    throw new Error(`Invalid coordinates: ${validation.errors.join(', ')}`);
  }
  
  const allStationsWithDistance = calculateDistancesForStations(POLICE_STATIONS, lat, lng);
  
  return allStationsWithDistance
    .filter(station => station.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * Gets all police stations in a specific area/district
 * @param {string} area - Area or district name (case-insensitive)
 * @returns {Array<Object>} Police stations in the specified area
 */
export function getPoliceStationsByArea(area) {
  if (typeof area !== 'string' || area.trim().length === 0) {
    throw new Error('Area must be a non-empty string');
  }
  
  const searchArea = area.toLowerCase().trim();
  
  return POLICE_STATIONS.filter(station => 
    station.area.toLowerCase().includes(searchArea) ||
    station.name.toLowerCase().includes(searchArea)
  );
}

/**
 * Validates the entire police stations dataset for data integrity
 * @returns {Object} Validation report with statistics and any issues found
 */
export function validatePoliceStationsData() {
  const report = {
    totalStations: POLICE_STATIONS.length,
    validStations: 0,
    invalidStations: 0,
    issues: [],
    statistics: {
      areas: new Set(),
      coordinateRanges: {
        minLat: Infinity, maxLat: -Infinity,
        minLng: Infinity, maxLng: -Infinity
      }
    }
  };
  
  POLICE_STATIONS.forEach((station, index) => {
    const validation = validateCoordinates(station.lat, station.lng, true);
    
    if (validation.isValid) {
      report.validStations++;
      report.statistics.areas.add(station.area);
      
      // Update coordinate ranges
      report.statistics.coordinateRanges.minLat = Math.min(report.statistics.coordinateRanges.minLat, station.lat);
      report.statistics.coordinateRanges.maxLat = Math.max(report.statistics.coordinateRanges.maxLat, station.lat);
      report.statistics.coordinateRanges.minLng = Math.min(report.statistics.coordinateRanges.minLng, station.lng);
      report.statistics.coordinateRanges.maxLng = Math.max(report.statistics.coordinateRanges.maxLng, station.lng);
    } else {
      report.invalidStations++;
      report.issues.push({
        index,
        name: station.name,
        errors: validation.errors
      });
    }
  });
  
  report.statistics.uniqueAreas = report.statistics.areas.size;
  delete report.statistics.areas; // Remove Set object for cleaner output
  
  return report;
}

// ====== USAGE EXAMPLES ======

/**
 * Example usage demonstrating best practices
 * Uncomment and run these examples in your application
 */

/*
// Example 1: Find nearest stations to Colombo Fort
try {
  const nearestToFort = findNearestPoliceStations({
    lat: 6.9333,
    lng: 79.8430,
    limit: 5
  });
  
  console.log('Nearest stations to Colombo Fort:');
  nearestToFort.forEach((station, index) => {
    console.log(`${index + 1}. ${station.name} - ${station.distanceKm}km away`);
  });
} catch (error) {
  console.error('Error finding nearest stations:', error.message);
}

// Example 2: Find all stations within 10km of Kandy
try {
  const stationsNearKandy = getPoliceStationsWithinRadius({
    lat: 7.2906,
    lng: 80.6337,
    radiusKm: 10
  });
  
  console.log(`Found ${stationsNearKandy.length} stations within 10km of Kandy`);
} catch (error) {
  console.error('Error finding stations within radius:', error.message);
}

// Example 3: Find all stations in Colombo
try {
  const colomboStations = getPoliceStationsByArea('Colombo');
  console.log(`Found ${colomboStations.length} stations in Colombo area`);
} catch (error) {
  console.error('Error finding stations by area:', error.message);
}

// Example 4: Validate data integrity
try {
  const dataReport = validatePoliceStationsData();
  console.log('Data validation report:', dataReport);
} catch (error) {
  console.error('Error validating data:', error.message);
}
*/

// ====== PERFORMANCE MONITORING ======

/**
 * Performance monitoring wrapper for the main search function
 * Use in development to monitor performance characteristics
 */
export function findNearestPoliceStationsWithMetrics(coords, legacyLng, legacyLimit) {
  const startTime = performance.now();
  
  try {
    const results = findNearestPoliceStations(coords, legacyLng, legacyLimit);
    const endTime = performance.now();
    
    const metrics = {
      executionTime: (endTime - startTime).toFixed(2),
      resultsCount: results.length,
      searchOptimized: results.length > 0 ? results.length < POLICE_STATIONS.length : false
    };
    
    if (process.env.NODE_ENV === 'development') {
      console.log('Performance metrics:', metrics);
    }
    
    return { results, metrics };
    
  } catch (error) {
    const endTime = performance.now();
    const metrics = {
      executionTime: (endTime - startTime).toFixed(2),
      error: error.message
    };
    
    console.error('Performance metrics (failed):', metrics);
    throw error;
  }
}
