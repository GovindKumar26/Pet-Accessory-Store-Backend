import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import 'express-async-errors';

import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payments.js';
import adminRoutes from './routes/admin.js';

dotenv.config();

const app = express();
app.use(helmet());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// IMPORTANT: default FRONT to your frontend origin (you said http://localhost:3000)
const FRONT = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

// CORS must allow credentials and must specify the exact origin (not '*')
app.use(cors({ origin: FRONT, credentials: true }));

// If you sit behind a reverse proxy in dev (less common) you might need:
// app.set('trust proxy', true);

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/ping', (req, res) => res.json({ ok: true, time: new Date() }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err?.message || 'Server error' });
});

const PORT = process.env.PORT || 5000;
const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/velvet_tails_db';

mongoose.connect(MONGO)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log('Server running on', PORT));
  })
  .catch(err => {
    console.error('MongoDB connection error', err.message);
    process.exit(1);
  });
