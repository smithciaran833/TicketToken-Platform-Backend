import mongoose, { Connection } from 'mongoose';

let testMongoConnection: Connection | null = null;

export async function getTestMongoDB(): Promise<Connection> {
  if (testMongoConnection && testMongoConnection.readyState === 1) {
    return testMongoConnection;
  }

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/venue_test';

  console.log('[MongoDB] Connecting to test database...');

  await mongoose.connect(uri, {
    maxPoolSize: 5,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 5000,
  });

  testMongoConnection = mongoose.connection;
  console.log('[MongoDB] Connected');

  return testMongoConnection;
}

export async function clearAllCollections(): Promise<void> {
  if (!testMongoConnection || testMongoConnection.readyState !== 1) {
    console.warn('[MongoDB] Not connected, skipping collection cleanup');
    return;
  }

  try {
    // Use mongoose models to clear collections instead of listCollections
    const collections = mongoose.connection.collections;
    
    const clearPromises = Object.keys(collections).map(async (collectionName) => {
      const collection = collections[collectionName];
      try {
        await collection.deleteMany({});
      } catch (error) {
        console.warn(`[MongoDB] Failed to clear collection ${collectionName}:`, error);
      }
    });

    await Promise.all(clearPromises);
    console.log('[MongoDB] All collections cleared');
  } catch (error) {
    console.error('[MongoDB] Error clearing collections:', error);
    // Don't throw - let tests continue
  }
}

export async function closeMongoDB(): Promise<void> {
  if (testMongoConnection) {
    await mongoose.disconnect();
    testMongoConnection = null;
    console.log('[MongoDB] Connection closed');
  }
}
