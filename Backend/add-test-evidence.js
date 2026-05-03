import mongoose from "mongoose";
import Violation from "./src/db/providers/mongo/models/Violation.js";
import dotenv from "dotenv";

dotenv.config();

const testImages = [
  "https://res.cloudinary.com/demo/image/fetch/w_400/https://upload.wikimedia.org/wikipedia/commons/6/63/Fedora_on_Tux.png",
  "https://res.cloudinary.com/demo/image/fetch/w_400/https://upload.wikimedia.org/wikipedia/commons/b/b6/Image_created_with_a_mobile_phone.png",
];

const testVideos = [
  "https://commondatastorage.googleapis.com/gtv-videos-library/sample/BigBuckBunny.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-library/sample/ElephantsDream.mp4",
];

const testAudios = [
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
];

async function addTestEvidence() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("✅ Connected to MongoDB");

    // Get all violations
    const violations = await Violation.find({}).lean();
    console.log(`Found ${violations.length} violations`);

    if (violations.length === 0) {
      console.log("❌ No violations found. Create some first!");
      process.exit(1);
    }

    // Add test evidence to each violation
    for (let i = 0; i < violations.length; i++) {
      const v = violations[i];
      await Violation.updateOne(
        { _id: v._id },
        {
          $set: {
            images: [testImages[i % testImages.length]],
            videos: [testVideos[i % testVideos.length]],
            audios: [testAudios[i % testAudios.length]],
          },
        }
      );
      console.log(`✅ Added evidence to violation ${i + 1}/${violations.length}`);
    }

    console.log("\n✨ All violations now have test evidence!");
    console.log("🔄 Refresh your browser to see the Evidence Materials section");
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

addTestEvidence();
