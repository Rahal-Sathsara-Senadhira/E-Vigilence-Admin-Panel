import { connectMongo } from './src/db/providers/mongo/index.js';
import User from './src/db/providers/mongo/models/User.js';
import { hashPassword } from './src/utils/password.js';

async function createAdmin() {
  await connectMongo();
  
  const email = "nandita@mme.ruh.ac.lk";
  await User.deleteOne({ email });
  
  const user = new User({
    name: "Dr. N.K. Hettiarachchi",
    email,
    password_hash: hashPassword("admin123"),
    role: "hq",
    avatarUrl: "/avatars/dr-nanditha.png",
    isActive: true,
    nic: "ADMIN" + Date.now().toString().slice(-6)
  });
  
  await user.save();
  console.log(`Created admin account: ${user.name} (${user.email})`);
  process.exit(0);
}

createAdmin().catch(console.error);
