// middleware/rateLimiter.js

import rateLimit from 'express-rate-limit';

// 1. Global - applies to all routes
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Too many requests from this IP, please try again later.'
});

// 2. Auth - strict for login/register (relaxed in development)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 100,  // Strict in prod, relaxed in dev
  skipSuccessfulRequests: true,  // Only count failed attempts
  message: 'Too many authentication attempts, please try again after 15 minutes'
});

// 3. Admin - moderate for admin operations
export const adminLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: 'Too many admin requests, please slow down'
});

// 4. API - generous for public reads
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100
});