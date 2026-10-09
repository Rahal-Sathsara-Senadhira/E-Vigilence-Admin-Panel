import mongoose from 'mongoose';

async function main() {
  await mongoose.connect('mongodb+srv://smarsathsara_db_user:i2yjMalj6HpA7DUw@cluster0.1eacu9w.mongodb.net/evigilance?appName=Cluster0');

  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log("Collections:", collections.map(c => c.name));
  
  const ViolationSchema = new mongoose.Schema({ createdAt: Date }, { strict: false, collection: 'violations' });
  const Violation = mongoose.model('Violation', ViolationSchema);
  const count = await Violation.countDocuments();
  console.log(`Total Violations: ${count}`);
  
  const ReportSchema = new mongoose.Schema({ createdAt: Date }, { strict: false, collection: 'reports' });
  const Report = mongoose.model('Report', ReportSchema);
  const reportCount = await Report.countDocuments();
  console.log(`Total Reports: ${reportCount}`);

  await mongoose.disconnect();
}

main().catch(console.error);
