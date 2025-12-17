import express from 'express';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

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
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'User exists' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash });
    const access = signAccess({ id: user._id });
    const refresh = signRefresh({ id: user._id });

    res.cookie('refreshToken', refresh, cookieOptions());
    res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role }, accessToken: access });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
    const access = signAccess({ id: user._id });
    const refresh = signRefresh({ id: user._id });

    res.cookie('refreshToken', refresh, cookieOptions());
    res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role }, accessToken: access });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Server error' });
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
    res.json({ ok: true });
  } catch (err) {
    console.error('logout error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// refresh endpoint - reads refreshToken cookie and returns new access token
router.post('/refresh', async (req, res) => {
  try {
    // prefer cookie; allow dev-only fallback from request body for debugging
    const fromCookie = req.cookies?.refreshToken;
    const fromBody = req.body?.refreshToken;
    const token = fromCookie || (process.env.NODE_ENV !== 'production' ? fromBody : undefined);

    console.log('POST /api/auth/refresh — cookiePresent=', !!fromCookie, 'bodyTokenPresent=', !!fromBody);

    if (!token) return res.status(401).json({ error: 'No refresh token' });
    try {
      const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET || 'refresh_secret');
      const access = signAccess({ id: payload.id });
      res.json({ accessToken: access });
    } catch (e) {
      console.error('refresh verify error:', e && e.message);
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
  } catch (err) {
    console.error('refresh handler error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'No token' });
    const token = auth.split(' ')[1];
    try {
      const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET || 'access_secret');
      const user = await User.findById(payload.id).select('-passwordHash');
      res.json({ user });
    } catch (e) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (err) {
    console.error('me handler error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
