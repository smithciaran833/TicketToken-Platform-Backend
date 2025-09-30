import { Pool } from 'pg';
import Redis from 'ioredis';
import { MongoClient, Db } from 'mongodb';
import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { config } from '../config';
import { logger } from './logger';

// PostgreSQL connection pool
export let pgPool: Pool;

// Redis client
export let redisClient: Redis;

// MongoDB client
export let mongoClient: MongoClient;
export let mongoDB: Db;

// Elasticsearch client
export let esClient: ElasticsearchClient;

// InfluxDB client
export let influxDB: InfluxDB;
export let influxWriteApi: any;
export let influxQueryApi: any;

// Initialize PostgreSQL
async function initializePostgreSQL() {
  try {
    pgPool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test connection
    const client = await pgPool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    logger.info('PostgreSQL connected successfully');
  } catch (error) {
    logger.error('Failed to connect to PostgreSQL:', error);
    // Don't throw - allow service to run without DB
  }
}

// Initialize Redis
async function initializeRedis() {
  try {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis error:', err);
    });

    await redisClient.ping();
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
  }
}

// Initialize MongoDB
async function initializeMongoDB() {
  try {
    mongoClient = new MongoClient(config.mongodb.uri);
    await mongoClient.connect();
    mongoDB = mongoClient.db('tickettoken_monitoring');
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
  }
}

// Initialize Elasticsearch
async function initializeElasticsearch() {
  try {
    esClient = new ElasticsearchClient({
      node: config.elasticsearch.node,
    });

    const health = await esClient.cluster.health();
    logger.info('Elasticsearch connected:', health.status);
  } catch (error) {
    logger.error('Failed to connect to Elasticsearch:', error);
  }
}

// Initialize InfluxDB
async function initializeInfluxDB() {
  try {
    influxDB = new InfluxDB({
      url: config.influxdb.url,
      token: config.influxdb.token || 'dummy-token', // Use dummy token if not set
    });

    influxWriteApi = influxDB.getWriteApi(
      config.influxdb.org,
      config.influxdb.bucket,
      'ns'
    );

    influxQueryApi = influxDB.getQueryApi(config.influxdb.org);
    
    logger.info('InfluxDB client initialized');
  } catch (error) {
    logger.error('Failed to initialize InfluxDB:', error);
  }
}

// Initialize all database connections
export async function initializeDatabases() {
  await Promise.all([
    initializePostgreSQL(),
    initializeRedis(),
    initializeMongoDB(),
    initializeElasticsearch(),
    initializeInfluxDB(),
  ]);
}

// Cleanup function
export async function closeDatabases() {
  try {
    if (pgPool) await pgPool.end();
    if (redisClient) await redisClient.quit();
    if (mongoClient) await mongoClient.close();
    logger.info('All database connections closed');
  } catch (error) {
    logger.error('Error closing database connections:', error);
  }
}

// Initialize on module load
initializeDatabases().catch(error => {
  logger.error('Failed to initialize databases:', error);
});
