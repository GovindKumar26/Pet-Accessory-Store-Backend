import mongoose from 'mongoose';

const connectDB = async (retries = 5, delay = 2000) => {
  // Validate MONGO_URI in production
  if (process.env.NODE_ENV === 'production' && !process.env.MONGO_URI) {
    throw new Error('CRITICAL: MONGO_URI must be set in production environment');
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/velvet_tails_db';

      // Warn if using default in development
      if (!process.env.MONGO_URI && process.env.NODE_ENV !== 'production') {
        console.warn('WARNING: Using default MongoDB URI. Set MONGO_URI in .env for production');
      }

      const options = {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        autoIndex: process.env.NODE_ENV !== 'production',
        retryWrites: true,
        w: 'majority'
      };

      const conn = await mongoose.connect(MONGO_URI, options);

      console.log(`MongoDB connected: ${conn.connection.host}`);
      if (process.env.NODE_ENV === 'development') {
        console.log(`Database: ${conn.connection.name}`);
      }

      return conn;

    } catch (error) {
      console.error(`MongoDB connection attempt ${attempt}/${retries} failed:`, error.message);

      // If last attempt, throw error
      if (attempt === retries) {
        console.error('All connection attempts exhausted');
        throw error;
      }

      // Exponential backoff with max cap at 30 seconds
      const waitTime = Math.min(delay * attempt, 30000);
      console.log(`Retrying in ${waitTime / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
};

// Connection event listeners
mongoose.connection.on('disconnected', () => {
  console.warn('⚠ MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('✗ MongoDB error:', err);
});

mongoose.connection.on('reconnected', () => {
  console.log('✓ MongoDB reconnected');
});

export default connectDB;
