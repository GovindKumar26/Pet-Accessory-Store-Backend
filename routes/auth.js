import express from 'express';
import User from '../models/User.js';
import PendingRegistration from '../models/PendingRegistration.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/auth.js';
import { sendVerificationEmail } from '../services/emailService.js';

const router = express.Router();

const signAccess = (payload) => jwt.sign(payload, process.env.JWT_ACCESS_SECRET || 'access_secret', { expiresIn: process.env.ACCESS_TOKEN_EXPIRES || '15m' });
const signRefresh = (payload) => jwt.sign(payload, process.env.JWT_REFRESH_SECRET || 'refresh_secret', { expiresIn: process.env.REFRESH_TOKEN_EXPIRES || '7d' });

// helper to decide cookie flags based on environment
const cookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax', // in prod with cross-site use 'none'
    secure: isProd,                    // only true in production (requires HTTPS)
    maxAge: 1000 * 60 * 60 * 24 * 7    // 7 days
  };
};

/**
 * POST /register
 * Creates a pending registration and sends verification email.
 * User is NOT added to DB until email is verified.
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate inputs
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters' });
    }
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists. Please login.' });
    }

    // Check if pending registration exists
    const existingPending = await PendingRegistration.findOne({ email });
    if (existingPending) {
      // Resend verification email
      await sendVerificationEmail(email, name, existingPending.verificationToken);
      return res.json({
        message: 'Verification email resent. Please check your inbox.',
        requiresVerification: true
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate verification token
    const verificationToken = PendingRegistration.generateToken();

    // Create pending registration
    await PendingRegistration.create({
      name: name.trim(),
      email,
      passwordHash,
      verificationToken
    });

    // Send verification email
    await sendVerificationEmail(email, name, verificationToken);

    res.status(201).json({
      message: 'Registration successful! Please check your email to verify your account.',
      requiresVerification: true
    });
  } catch (err) {
    console.error('Register error:', err);

    // Handle MongoDB duplicate key error (race condition)
    if (err.code === 11000) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    // Handle mongoose validation errors
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: `Validation failed: ${messages.join(', ')}` });
    }

    res.status(500).json({ error: 'Failed to create account. Please try again later.' });
  }
});

/**
 * GET /verify-email/:token
 * Verifies email and creates the actual user account.
 */
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    // Find pending registration
    const pending = await PendingRegistration.findOne({ verificationToken: token });

    if (!pending) {
      return res.status(400).json({ error: 'Invalid or expired verification link. Please register again.' });
    }

    // Check if user already exists (edge case)
    const existingUser = await User.findOne({ email: pending.email });
    if (existingUser) {
      // Delete pending registration
      await PendingRegistration.deleteOne({ _id: pending._id });
      return res.status(400).json({ error: 'This email is already verified. Please login.' });
    }

    // Create the actual user
    const user = await User.create({
      name: pending.name,
      email: pending.email,
      passwordHash: pending.passwordHash // Already hashed
    });

    // Delete pending registration
    await PendingRegistration.deleteOne({ _id: pending._id });

    // Auto-login: generate tokens
    const access = signAccess({ id: user._id });
    const refresh = signRefresh({ id: user._id });

    res.cookie('refreshToken', refresh, cookieOptions());
    res.json({
      message: 'Email verified successfully! You are now logged in.',
      user: user.toJSON(),
      accessToken: access,
      verified: true
    });
  } catch (err) {
    console.error('Verify email error:', err);
    res.status(500).json({ error: 'Verification failed. Please try again later.' });
  }
});

/**
 * POST /resend-verification
 * Resends verification email for pending registrations.
 */
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'This email is already verified. Please login.' });
    }

    // Find pending registration
    const pending = await PendingRegistration.findOne({ email });
    if (!pending) {
      return res.status(400).json({ error: 'No pending registration found. Please register first.' });
    }

    // Generate new token
    const newToken = PendingRegistration.generateToken();
    pending.verificationToken = newToken;
    pending.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Reset expiry
    await pending.save();

    // Send verification email
    await sendVerificationEmail(email, pending.name, newToken);

    res.json({ message: 'Verification email sent. Please check your inbox.' });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ error: 'Failed to resend verification email. Please try again later.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      // Check if there's a pending registration
      const pending = await PendingRegistration.findOne({ email });
      if (pending) {
        return res.status(400).json({
          error: 'Please verify your email first. Check your inbox for the verification link.',
          requiresVerification: true,
          email: email
        });
      }
      return res.status(400).json({ error: 'Email not found' });
    }

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(400).json({ error: 'Invalid password' });

    const access = signAccess({ id: user._id });
    const refresh = signRefresh({ id: user._id });

    res.cookie('refreshToken', refresh, cookieOptions());
    res.json({ user, accessToken: access });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login service error. Please try again later.' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    // clear using same flags so browsers clear properly
    const isProd = process.env.NODE_ENV === 'production';
    res.clearCookie('refreshToken', {
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd
    });
    res.json({ ok: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Logout failed. Please try again.' });
  }
});

// refresh endpoint - reads refreshToken cookie and returns new access token
router.post('/refresh', async (req, res) => {
  try {
    // prefer cookie; allow dev-only fallback from request body for debugging
    const fromCookie = req.cookies?.refreshToken;
    const fromBody = req.body?.refreshToken;
    const token = fromCookie || (process.env.NODE_ENV !== 'production' ? fromBody : undefined);

    if (process.env.NODE_ENV === 'development') {
      console.log('POST /api/auth/refresh — cookiePresent=', !!fromCookie);
    }

    if (!token) {
      return res.status(401).json({ error: 'Refresh token not found. Please login again.' });
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET || 'refresh_secret');
      const access = signAccess({ id: payload.id });
      res.json({ accessToken: access });
    } catch (e) {
      console.error('Refresh token verify error:', e.message);

      if (e.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Refresh token has expired. Please login again.' });
      }
      if (e.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Invalid refresh token. Please login again.' });
      }
      return res.status(401).json({ error: 'Token refresh failed. Please login again.' });
    }
  } catch (err) {
    console.error('Refresh handler error:', err);
    res.status(500).json({ error: 'Token refresh service error. Please try again later.' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (err) {
    console.error('Get user profile error:', err);
    res.status(500).json({ error: 'Failed to retrieve user profile. Please try again.' });
  }
});

export default router;
