import mongoose from 'mongoose';
import logger from '../utils/logger';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/blockchain';

export async function connectMongoDB() {
  try {
    await mongoose.connect(MONGODB_URL);
    logger.info('✅ Connected to MongoDB');
  } catch (error) {
    logger.error({ error }, '❌ MongoDB connection error');
    throw error;
  }
}

export async function disconnectMongoDB() {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

export { mongoose };
