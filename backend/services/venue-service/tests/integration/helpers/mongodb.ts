import mongoose, { Connection } from 'mongoose';
import { getContainerUrls } from './containers';

let testMongoConnection: Connection | null = null;

/**
 * Get or create the test MongoDB connection
 */
export async function getTestMongoDB(): Promise<Connection> {
  if (testMongoConnection && testMongoConnection.readyState === 1) {
    return testMongoConnection;
  }

  const urls = getContainerUrls();

  console.log('[MongoDB] Connecting to test database...');
  
  await mongoose.connect(urls.mongodb.uri, {
    maxPoolSize: 5,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 5000,
  });

  testMongoConnection = mongoose.connection;
  console.log('[MongoDB] Connected');

  return testMongoConnection;
}

/**
 * Drop all collections in the test database
 */
export async function dropAllCollections(): Promise<void> {
  if (!testMongoConnection || !testMongoConnection.db) {
    return;
  }

  const collections = await testMongoConnection.db.listCollections().toArray();
  
  for (const collection of collections) {
    await testMongoConnection.db.dropCollection(collection.name);
  }
}

/**
 * Clear all documents from all collections (preserves indexes)
 */
export async function clearAllCollections(): Promise<void> {
  if (!testMongoConnection || !testMongoConnection.db) {
    return;
  }

  const collections = await testMongoConnection.db.listCollections().toArray();
  
  for (const collection of collections) {
    await testMongoConnection.db.collection(collection.name).deleteMany({});
  }
}

/**
 * Close MongoDB connection
 */
export async function closeMongoDB(): Promise<void> {
  if (testMongoConnection) {
    await mongoose.disconnect();
    testMongoConnection = null;
    console.log('[MongoDB] Connection closed');
  }
}

/**
 * Check MongoDB connectivity
 */
export async function checkMongoDBConnection(): Promise<boolean> {
  try {
    if (!testMongoConnection || !testMongoConnection.db) {
      return false;
    }

    const adminDb = testMongoConnection.db.admin();
    const result = await adminDb.ping();
    return result.ok === 1;
  } catch (error) {
    console.error('[MongoDB] Connection check failed:', error);
    return false;
  }
}

/**
 * Insert test documents into a collection
 */
export async function insertTestDocuments(
  collectionName: string,
  documents: Record<string, any> | Record<string, any>[]
): Promise<void> {
  if (!testMongoConnection || !testMongoConnection.db) {
    throw new Error('MongoDB not connected');
  }

  const docs = Array.isArray(documents) ? documents : [documents];
  await testMongoConnection.db.collection(collectionName).insertMany(docs);
}

/**
 * Get documents from a collection
 */
export async function getTestDocuments<T = any>(
  collectionName: string,
  filter?: Record<string, any>
): Promise<T[]> {
  if (!testMongoConnection || !testMongoConnection.db) {
    throw new Error('MongoDB not connected');
  }

  return testMongoConnection.db
    .collection(collectionName)
    .find(filter || {})
    .toArray() as Promise<T[]>;
}

/**
 * Delete documents from a collection
 */
export async function deleteTestDocuments(
  collectionName: string,
  filter: Record<string, any>
): Promise<number> {
  if (!testMongoConnection || !testMongoConnection.db) {
    throw new Error('MongoDB not connected');
  }

  const result = await testMongoConnection.db
    .collection(collectionName)
    .deleteMany(filter);

  return result.deletedCount;
}
