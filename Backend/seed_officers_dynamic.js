import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import User from './src/db/providers/mongo/models/User.js';
import PoliceStation from './src/db/providers/mongo/models/PoliceStation.js';
import { hashPassword } from './src/utils/password.js';

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const stations = await PoliceStation.find();
  console.log(`Found ${stations.length} police stations.`);

  for (const station of stations) {
    const stationName = station.name.split(' ')[0] || "Station";
    const officerEmail = `${stationName.toLowerCase()}_officer@evigilance.com`;

    const existingOfficer = await User.findOne({ email: officerEmail });

    if (!existingOfficer) {
      const randomNic = Math.floor(Math.random() * 1000000000) + "V";
      const user = new User({
        name: `Officer ${stationName}`,
        email: officerEmail,
        password_hash: hashPassword("password123"),
        role: "station_officer",
        stationId: station._id,
        nic: randomNic,
        phone: "+94770000000"
      });
      await user.save();
      console.log(`Created officer for ${station.name}: ${user.name} (${user.email})`);
    } else {
      console.log(`Officer already exists for ${station.name}: ${existingOfficer.name} (${existingOfficer.email})`);
    }
  }
  
  await mongoose.disconnect();
}

main().catch(console.error);
