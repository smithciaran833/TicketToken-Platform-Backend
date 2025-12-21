#!/usr/bin/env ts-node

import { Client } from '@elastic/elasticsearch';
import Redis from 'ioredis';
import { initializeMongoDB, closeMongoDB } from '../config/mongodb';
import { ContentSyncService } from '../services/content-sync.service';
import { logger } from '../utils/logger';

async function syncContent() {
  let esClient: Client | null = null;
  let redis: Redis | null = null;

  try {
    logger.info('[SyncContent] Starting content synchronization');

    // Initialize MongoDB
    logger.info('[SyncContent] Connecting to MongoDB...');
    await initializeMongoDB();

    // Initialize Elasticsearch
    logger.info('[SyncContent] Connecting to Elasticsearch...');
    esClient = new Client({
      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
    });

    // Initialize Redis
    logger.info('[SyncContent] Connecting to Redis...');
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    });

    // Create sync service
    const syncService = new ContentSyncService(esClient, redis);

    // Sync venues
    logger.info('[SyncContent] ========================================');
    logger.info('[SyncContent] Starting venue synchronization...');
    logger.info('[SyncContent] ========================================');
    const venueResult = await syncService.bulkSyncVenues();
    logger.info(`[SyncContent] Venue sync complete: ${venueResult.synced} synced, ${venueResult.failed} failed`);

    // Sync events
    logger.info('[SyncContent] ========================================');
    logger.info('[SyncContent] Starting event synchronization...');
    logger.info('[SyncContent] ========================================');
    const eventResult = await syncService.bulkSyncEvents();
    logger.info(`[SyncContent] Event sync complete: ${eventResult.synced} synced, ${eventResult.failed} failed`);

    // Summary
    logger.info('[SyncContent] ========================================');
    logger.info('[SyncContent] SYNCHRONIZATION COMPLETE');
    logger.info('[SyncContent] ========================================');
    logger.info(`[SyncContent] Total venues synced: ${venueResult.synced}`);
    logger.info(`[SyncContent] Total venues failed: ${venueResult.failed}`);
    logger.info(`[SyncContent] Total events synced: ${eventResult.synced}`);
    logger.info(`[SyncContent] Total events failed: ${eventResult.failed}`);
    logger.info('[SyncContent] ========================================');

    process.exit(0);
  } catch (error) {
    logger.error('[SyncContent] Synchronization failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    if (redis) {
      await redis.quit();
      logger.info('[SyncContent] Redis disconnected');
    }
    await closeMongoDB();
    logger.info('[SyncContent] MongoDB disconnected');
  }
}

// Run the sync
syncContent();
