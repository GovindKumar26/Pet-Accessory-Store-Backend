import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  email: { type: String, unique: true, required: true, lowercase: true, trim: true, match: [/^\S+@\S+\.\S+$/, 'Invalid email address'], },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }

}, { timestamps: true });


UserSchema.pre('save', async function (next) {
  // Only hash if password is NEW or MODIFIED, and not already hashed
  if (!this.isModified('passwordHash') || this.passwordHash.startsWith('$2')) {
    return next();
  }
  this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
  next();
});


// Method to compare password with hash
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.passwordHash);
};


// Override toJSON to exclude sensitive fields from API responses
UserSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.passwordHash;
  delete user.__v;
  return user;
};

export default mongoose.model('User', UserSchema);


