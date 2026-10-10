import mongoose from 'mongoose';
import PoliceStation from './src/db/providers/mongo/models/PoliceStation.js';

async function main() {
  await mongoose.connect('mongodb+srv://smarsathsara_db_user:i2yjMalj6HpA7DUw@cluster0.1eacu9w.mongodb.net/evigilance?appName=Cluster0');
  
  const stations = await PoliceStation.find({});
  console.log("Stations:", stations.map(s => ({ id: s._id, name: s.name })));
  
  await mongoose.disconnect();
}

main().catch(console.error);
