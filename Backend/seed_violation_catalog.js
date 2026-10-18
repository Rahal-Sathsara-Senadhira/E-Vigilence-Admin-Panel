import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import ViolationCatalogEntry from "./src/db/providers/mongo/models/ViolationCatalogEntry.js";

const violationsData = [
  {
    serialNo: 1,
    section: "21, 22, 23, 24, 24(a)/b",
    name: "Identification Plates",
    fineAmount: 1000,
    severity: "minor",
  },
  {
    serialNo: 2,
    section: "38",
    name: "Revenue License should be displayed on Motor vehicles and produced when required",
    fineAmount: 1000,
    severity: "minor",
  },
  {
    serialNo: 3,
    section: "45",
    name: "Contravening the provision of Revenue",
    fineAmount: 1000,
    severity: "minor",
  },
  {
    serialNo: 4,
    section: "128(1)",
    name: "Emergency Service Vehicle & Public Service Vehicles without a License",
    fineAmount: 2000,
    severity: "moderate",
  },
  {
    serialNo: 5,
    section: "128(4)",
    name: "Driving Special Purpose Vehicle without obtaining a License",
    fineAmount: 2000,
    severity: "moderate",
  },
  {
    serialNo: 6,
    section: "128(4) a/c",
    name: "Driving a Vehicle loaded with Chemicals, hazardous WASTE without a License",
    fineAmount: 5000,
    severity: "severe",
  },
  {
    serialNo: 7,
    section: "130",
    name: "Not having a License to Drive a Specific class of vehicles",
    fineAmount: 2000,
    severity: "moderate",
  },
  {
    serialNo: 8,
    section: "135",
    name: "Failure to carry Driving License when driving",
    fineAmount: 1000,
    severity: "minor",
  },
  {
    serialNo: 9,
    section: "139(a)/b",
    name: "Instructing without an instructor's License",
    fineAmount: 2000,
    severity: "moderate",
  },
  {
    serialNo: 10,
    section: "140",
    name: "Exceeding speed limit",
    fineAmount: 3000,
    severity: "moderate",
  },
  {
    serialNo: 11,
    section: "148",
    name: "Disobeying Road Rules",
    fineAmount: 2000,
    severity: "moderate",
  },
  {
    serialNo: 12,
    section: "152",
    name: "Activities obstructing",
    fineAmount: 1000,
    severity: "minor",
  },
  {
    serialNo: 13,
    section: "153",
    name: "Using Inappropriate signals when driving & c.",
    fineAmount: 1000,
    severity: "minor",
  },
  {
    serialNo: 14,
    section: "154",
    name: "Reversing a motor vehicle for a long distance on a road is prohibited",
    fineAmount: 1000,
    severity: "minor",
  },
  {
    serialNo: 15,
    section: "155",
    name: "Improper use of Warning instruments",
    fineAmount: 1000,
    severity: "minor",
  },
  {
    serialNo: 16,
    section: "155(a)",
    name: "Excessive emission of smoke & c.",
    fineAmount: 1500,
    severity: "moderate",
  },
  {
    serialNo: 17,
    section: "156",
    name: "Prohibition on riding or permitting to ride on running Boards & c. of motor vehicle",
    fineAmount: 1000,
    severity: "minor",
  },
  {
    serialNo: 18,
    section: "157",
    name: "Restriction on the No. of persons in front seats of motor vehicles",
    fineAmount: 1000,
    severity: "minor",
  },
  {
    serialNo: 19,
    section: "157(a)",
    name: "Non-use of seat belts",
    fineAmount: 1000,
    severity: "moderate",
  },
  {
    serialNo: 20,
    section: "158",
    name: "Failure to wear protective helmets",
    fineAmount: 1500,
    severity: "moderate",
  },
  {
    serialNo: 21,
    section: "159",
    name: "Prohibition to distribute advertisements from a vehicle in motion",
    fineAmount: 1000,
    severity: "minor",
  },
  {
    serialNo: 22,
    section: "160",
    name: "Excessive use of noise from a vehicle is prohibited",
    fineAmount: 1000,
    severity: "minor",
  },
  {
    serialNo: 23,
    section: "162",
    name: "Failure to obey Directions and Signals of Police Officers & c.",
    fineAmount: 2000,
    severity: "moderate",
  },
  {
    serialNo: 24,
    section: "164",
    name: "Non-Compliance to road signs",
    fineAmount: 1500,
    severity: "moderate",
  },
  {
    serialNo: 25,
    section: "165",
    name: "Failure to take precaution when discharging fuel into tank",
    fineAmount: 1000,
    severity: "minor",
  },
  {
    serialNo: 26,
    section: "166",
    name: "Not halting or parking of motor vehicles on a road",
    fineAmount: 1000,
    severity: "minor",
  },
  {
    serialNo: 27,
    section: "167",
    name: "Precaution to be taken when motor vehicle is halted or left unattended or disabled on a road",
    fineAmount: 1000,
    severity: "minor",
  },
  {
    serialNo: 28,
    section: "178",
    name: "Carriage of persons in excess of authorized number or load of goods",
    fineAmount: 1500,
    severity: "moderate",
  },
  {
    serialNo: 29,
    section: "179",
    name: "Carriage of persons of passengers in excess of Authorized number and of goods",
    fineAmount: 1500,
    severity: "moderate",
  },
  {
    serialNo: 30,
    section: "188",
    name: "Carriage on lorry or motor tricycle van of goods in excess of maximum load",
    fineAmount: 2000,
    severity: "moderate",
  },
  {
    serialNo: 31,
    section: "189",
    name: "Not to exceed the No. of persons carried in a lorry",
    fineAmount: 1000,
    severity: "minor",
  },
  {
    serialNo: 32,
    section: "190",
    name: "Violation of regulations and Orders made (Tinted glasses, Smoking in buses, Mobile phones, Highway rules)",
    fineAmount: 2500,
    severity: "moderate",
  },
  {
    serialNo: 33,
    section: "196",
    name: "Failure to carry the Emission Certificate or the Fitness Certificate in the vehicle",
    fineAmount: 1000,
    severity: "minor",
  },
  {
    serialNo: 34,
    section: "2",
    name: "Driving on unregistered motor vehicle",
    fineAmount: 3000,
    severity: "severe",
  },
  {
    serialNo: 35,
    section: "12",
    name: "Change of possession of a motor vehicle & c.",
    fineAmount: 1000,
    severity: "minor",
  },
  {
    serialNo: 36,
    section: "25(1)",
    name: "Driving a motor vehicle without having the Revenue License",
    fineAmount: 2000,
    severity: "moderate",
  },
  {
    serialNo: 37,
    section: "99(1)",
    name: "Driving a motor vehicle without having the Certificate of Insurance",
    fineAmount: 3000,
    severity: "severe",
  },
  {
    serialNo: 38,
    section: "123(1)(a)",
    name: "Driving a motor vehicle without having the Driving License",
    fineAmount: 3000,
    severity: "severe",
  },
  {
    serialNo: 39,
    section: "149(1)",
    name: "Failure to avoid an accident",
    fineAmount: 3000,
    severity: "severe",
  },
  {
    serialNo: 40,
    section: "151(1)",
    name: "Driving under the influence of liquor or drugs",
    fineAmount: 10000,
    severity: "severe",
  },
  {
    serialNo: 41,
    section: "151(2)",
    name: "Dangerous driving",
    fineAmount: 5000,
    severity: "severe",
  },
  {
    serialNo: 42,
    section: "151(3)",
    name: "Reckless driving",
    fineAmount: 5000,
    severity: "severe",
  },
  {
    serialNo: 43,
    section: "161(1)",
    name: "Failure to report an accident",
    fineAmount: 2500,
    severity: "moderate",
  },
  {
    serialNo: 44,
    section: "196(9)",
    name: "Driving motor vehicle unfit for service",
    fineAmount: 2000,
    severity: "moderate",
  },
  {
    serialNo: 45,
    section: "220(1)",
    name: "Possession of a forged license",
    fineAmount: 10000,
    severity: "severe",
  },
];

async function seedViolationCatalog() {
  if (!process.env.MONGO_URI) {
    console.error("Error: MONGO_URI is missing in .env file.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  // Clear existing catalog
  const deleteResult = await ViolationCatalogEntry.deleteMany({});
  console.log(`Cleared existing catalog entries: deleted ${deleteResult.deletedCount} documents.`);

  // Prepare entries with formatted legalCode
  const entriesToInsert = violationsData.map((item) => ({
    name: item.name,
    legalCode: `Sec. ${item.section}`,
    fineAmount: item.fineAmount,
    severity: item.severity,
    isActive: true,
  }));

  const inserted = await ViolationCatalogEntry.insertMany(entriesToInsert);
  console.log(`\n✓ Successfully seeded ${inserted.length} official violations into the Violation Catalog!`);

  await mongoose.disconnect();
}

seedViolationCatalog().catch((err) => {
  console.error("Failed to seed violation catalog:", err);
  process.exit(1);
});
