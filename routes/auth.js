import express from 'express';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/auth.js';
import Order from '../models/Order.js';

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

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'User exists' });

    const user = await User.create({ name, email, passwordHash: password });


    const access = signAccess({ id: user._id });
    const refresh = signRefresh({ id: user._id });

    res.cookie('refreshToken', refresh, cookieOptions());
    res.json({ user, accessToken: access });
  } catch (err) {
    console.error('Register error:', err);

    // Handle MongoDB duplicate key error (race condition)
    if (err.code === 11000) {
      return res.status(400).json({ error: 'An account with this email already exists. Please login or use a different email.' });
    }

    // Handle mongoose validation errors
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: `Validation failed: ${messages.join(', ')}` });
    }

    res.status(500).json({ error: 'Failed to create account. Please try again later.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) return res.status(400).json({ error: 'Email not found' });
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
