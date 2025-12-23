import mongoose from 'mongoose';
import slugify from 'slugify';

const ProductSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
  slug: { type: String, unique: true },
  description: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },
  price: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'Price must be an integer value in paise'
    }
  },
  images: {
    type: [{
      url: { type: String, required: true },
      publicId: { type: String, required: true }
    }],
    validate: {
      validator: v => Array.isArray(v) && v.length > 0,
      message: 'Product must have at least one image'
    }
  },
  category: { type: String, required: true },
  tags: [String],
  inventory: { type: Number, required: true, min: 0, default: 0 }
}, { timestamps: true });

ProductSchema.pre('save', function (next) {
  // Generate slug for new products or when title changes
  if (this.isNew || this.isModified('title')) {
    const baseSlug = slugify(this.title, { lower: true, strict: true });
    this.slug = `${baseSlug}-${this._id.toString().slice(-6)}`;
  }
  next();
});

// Price sorting/filtering

// Instance methods
ProductSchema.methods.isInStock = function () {
  return this.inventory > 0;
};

ProductSchema.methods.getPriceInRupees = function () {
  return (this.price / 100).toFixed(2);
};

ProductSchema.virtual('priceRupees').get(function () {
  return (this.price / 100).toFixed(2);
});

ProductSchema.methods.reduceStock = function (quantity) {
  if (this.inventory < quantity) {
    throw new Error('Insufficient stock');
  }
  this.inventory -= quantity;
  return this.save();
};

ProductSchema.methods.hasEnoughStock = function (quantity) {
  return this.inventory >= quantity;
};

ProductSchema.virtual('inStock').get(function () {
  return this.inventory > 0;
});

ProductSchema.virtual('lowStock').get(function () {
  return this.inventory > 0 && this.inventory <= 5;
});

ProductSchema.set('toJSON', { virtuals: true });
ProductSchema.set('toObject', { virtuals: true });

// Indexes
ProductSchema.index({ title: 'text', description: 'text' });  // Full-text search
ProductSchema.index({ category: 1 });                         // Category lookup
ProductSchema.index({ slug: 1 });                             // Slug lookup (already unique, but explicit)
ProductSchema.index({ price: 1 });

export default mongoose.model('Product', ProductSchema);
