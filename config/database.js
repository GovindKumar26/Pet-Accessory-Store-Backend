import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/velvet_tails_db';
    
    const conn = await mongoose.connect(MONGO_URI);
    
    console.log(`MongoDB connected: ${conn.connection.host}`);
    console.log(`Database: ${conn.connection.name}`);
    
    return conn;
  } catch (error) {
    console.error(' MongoDB connection error:', error.message);
    throw error;
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
