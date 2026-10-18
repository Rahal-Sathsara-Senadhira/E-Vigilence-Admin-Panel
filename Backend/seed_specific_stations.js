import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import PoliceStation from './src/db/providers/mongo/models/PoliceStation.js';
import User from './src/db/providers/mongo/models/User.js';
import { hashPassword } from './src/utils/password.js';

const stationsData = [
  { district: "Colombo", division: "Colombo South", name: "Bambalapitiya Police Station", lat: 6.8842, lng: 79.8549, phone: "011-2583208", oicMobile: "071-8591580" },
  { district: "Colombo", division: "Colombo South", name: "Cinnamon Garden Police Station", lat: 6.9079, lng: 79.8660, phone: "011-2693377", oicMobile: "071-8591588" },
  { district: "Colombo", division: "Colombo North", name: "Kotahena Police Station", lat: 6.9458, lng: 79.8631, phone: "011-2435653", oicMobile: "071-8591571" },
  { district: "Colombo", division: "Colombo Central", name: "Maradana Police Station", lat: 6.9272, lng: 79.8647, phone: "011-2687922", oicMobile: "071-8591559" },
  { district: "Gampaha", division: "Gampaha", name: "Gampaha Police Station", lat: 7.0873, lng: 79.9996, phone: "033-2222226", oicMobile: "071-8591611" },
  { district: "Gampaha", division: "Negombo", name: "Negombo Police Station", lat: 7.2081, lng: 79.8373, phone: "031-2224289", oicMobile: "071-8591630" },
  { district: "Gampaha", division: "Kelaniya", name: "Peliyagoda Police Station", lat: 6.9557, lng: 79.8829, phone: "011-2911222", oicMobile: "071-8591599" },
  { district: "Kalutara", division: "Kalutara", name: "Kalutara South Police Station", lat: 6.5828, lng: 79.9607, phone: "034-2222226", oicMobile: "071-8591691" },
  { district: "Kalutara", division: "Panadura", name: "Panadura South Police Station", lat: 6.7145, lng: 79.9071, phone: "038-2232222", oicMobile: "071-8591677" },
  { district: "Kandy", division: "Kandy", name: "Kandy Police Station", lat: 7.2941, lng: 80.6384, phone: "081-2222226", oicMobile: "071-8591045" },
  { district: "Matale", division: "Matale", name: "Matale Police Station", lat: 7.4674, lng: 80.6234, phone: "066-2222222", oicMobile: "071-8591081" },
  { district: "Nuwara Eliya", division: "Nuwara Eliya", name: "Nuwara Eliya Police Station", lat: 6.9710, lng: 80.7818, phone: "052-2222222", oicMobile: "071-8591113" },
  { district: "Galle", division: "Galle", name: "Galle Police Station", lat: 6.0328, lng: 80.2149, phone: "091-2283415", oicMobile: "071-8591465" },
  { district: "Matara", division: "Matara", name: "Matara Police Station", lat: 5.9496, lng: 80.5353, phone: "041-2222727", oicMobile: "071-8591449" },
  { district: "Hambantota", division: "Tangalle", name: "Tangalle Police Station", lat: 6.0242, lng: 80.7963, phone: "047-2240222", oicMobile: "071-8591480" },
  { district: "Jaffna", division: "Jaffna", name: "Jaffna Police Station", lat: 9.6644, lng: 80.0166, phone: "021-2222222", oicMobile: "071-8591244" },
  { district: "Vavuniya", division: "Vavuniya", name: "Vavuniya Police Station", lat: 8.7513, lng: 80.4971, phone: "024-2222222", oicMobile: "071-8591322" },
  { district: "Batticaloa", division: "Batticaloa", name: "Batticaloa Police Station", lat: 7.7148, lng: 81.6961, phone: "065-2222222", oicMobile: "071-8591345" },
  { district: "Ampara", division: "Ampara", name: "Ampara Police Station", lat: 7.2882, lng: 81.6738, phone: "063-2222222", oicMobile: "071-8591380" },
  { district: "Trincomalee", division: "Trincomalee", name: "Trincomalee Police Station", lat: 8.5778, lng: 81.2333, phone: "026-2222222", oicMobile: "071-8591361" },
  { district: "Kurunegala", division: "Kurunegala", name: "Kurunegala Police Station", lat: 7.4871, lng: 80.3653, phone: "037-2222222", oicMobile: "071-8591730" },
  { district: "Puttalam", division: "Puttalam", name: "Puttalam Police Station", lat: 8.0325, lng: 79.8277, phone: "032-2265222", oicMobile: "071-8591780" },
  { district: "Anuradhapura", division: "Anuradhapura", name: "Anuradhapura Police Station", lat: 8.3114, lng: 80.4037, phone: "025-2222229", oicMobile: "071-8591203" },
  { district: "Polonnaruwa", division: "Polonnaruwa", name: "Polonnaruwa Police Station", lat: 7.9403, lng: 81.0028, phone: "027-2222222", oicMobile: "071-8591223" },
  { district: "Badulla", division: "Badulla", name: "Badulla Police Station", lat: 6.9892, lng: 81.0560, phone: "055-2222226", oicMobile: "071-8591511" },
  { district: "Moneragala", division: "Moneragala", name: "Moneragala Police Station", lat: 6.8722, lng: 81.3475, phone: "055-2276222", oicMobile: "071-8591530" },
  { district: "Ratnapura", division: "Ratnapura", name: "Ratnapura Police Station", lat: 6.6828, lng: 80.3992, phone: "045-2222222", oicMobile: "071-8591147" },
  { district: "Kegalle", division: "Kegalle", name: "Kegalle Police Station", lat: 7.2513, lng: 80.3465, phone: "035-2222222", oicMobile: "071-8591176" }
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Seeding exact police stations...");

  for (const st of stationsData) {
    let station = await PoliceStation.findOneAndUpdate(
      { name: st.name },
      { 
        name: st.name,
        district: st.district,
        division: st.division,
        contact_number: st.phone,
        location: {
          type: "Point",
          coordinates: [st.lng, st.lat]
        },
        isActive: true
      },
      { upsert: true, new: true }
    );
    console.log(`Saved station: ${st.name}`);

    // Create or update officer
    const email = `${st.name.toLowerCase().replace(/ /g, '_').replace('police_station', 'officer')}@evigilance.com`;
    const randomNic = Math.floor(Math.random() * 1000000000) + "V";
    
    let officer = await User.findOne({ police_station: station._id });
    if (!officer) {
      officer = await User.findOne({ email });
    }

    if (!officer) {
      await User.create({
        name: `OIC - ${st.name.replace(' Police Station', '')}`,
        email: email,
        password_hash: hashPassword("password123"),
        role: "station_officer",
        police_station: station._id,
        phone: st.oicMobile,
        nic: randomNic
      });
      console.log(`Created officer for ${st.name}: ${email}`);
    } else {
      await User.updateOne({ _id: officer._id }, { 
        phone: st.oicMobile,
        name: `OIC - ${st.name.replace(' Police Station', '')}`
      });
      console.log(`Updated officer for ${st.name}`);
    }
  }

  console.log("Done seeding specific stations and officers!");
  await mongoose.disconnect();
}

main().catch(console.error);
