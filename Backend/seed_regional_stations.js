import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import RegionalStation from './src/db/providers/mongo/models/RegionalStation.js';
import User from './src/db/providers/mongo/models/User.js';
import { hashPassword } from './src/utils/password.js';

const regionalStations = [
  { name: "Western Province Regional Headquarters", region: "Western", code: "WP-HQ", address: "Colombo, Sri Lanka", phone: "+94112000001", email: "western_hq@evigilance.com", lat: 6.9271, lng: 79.8612 },
  { name: "Central Province Regional Headquarters", region: "Central", code: "CP-HQ", address: "Kandy, Sri Lanka", phone: "+94812000002", email: "central_hq@evigilance.com", lat: 7.2906, lng: 80.6337 },
  { name: "Southern Province Regional Headquarters", region: "Southern", code: "SP-HQ", address: "Galle, Sri Lanka", phone: "+94912000003", email: "southern_hq@evigilance.com", lat: 6.0328, lng: 80.2170 },
  { name: "Northern Province Regional Headquarters", region: "Northern", code: "NP-HQ", address: "Jaffna, Sri Lanka", phone: "+94212000004", email: "northern_hq@evigilance.com", lat: 9.6615, lng: 80.0255 },
  { name: "Eastern Province Regional Headquarters", region: "Eastern", code: "EP-HQ", address: "Trincomalee, Sri Lanka", phone: "+94262000005", email: "eastern_hq@evigilance.com", lat: 8.5874, lng: 81.2152 },
  { name: "North Western Province Regional Headquarters", region: "North Western", code: "NWP-HQ", address: "Kurunegala, Sri Lanka", phone: "+94372000006", email: "northwestern_hq@evigilance.com", lat: 7.4833, lng: 80.3667 },
  { name: "North Central Province Regional Headquarters", region: "North Central", code: "NCP-HQ", address: "Anuradhapura, Sri Lanka", phone: "+94252000007", email: "northcentral_hq@evigilance.com", lat: 8.3114, lng: 80.4037 },
  { name: "Uva Province Regional Headquarters", region: "Uva", code: "UVA-HQ", address: "Badulla, Sri Lanka", phone: "+94552000008", email: "uva_hq@evigilance.com", lat: 6.9897, lng: 81.0558 },
  { name: "Sabaragamuwa Province Regional Headquarters", region: "Sabaragamuwa", code: "SAB-HQ", address: "Ratnapura, Sri Lanka", phone: "+94452000009", email: "sabaragamuwa_hq@evigilance.com", lat: 6.6828, lng: 80.3992 }
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  
  console.log("Seeding Regional Police Stations for Sri Lanka...");

  for (const st of regionalStations) {
    let existing = await RegionalStation.findOne({ code: st.code });
    if (!existing) {
      existing = await RegionalStation.create({
        name: st.name,
        code: st.code,
        region: st.region,
        address: st.address,
        phone: st.phone,
        email: st.email,
        location: {
          lat: st.lat,
          lng: st.lng,
          dms: ""
        }
      });
      console.log(`Created regional station: ${st.name}`);
    } else {
      console.log(`Regional station already exists: ${st.name}`);
    }

    // Now check or create the officer for it
    const existingUser = await User.findOne({ email: st.email });
    if (!existingUser) {
      const randomNic = Math.floor(Math.random() * 1000000000) + "V";
      await User.create({
        name: `Regional HQ - ${st.region}`,
        email: st.email,
        password_hash: hashPassword("password123"),
        role: "hq", 
        nic: randomNic,
        phone: st.phone
      });
      console.log(`Created Regional HQ Officer: ${st.email}`);
    } else {
      console.log(`Regional HQ Officer already exists: ${st.email}`);
    }
  }

  console.log("Done seeding regional stations and officers!");
  await mongoose.disconnect();
}

main().catch(console.error);
