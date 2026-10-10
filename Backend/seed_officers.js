import mongoose from 'mongoose';
import User from './src/db/providers/mongo/models/User.js';
import PoliceStation from './src/db/providers/mongo/models/PoliceStation.js';
import { hashPassword } from './src/utils/password.js';

async function main() {
  await mongoose.connect('mongodb+srv://smarsathsara_db_user:i2yjMalj6HpA7DUw@cluster0.1eacu9w.mongodb.net/evigilance?appName=Cluster0');
  
  const station = new PoliceStation({
    name: "Colombo Central Police Station",
    location: {
      type: "Point",
      coordinates: [79.8612, 6.9271]
    }
  });
  await station.save();
  console.log("Created station:", station.name);

  const officers = [
    { name: "Officer Kamal", email: "kamal@evigilance.com" },
    { name: "Officer Nimal", email: "nimal@evigilance.com" },
    { name: "Officer Sunimal", email: "sunimal@evigilance.com" }
  ];

  for (const officer of officers) {
    const user = new User({
      name: officer.name,
      email: officer.email,
      password_hash: hashPassword("password123"),
      role: "station_officer",
      stationId: station._id
    });
    await user.save();
    console.log(`Created officer: ${user.name} (${user.email})`);
  }
  
  await mongoose.disconnect();
}

main().catch(console.error);
