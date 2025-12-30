import mongoose from 'mongoose';
const DiscountSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,  // "welcome10" → "WELCOME10"
    trim: true
  },
  type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  value: {
    type: Number,
    required: true,
    min: 0
  },
  active: { type: Boolean, default: true },
  startsAt: Date,
  endsAt: Date,
  usageLimit: { type: Number, min: 1 },  // At least 1 use, or undefined (unlimited)
  usedCount: { type: Number, default: 0 },
  description: { type: String, trim: true },  // "New year sale - 20% off"
  minOrderValue: { type: Number, min: 0 },  // Minimum order value to apply discount
  maxDiscountAmount: { type: Number, min: 0 },  // Max discount cap (for percentage type)
  firstTimeOnly: {
    type: Boolean,
    default: false,
    description: 'If true, discount only applies to users with no previous orders'
  },
  usedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    description: 'Array of user IDs who have used this discount'
  }]
}, { timestamps: true });

// Add validation in pre-save
DiscountSchema.pre('save', function (next) {
  if (this.type === 'percentage' && this.value > 100) {
    return next(new Error('Percentage discount cannot exceed 100%'));
  }
  if (this.value <= 0) {
    return next(new Error('Discount value must be greater than 0'));
  }
  if (this.startsAt && this.endsAt && this.endsAt <= this.startsAt) {
    return next(new Error('End date must be after start date'));
  }
  next();
});

DiscountSchema.methods.isValid = function () {
  if (!this.active) return false;

  const now = new Date();
  if (this.startsAt && now < this.startsAt) return false;
  if (this.endsAt && now > this.endsAt) return false;

  if (this.usageLimit && this.usedCount >= this.usageLimit) return false;

  return true;
};

DiscountSchema.methods.canBeUsed = function () {
  return this.isValid();
};

// Atomic increment - prevents race conditions
DiscountSchema.statics.incrementUsage = async function (discountId) {
  return this.findByIdAndUpdate(
    discountId,
    { $inc: { usedCount: 1 } },
    { new: true }
  );
};

// Calculate discount amount for given order total
DiscountSchema.methods.calculateDiscount = function (orderTotal) {
  if (!this.isValid()) {
    throw new Error('Invalid or expired discount code');
  }

  if (this.minOrderValue && orderTotal < this.minOrderValue) {
    throw new Error(
      `Minimum order value of ₹${(this.minOrderValue / 100).toFixed(2)} required`
    );

  }

  let discountPaise;

  if (this.type === 'percentage') {
    // Example: 10% of 9999 paise → 999.9 → rounded
    discountPaise = Math.round((orderTotal * this.value) / 100);
  } else {
    // Fixed discount already in paise
    discountPaise = this.value;
  }

  // Apply max discount cap (useful for percentage discounts)
  if (this.maxDiscountAmount && discountPaise > this.maxDiscountAmount) {
    discountPaise = this.maxDiscountAmount;
  }

  return Math.min(discountPaise, orderTotal);
};

// Indexes for performance
DiscountSchema.index({ code: 1 });    // Quick code lookup
DiscountSchema.index({ active: 1 });  // List active codes
DiscountSchema.index({ endsAt: 1 });  // Find expiring codes

export default mongoose.model('Discount', DiscountSchema);
