import User from "./models/User.js";
import { hashPassword } from "../../../utils/password.js";
import { env } from "../../../config/env.js";

export async function seedDevData() {
  // Only seed in dev (never production)
  if (env.NODE_ENV === "production") return;

  const count = await User.countDocuments();
  if (count > 0) return;

  const alexName = process.env.SEED_ALEX_NAME || "Alex Ortega";
  const alexEmail = process.env.SEED_ALEX_EMAIL || "alex.ortega@evigilence.local";
  const alexPassword = process.env.SEED_ALEX_PASSWORD || "Alex@12345";

  await User.create({
    name: alexName,
    email: alexEmail,
    role: "hq_admin",
    isActive: true,
    password_hash: hashPassword(alexPassword),
  });

  console.log(`[seed] Created default user: ${alexName} (${alexEmail})`);
}