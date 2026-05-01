import cloudinary from "cloudinary";

// Configure Cloudinary with credentials from environment variables
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const cloudinaryConfig = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET,
};

export default cloudinaryConfig;
export { cloudinary };
