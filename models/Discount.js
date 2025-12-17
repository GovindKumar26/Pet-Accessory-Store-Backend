import mongoose from 'mongoose';
const DiscountSchema = new mongoose.Schema({
  code: { type: String, unique: true },
  type: { type: String, enum:['percentage','fixed'], default: 'percentage' },
  value: Number,
  active: { type: Boolean, default: true },
  startsAt: Date,
  endsAt: Date,
  usageLimit: Number,
  usedCount: { type: Number, default: 0 }
}, { timestamps: true });
export default mongoose.model('Discount', DiscountSchema);
