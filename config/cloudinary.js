import { v2 as cloudinary } from 'cloudinary';

// Validate Cloudinary configuration in production
if (process.env.NODE_ENV === 'production') {
  if (!process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET) {
    throw new Error('CRITICAL: Cloudinary credentials must be set in production');
  }
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export default cloudinary;
