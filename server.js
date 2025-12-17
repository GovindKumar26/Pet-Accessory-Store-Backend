import express from 'express';
import dotenv from 'dotenv';
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

dotenv.config();

const app = express();
let server;
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}


// IMPORTANT: default FRONT to your frontend origin (you said http://localhost:3000)
const FRONT = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

// CORS must allow credentials and must specify the exact origin (not '*')
app.use(cors({ origin: FRONT, credentials: true }));

// If you sit behind a reverse proxy in dev (less common) you might need:
// app.set('trust proxy', true);
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Apply rate limiters
app.use(globalLimiter);  // Global rate limit for all routes

// Apply specific rate limiters to route groups
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', apiLimiter, productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminLimiter, adminRoutes);

app.get('/api/ping', (req, res) => res.json({ ok: true, time: new Date() }));

app.get('/api/health', async (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});



app.use((err, req, res, next) => {
  console.error(err);

  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Server error';

  res.status(status).json({ error: message });
});

// Server configuration
const PORT = process.env.PORT || 5000;

// Connect to database and start server
connectDB()
  .then(() => {
      server =  app.listen(PORT, () => {
      console.log(`✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch(err => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
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

