

import express from "express";
import 'dotenv/config';
import crypto from 'crypto';

import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import 'express-async-errors';
import morgan from 'morgan';
import mongoose from 'mongoose';


import connectDB from './config/database.js';
import { globalLimiter, authLimiter, adminLimiter, apiLimiter } from './middleware/rateLimiter.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payments.js';
import adminRoutes from './routes/admin.js';
import discountRoutes from './routes/discounts.js';
// Shiprocket tracking via cron job (jobs/shiprocketTrackingCron.js)
import './jobs/shiprocketTrackingCron.js';
import './cron.js';



const app = express();
let server;


app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

// Configure Helmet security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
    },
  },
  crossOriginEmbedderPolicy: false, // Required for PayU integration
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}


// Validate critical environment variables in production
if (process.env.NODE_ENV === 'production') {
  // Critical variables that MUST be set
  const criticalVars = ['MONGO_URI', 'PAYU_MERCHANT_KEY', 'PAYU_MERCHANT_SALT'];
  const missing = criticalVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`CRITICAL: Missing required environment variables in production: ${missing.join(', ')}`);
  }

  // Warn about URLs but don't fail (can be set after initial deployment)
  if (!process.env.FRONTEND_URL) {
    console.warn('WARNING: FRONTEND_URL not set. CORS and payment redirects may not work correctly.');
    console.warn('Set this to your frontend domain after deployment.');
  }
  if (!process.env.BACKEND_URL) {
    console.warn('WARNING: BACKEND_URL not set. PayU payment callbacks may not work correctly.');
    console.warn('Set this to your backend domain after deployment.');
  }
}

// CORS configuration
const FRONT = process.env.FRONTEND_URL || 'http://localhost:5173';

const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? FRONT  // Production: only allow the exact frontend URL from env
    : [      // Development: allow multiple localhost ports for flexibility
      'http://localhost:5173',
      'http://localhost:5174',
      FRONT
    ],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));


app.use(express.static('public'));

// Add request ID tracking for better debugging
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Always enable trust proxy - needed for Render and other PaaS deployments
app.set('trust proxy', 1);



// Apply rate limiters
app.use(globalLimiter);  // Global rate limit for all routes

// Apply specific rate limiters to route groups
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', apiLimiter, productRoutes);
app.use('/api/discounts', apiLimiter, discountRoutes); // Public discounts endpoint
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminLimiter, adminRoutes);

app.get('/api/ping', (req, res) => res.json({ ok: true, time: new Date() }));

app.get('/api/health', async (req, res) => {
  const checks = {
    mongodb: mongoose.connection.readyState === 1,
  };

  const allHealthy = Object.values(checks).every(v => v === true);

  const health = {
    status: allHealthy ? 'OK' : 'DEGRADED',
    timestamp: new Date(),
    uptime: process.uptime(),
    mongodb: checks.mongodb ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV || 'development'
  };

  res.status(allHealthy ? 200 : 503).json(health);
});

// 404 handler for undefined routes
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  // Log error with request ID
  console.error(`[${req.id || 'unknown'}] Error:`, process.env.NODE_ENV === 'development' ? err : err.message);

  const status = err.statusCode || err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? (status < 500 ? err.message : 'Internal server error')
    : err.message;

  res.status(status).json({
    error: message,
    requestId: req.id
  });
});

// Server configuration
const PORT = process.env.PORT || 5000;

// Connect to database and start server
connectDB()
  .then(() => {
    server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch(err => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });






// Process error handlers
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! Shutting down...');
  console.error(err.name, err.message);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

const gracefulShutdown = async (signal) => {
  console.log(`\n Received ${signal}. Shutting down gracefully...`);

  if (server) {
    server.close(() => {
      console.log('✓ HTTP server closed');
    });
  }

  try {
    await mongoose.connection.close(false);
    console.log('✓ MongoDB connection closed');
    process.exit(0);
  } catch (err) {
    console.error('✗ Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

