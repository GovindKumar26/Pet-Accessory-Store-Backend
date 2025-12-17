import mongoose from 'mongoose';
const ProductSchema = new mongoose.Schema({
  title: String,
  slug: { type: String, unique: true },
  description: String,
  price: Number,
  compareAt: Number,
  images: [String],
  category: String,
  tags: [String],
  featured: { type: Boolean, default: false },
  inventory: { type: Number, default: 0 }
}, { timestamps: true });
export default mongoose.model('Product', ProductSchema);
