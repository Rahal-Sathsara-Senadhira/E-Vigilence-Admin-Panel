import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Violation from "../providers/mongo/models/Violation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../../../.env") }); 

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/evigilance";

const mockViolations = [
  {
    title: "Running a Red Light",
    type: "Traffic",
    violations: ["Red Light Signal Violation"],
    description: "Vehicle WP CBB-1234 did not stop at the red light at Galle Road junction.",
    location: { lat: 6.9271, lng: 79.8612, dms: "6°55'37.6\"N 79°51'40.3\"E" },
    reported_by: "Citizen Report",
    status: "pending",
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
  },
  {
    title: "Illegal Parking in Bus Lane",
    type: "Parking",
    violations: ["Illegal Parking", "Obstructing Traffic"],
    description: "White Van CAX-9876 parked in the designated bus lane.",
    location: { lat: 6.8912, lng: 79.8588, dms: "6°53'28.3\"N 79°51'31.7\"E" },
    reported_by: "Traffic Cam 04",
    status: "pending",
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4 days ago
  },
  {
    title: "Speeding Over Limit",
    type: "Speeding",
    violations: ["Speeding (80km/h in 50km/h zone)"],
    description: "Motorcycle WP BAZ-456 caught on speed camera.",
    location: { lat: 6.9034, lng: 79.8732, dms: "6°54'12.2\"N 79°52'23.5\"E" },
    reported_by: "Speed Camera 12",
    status: "assigned",
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
  },
  {
    title: "Jaywalking Across Highway",
    type: "Pedestrian",
    violations: ["Jaywalking", "Endangering Traffic"],
    description: "Pedestrian crossed the high-speed lane outside the designated crosswalk.",
    location: { lat: 6.9150, lng: 79.8550, dms: "6°54'54.0\"N 79°51'18.0\"E" },
    reported_by: "Traffic Cam 02",
    status: "pending",
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
  },
  {
    title: "Walking on Highway Median",
    type: "Pedestrian",
    violations: ["Unauthorized Access to Expressway"],
    description: "Individual spotted walking along the center divider of the expressway.",
    location: { lat: 6.8720, lng: 79.8910, dms: "6°52'19.2\"N 79°53'27.6\"E" },
    reported_by: "Expressway Patrol",
    status: "resolved",
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
  },
  {
    title: "Ignoring Pedestrian Crossing Signal",
    type: "Pedestrian",
    violations: ["Disobeying Traffic Signals"],
    description: "Pedestrian crossed intersection while the pedestrian signal was red, causing a vehicle to brake hard.",
    location: { lat: 6.9320, lng: 79.8450, dms: "6°55'55.2\"N 79°50'42.0\"E" },
    reported_by: "Citizen Report",
    status: "assigned",
    createdAt: new Date(), // Today
  },
  {
    title: "Double Parking",
    type: "Parking",
    violations: ["Illegal Parking", "Blocking Traffic"],
    description: "Blue sedan blocking traffic by double parking near the market.",
    location: { lat: 6.9345, lng: 79.8567, dms: "6°56'04.2\"N 79°51'24.1\"E" },
    reported_by: "Traffic Warden",
    status: "pending",
    createdAt: new Date(), // Today
  }
];

async function runSeed() {
  try {
    console.log("Connecting to:", MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    // Clear existing
    await Violation.deleteMany({});
    console.log("Cleared existing violations");

    // Insert new
    const result = await Violation.insertMany(mockViolations);
    console.log(`Successfully seeded ${result.length} violations`);

    process.exit(0);
  } catch (error) {
    console.error("Seeding error:", error);
    process.exit(1);
  }
}

runSeed();
