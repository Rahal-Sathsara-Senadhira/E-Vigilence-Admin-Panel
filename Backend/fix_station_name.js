import { connectMongo } from './src/db/providers/mongo/index.js';
import PoliceStation from './src/db/providers/mongo/models/PoliceStation.js';

async function fix() {
  await connectMongo();
  const stations = await PoliceStation.find({ name: /Colombo Central Police Station -/ });
  for (const st of stations) {
    st.name = "Colombo Central Police Station";
    await st.save();
  }
  console.log("Fixed names");
  process.exit(0);
}

fix();
