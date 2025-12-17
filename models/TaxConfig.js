import mongoose from 'mongoose';
const TaxConfigSchema = new mongoose.Schema({
  name: { type: String, default: 'GST' },
  rate: { type: Number, default: 0 }, // percentage, e.g., 18 for 18%
  inclusive: { type: Boolean, default: false } // whether prices include tax
}, { timestamps: true });
export default mongoose.model('TaxConfig', TaxConfigSchema);
