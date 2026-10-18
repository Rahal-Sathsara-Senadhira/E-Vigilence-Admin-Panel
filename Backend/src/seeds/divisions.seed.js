// The 45 territorial police divisions of Sri Lanka Police, with their range
// and province, as listed in the Sri Lanka Police Performance Report 2024
// ("Structure of Territorial Police Divisions", as at 31.12.2024), tabled in
// Parliament. Crime / traffic / fraud divisions on the same chart are
// functional units, not territorial ones, and are deliberately left out.
//
// `anchor` is an approximate town-centre coordinate for the division's
// headquarters town. It is used only to *suggest* a division for an
// imported station in the verification queue — never to assign one.

const d = (name, range, province, lat, lng) => ({ name, range, province, anchor: { lat, lng } });

export const DIVISIONS = [
  // Western
  d("Colombo North", "Colombo Range", "Western", 6.947, 79.862),
  d("Colombo South", "Colombo Range", "Western", 6.89, 79.856),
  d("Colombo Central", "Colombo Range", "Western", 6.929, 79.866),
  d("Nugegoda", "Western Province (South) Range", "Western", 6.865, 79.899),
  d("Mt. Lavinia", "Western Province (South) Range", "Western", 6.83, 79.865),
  d("Gampaha", "Western Province (North) Range", "Western", 7.091, 79.999),
  d("Kelaniya", "Western Province (North) Range", "Western", 6.955, 79.922),
  d("Negombo", "Western Province (North) Range", "Western", 7.209, 79.838),
  d("Kalutara", "Kalutara Range", "Western", 6.585, 79.96),
  d("Panadura", "Kalutara Range", "Western", 6.713, 79.904),

  // Central
  d("Kandy", "Kandy & Matale Range", "Central", 7.29, 80.633),
  d("Gampola", "Kandy & Matale Range", "Central", 7.164, 80.574),
  d("Theldeniya", "Kandy & Matale Range", "Central", 7.3, 80.765),
  d("Matale", "Kandy & Matale Range", "Central", 7.467, 80.623),
  d("Nuwara Eliya", "Nuwara Eliya Range", "Central", 6.97, 80.783),
  d("Hatton", "Nuwara Eliya Range", "Central", 6.892, 80.596),

  // Southern
  d("Galle", "Galle Range", "Southern", 6.053, 80.221),
  d("Elpitiya", "Galle Range", "Southern", 6.29, 80.159),
  d("Matara", "Matara & Hambantota Range", "Southern", 5.949, 80.546),
  d("Tangalle", "Matara & Hambantota Range", "Southern", 6.024, 80.795),

  // Eastern
  d("Trincomalee", "Trincomalee Range", "Eastern", 8.587, 81.215),
  d("Kantale", "Trincomalee Range", "Eastern", 8.367, 81.0),
  d("Batticaloa", "Batticaloa Range", "Eastern", 7.717, 81.7),
  d("Ampara", "Ampara Range", "Eastern", 7.297, 81.682),

  // Northern
  d("Vavuniya", "Vavuniya & Mannar Range", "Northern", 8.751, 80.498),
  d("Mannar", "Vavuniya & Mannar Range", "Northern", 8.981, 79.904),
  d("Kilinochchi", "Kilinochchi & Mullaitivu Range", "Northern", 9.38, 80.4),
  d("Mullaitivu", "Kilinochchi & Mullaitivu Range", "Northern", 9.267, 80.814),
  d("Jaffna", "Jaffna Range", "Northern", 9.661, 80.026),
  d("Kankasanthurai", "Jaffna Range", "Northern", 9.816, 80.04),

  // North Western
  d("Kurunegala", "Kurunegala Range", "North Western", 7.487, 80.365),
  d("Kuliyapitiya", "Kurunegala Range", "North Western", 7.469, 80.042),
  d("Puttalam", "Puttalam Range", "North Western", 8.036, 79.828),
  d("Chilaw", "Puttalam Range", "North Western", 7.576, 79.795),

  // Sabaragamuwa
  d("Ratnapura", "Ratnapura Range", "Sabaragamuwa", 6.693, 80.399),
  d("Embilipitiya", "Ratnapura Range", "Sabaragamuwa", 6.343, 80.849),
  d("Kegalle", "Kegalle Range", "Sabaragamuwa", 7.252, 80.346),
  d("Seethawakapura", "Kegalle Range", "Sabaragamuwa", 6.955, 80.21),

  // Uva
  d("Badulla", "Badulla Range", "Uva", 6.99, 81.056),
  d("Bandarawela", "Badulla Range", "Uva", 6.829, 80.987),
  d("Monaragala", "Monaragala Range", "Uva", 6.872, 81.351),

  // North Central
  d("Anuradhapura", "Anuradhapura & Polonnaruwa Range", "North Central", 8.312, 80.413),
  d("Polonnaruwa", "Anuradhapura & Polonnaruwa Range", "North Central", 7.94, 81.0),
  d("Kebitigollewa", "Anuradhapura & Polonnaruwa Range", "North Central", 8.533, 80.67),
];
