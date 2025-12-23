import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Middleware to verify access token and attach user to request
export const authenticate = async (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    
    if (!auth) {
      return res.status(401).json({ error: 'Authorization header required. Please provide access token.' });
    }
    
    if (!auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Invalid authorization format. Use: Bearer <token>' });
    }
    
    const token = auth.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Access token missing in authorization header' });
    }
    
    try {
      const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      const user = await User.findById(payload.id);
      
      if (!user) {
        return res.status(401).json({ error: 'User account no longer exists. Please login again.' });
      }
      
      req.user = user;  // Attach user to request
      next();  // Continue to route handler
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Access token has expired. Please refresh your token.' });
      }
      if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Invalid access token. Please login again.' });
      }
      return res.status(401).json({ error: 'Token verification failed. Please login again.' });
    }
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication service error. Please try again later.' });
  }
};

// Middleware to check if user is admin
export const requireAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please login first.' });
  }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin privileges required for this action.' });
  }
  
  next();
};
