
import express from "express";
import 'dotenv/config';


// Debug: Check if Razorpay env vars are loaded
// console.log('Environment Check:');
// console.log('RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID ? 'LOADED' : 'NOT LOADED');
//console.log('RAZORPAY_KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET ? 'LOADED' : 'NOT LOADED');

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
import razorpayWebhook from "./routes/razorpayWebhook.js";
import shiprocketWebhook from './routes/shiprocketWebhook.js';
// import './cron.js'
//import the cron job later 
//import './jobs/shiprocketTrackingCron.js';



const app = express();
let server;


// app.use(
//   helmet({
//     contentSecurityPolicy: {
//       useDefaults: true,
//       directives: {
//         "script-src": [
//           "'self'",
//           "https://checkout.razorpay.com"
//         ],

//         "script-src-elem": [
//           "'self'",
//           "https://checkout.razorpay.com"
//         ],

//         "frame-src": [
//           "'self'",
//           "https://checkout.razorpay.com",
//           "https://api.razorpay.com"
//         ],

//         "connect-src": [
//           "'self'",
//           "https://api.razorpay.com",
//           "https://lumberjack.razorpay.com",
//           "https://browser.sentry-cdn.com"
//         ],

//         "img-src": [
//           "'self'",
//           "data:",
//           "https://checkout.razorpay.com"
//         ]
//       }
//     }
//   })
// );




app.use(
  "/api/webhooks/razorpay",
  express.raw({ type: "application/json" })
);



app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}


// IMPORTANT: default FRONT to your frontend origin (you said http://localhost:3000)
const FRONT = process.env.FRONTEND_URL || 'http://localhost:5173';

// CORS configuration - allow both common Vite ports
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    FRONT
  ],
  credentials: true
};

app.use(cors(corsOptions));


app.use(express.static('public'));


// If you sit behind a reverse proxy in dev (less common) you might need:
// app.set('trust proxy', true);
// Always enable trust proxy - needed for Render and other PaaS deployments
app.set('trust proxy', 1);


app.use("/api/webhooks", razorpayWebhook);
app.use('/api/shiprocket', shiprocketWebhook);
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
  res.json({
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
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
  if (process.env.NODE_ENV === 'development') console.error(err);

  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Server error';

  res.status(status).json({ error: message });
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

