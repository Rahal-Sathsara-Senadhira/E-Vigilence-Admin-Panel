import mongoose from 'mongoose';
import User from './src/db/providers/mongo/models/User.js';
import PoliceStation from './src/db/providers/mongo/models/PoliceStation.js';
import { hashPassword } from './src/utils/password.js';

async function main() {
  await mongoose.connect('mongodb+srv://smarsathsara_db_user:i2yjMalj6HpA7DUw@cluster0.1eacu9w.mongodb.net/evigilence?appName=Cluster0');
  
  const station = new PoliceStation({
    name: "Colombo Central Police Station - " + Date.now(),
    location: {
      type: "Point",
      coordinates: [79.8612, 6.9271]
    }
  });
  await station.save();
  console.log("Created station:", station.name);

  const officers = [
    { name: "Officer Kamal", email: "kamal@evigilence.com", nic: "880" + Date.now().toString().slice(-6) + "V" },
    { name: "Officer Nimal", email: "nimal@evigilence.com", nic: "881" + Date.now().toString().slice(-6) + "V" },
    { name: "Officer Sunimal", email: "sunimal@evigilence.com", nic: "882" + Date.now().toString().slice(-6) + "V" }
  ];

  for (const officer of officers) {
    // Delete if exists to avoid email collisions
    await User.deleteOne({ email: officer.email });
    
    const user = new User({
      name: officer.name,
      email: officer.email,
      password_hash: hashPassword("password123"),
      role: "station_officer",
      stationId: station._id,
      nic: officer.nic // Using a generated NIC to satisfy the index
    });
    
    // Using strict:false to allow NIC even if not in schema if that's the issue
    await user.save();
    console.log(`Created officer: ${user.name} (${user.email}) with NIC: ${user.nic}`);
  }
  
  await mongoose.disconnect();
}

main().catch(console.error);
