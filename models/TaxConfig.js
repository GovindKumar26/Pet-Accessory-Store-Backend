import mongoose from 'mongoose';
const TaxConfigSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  rate: { 
    type: Number, 
    required: true, 
    min: 0, 
    max: 100,
    validate: {
      validator: v => Number(v.toFixed(2)) === v,
      message: 'Tax rate cannot have more than 2 decimal places'
    }
  }, // percentage, e.g., 18 for 18%
  inclusive: { type: Boolean, default: false }, // whether prices include tax
  isActive: { type: Boolean, default: true },
  description: { type: String, trim: true }
}, { timestamps: true });

TaxConfigSchema.methods.calculateTax = function (amountPaise) {
  return Math.round((amountPaise * this.rate) / 100);
};


TaxConfigSchema.methods.getPriceWithTax = function(basePrice) {
  if (this.inclusive) {
    return basePrice;  // Already includes tax
  }
  return basePrice + this.calculateTax(basePrice);
};

// TaxConfigSchema.methods.getPriceWithoutTax = function(price) {
//   if (this.inclusive) {
//     return price / (1 + this.rate / 100);  // Extract base price
//   }
//   return price;
// };

TaxConfigSchema.methods.getPriceWithoutTax = function (pricePaise) {
  if (!this.inclusive) return pricePaise;

  return Math.round(pricePaise / (1 + this.rate / 100));
};


// Pre-save hook to ensure only one config
TaxConfigSchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await mongoose.model('TaxConfig').countDocuments();
    if (count > 0) {
      return next(new Error('Tax config already exists. Please update existing config instead.'));
    }
  }
  next();
});
export default mongoose.model('TaxConfig', TaxConfigSchema);

