import mongoose from 'mongoose';
import Violation from './src/db/providers/mongo/models/Violation.js';

async function main() {
  await mongoose.connect('mongodb+srv://smarsathsara_db_user:i2yjMalj6HpA7DUw@cluster0.1eacu9w.mongodb.net/evigilance?appName=Cluster0');
  
  const statuses = await Violation.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]);
  
  console.log("Statuses in DB:", statuses);
  
  await mongoose.disconnect();
}

main().catch(console.error);
