import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import PoliceStation from './src/db/providers/mongo/models/PoliceStation.js';
import User from './src/db/providers/mongo/models/User.js';
import { hashPassword } from './src/utils/password.js';

const stationsData = [
  { province: "Western", district: "Colombo", name: "Colombo Fort Police Station", lat: 6.9344, lng: 79.8428 },
  { province: "Western", district: "Gampaha", name: "Gampaha Police Station", lat: 7.0840, lng: 79.9990 },
  { province: "Western", district: "Kalutara", name: "Kalutara Police Station", lat: 6.5854, lng: 79.9607 },
  { province: "Central", district: "Kandy", name: "Kandy Police Station", lat: 7.2906, lng: 80.6337 },
  { province: "Central", district: "Matale", name: "Matale Police Station", lat: 7.4675, lng: 80.6234 },
  { province: "Central", district: "Nuwara Eliya", name: "Nuwara Eliya Police Station", lat: 6.9497, lng: 80.7891 },
  { province: "Southern", district: "Galle", name: "Galle Police Station", lat: 6.0329, lng: 80.2168 },
  { province: "Southern", district: "Matara", name: "Matara Police Station", lat: 5.9485, lng: 80.5353 },
  { province: "Southern", district: "Hambantota", name: "Hambantota Police Station", lat: 6.1241, lng: 81.1185 },
  { province: "Northern", district: "Jaffna", name: "Jaffna Police Station", lat: 9.6615, lng: 80.0255 },
  { province: "Northern", district: "Kilinochchi", name: "Kilinochchi Police Station", lat: 9.3961, lng: 80.3982 },
  { province: "Northern", district: "Mannar", name: "Mannar Police Station", lat: 8.9810, lng: 79.9044 },
  { province: "Northern", district: "Mullaitivu", name: "Mullaitivu Police Station", lat: 9.2671, lng: 80.8142 },
  { province: "Northern", district: "Vavuniya", name: "Vavuniya Police Station", lat: 8.7542, lng: 80.4982 },
  { province: "Eastern", district: "Batticaloa", name: "Batticaloa Police Station", lat: 7.7102, lng: 81.6924 },
  { province: "Eastern", district: "Ampara", name: "Ampara Police Station", lat: 7.2975, lng: 81.6820 },
  { province: "Eastern", district: "Trincomalee", name: "Trincomalee Police Station", lat: 8.5874, lng: 81.2152 },
  { province: "North Western", district: "Kurunegala", name: "Kurunegala Police Station", lat: 7.4863, lng: 80.3647 },
  { province: "North Western", district: "Puttalam", name: "Puttalam Police Station", lat: 8.0362, lng: 79.8283 },
  { province: "North Central", district: "Anuradhapura", name: "Anuradhapura Police Station", lat: 8.3114, lng: 80.4037 },
  { province: "North Central", district: "Polonnaruwa", name: "Polonnaruwa Police Station", lat: 7.9403, lng: 81.0188 },
  { province: "Uva", district: "Badulla", name: "Badulla Police Station", lat: 6.9934, lng: 81.0550 },
  { province: "Uva", district: "Monaragala", name: "Monaragala Police Station", lat: 6.8728, lng: 81.3507 },
  { province: "Sabaragamuwa", district: "Ratnapura", name: "Ratnapura Police Station", lat: 6.6828, lng: 80.3992 },
  { province: "Sabaragamuwa", district: "Kegalle", name: "Kegalle Police Station", lat: 7.2513, lng: 80.3464 }
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Seeding the 25 district head police stations...");

  for (const st of stationsData) {
    let station = await PoliceStation.findOneAndUpdate(
      { name: st.name },
      { 
        name: st.name,
        district: st.district,
        division: st.district,
        location: {
          type: "Point",
          coordinates: [st.lng, st.lat]
        },
        isActive: true
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`Saved station: ${st.name}`);

    // Create or update officer
    const email = `${st.name.toLowerCase().replace(/ /g, '_').replace('_police_station', '_officer')}@evigilance.com`;
    const randomNic = Math.floor(Math.random() * 1000000000) + "V";
    
    let officer = await User.findOne({ police_station: station._id });
    if (!officer) {
      officer = await User.findOne({ email });
    }

    if (!officer) {
      await User.create({
        name: `OIC - ${st.district}`,
        email: email,
        password_hash: hashPassword("password123"),
        role: "station_officer",
        police_station: station._id,
        phone: "",
        nic: randomNic
      });
      console.log(`Created officer for ${st.name}: ${email}`);
    } else {
      await User.updateOne({ _id: officer._id }, { 
        name: `OIC - ${st.district}`
      });
      console.log(`Updated officer for ${st.name}`);
    }
  }

  console.log("Done seeding!");
  await mongoose.disconnect();
}

main().catch(console.error);
