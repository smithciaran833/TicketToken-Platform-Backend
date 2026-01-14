import { getTestDb, checkDbConnection } from './helpers/db';
import { getTestRedis, checkRedisConnection } from './helpers/redis';
import { getTestMongoDB, checkMongoDBConnection } from './helpers/mongodb';

describe('Test Containers', () => {
  describe('PostgreSQL', () => {
    it('should connect successfully', async () => {
      const connected = await checkDbConnection();
      expect(connected).toBe(true);
    });

    it('should run a query', async () => {
      const db = getTestDb();
      const result = await db.raw('SELECT 1 + 1 AS sum');
      expect(result.rows[0].sum).toBe(2);
    });
  });

  describe('Redis', () => {
    it('should connect successfully', async () => {
      const connected = await checkRedisConnection();
      expect(connected).toBe(true);
    });

    it('should set and get a key', async () => {
      const redis = getTestRedis();
      await redis.set('test-key', 'test-value');
      const value = await redis.get('test-key');
      expect(value).toBe('test-value');
    });
  });

  describe('MongoDB', () => {
    it('should connect successfully', async () => {
      const connected = await checkMongoDBConnection();
      expect(connected).toBe(true);
    });

    it('should insert and find a document', async () => {
      const conn = await getTestMongoDB();
      const collection = conn.db!.collection('test-collection');
      
      await collection.insertOne({ name: 'test', value: 123 });
      const doc = await collection.findOne({ name: 'test' });
      
      expect(doc).toBeTruthy();
      expect(doc!.value).toBe(123);
    });
  });
});
