import mongoose from 'mongoose';
import crypto from 'crypto';

/**
 * PendingRegistration Model
 * Stores registration data until email is verified.
 * Once verified, data is moved to User collection.
 */
const PendingRegistrationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 50
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        unique: true,
        match: [/^\S+@\S+\.\S+$/, 'Invalid email address']
    },
    passwordHash: {
        type: String,
        required: true
    },
    verificationToken: {
        type: String,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true,
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    }
}, { timestamps: true });

// Auto-delete expired documents (TTL index)
PendingRegistrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Generate verification token
PendingRegistrationSchema.statics.generateToken = function () {
    return crypto.randomBytes(32).toString('hex');
};

export default mongoose.model('PendingRegistration', PendingRegistrationSchema);
