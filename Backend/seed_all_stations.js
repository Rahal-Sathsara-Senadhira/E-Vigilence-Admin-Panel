import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import PoliceStation from './src/db/providers/mongo/models/PoliceStation.js';

const sriLankaStations = [
  { name: "Colombo Central Police Station", lat: 6.9271, lng: 79.8612 },
  { name: "Kandy Police Station", lat: 7.2906, lng: 80.6337 },
  { name: "Galle Police Station", lat: 6.0328, lng: 80.2170 },
  { name: "Jaffna Police Station", lat: 9.6615, lng: 80.0255 },
  { name: "Trincomalee Police Station", lat: 8.5874, lng: 81.2152 },
  { name: "Negombo Police Station", lat: 7.2091, lng: 79.8358 },
  { name: "Batticaloa Police Station", lat: 7.7170, lng: 81.6989 },
  { name: "Anuradhapura Police Station", lat: 8.3114, lng: 80.4037 },
  { name: "Kurunegala Police Station", lat: 7.4833, lng: 80.3667 },
  { name: "Ratnapura Police Station", lat: 6.6828, lng: 80.3992 },
  { name: "Badulla Police Station", lat: 6.9897, lng: 81.0558 },
  { name: "Matara Police Station", lat: 5.9496, lng: 80.5353 },
  { name: "Puttalam Police Station", lat: 8.0362, lng: 79.8283 },
  { name: "Ampara Police Station", lat: 7.2912, lng: 81.6724 },
  { name: "Nuwara Eliya Police Station", lat: 6.9497, lng: 80.7839 },
  { name: "Hambantota Police Station", lat: 6.1246, lng: 81.1185 },
  { name: "Vavuniya Police Station", lat: 8.7514, lng: 80.4971 },
  { name: "Mannar Police Station", lat: 8.9810, lng: 79.9044 },
  { name: "Kilinochchi Police Station", lat: 9.3803, lng: 80.3970 },
  { name: "Mullaitivu Police Station", lat: 9.2671, lng: 80.8142 },
  { name: "Polonnaruwa Police Station", lat: 7.9403, lng: 81.0028 },
  { name: "Monaragala Police Station", lat: 6.8728, lng: 81.3507 },
  { name: "Kegalle Police Station", lat: 7.2513, lng: 80.3461 },
  { name: "Matale Police Station", lat: 7.4675, lng: 80.6234 },
  { name: "Kalutara Police Station", lat: 6.5854, lng: 79.9607 },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  
  console.log("Seeding major police stations in Sri Lanka...");

  for (const st of sriLankaStations) {
    await PoliceStation.findOneAndUpdate(
      { name: st.name },
      {
        name: st.name,
        location: {
          type: "Point",
          coordinates: [st.lng, st.lat]
        },
        isActive: true
      },
      { upsert: true, new: true }
    );
    console.log(`Saved station: ${st.name}`);
  }

  console.log("Done seeding stations!");
  await mongoose.disconnect();
}

main().catch(console.error);
