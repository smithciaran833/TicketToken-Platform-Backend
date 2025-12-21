import 'dotenv/config';
import { Client } from '@elastic/elasticsearch';
import { logger } from '../utils/logger';
import { readFileSync } from 'fs';
import { join } from 'path';

const client = new Client({
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200'
});

// Load mapping files from database/elasticsearch/mappings/
function loadMapping(filename: string): any {
  const mappingPath = join(__dirname, '../../../../../../database/elasticsearch/mappings', filename);
  const mappingContent = readFileSync(mappingPath, 'utf-8');
  return JSON.parse(mappingContent);
}

async function createIndices() {
  try {
    // Load all mapping files
    const venuesMapping = loadMapping('venues_mapping.json');
    const eventsMapping = loadMapping('events_mapping.json');
    const ticketsMapping = loadMapping('tickets_mapping.json');
    const marketplaceMapping = loadMapping('marketplace_mapping.json');

    logger.info('Loaded mapping files successfully');

    // Create venues index with full mapping
    await client.indices.create({
      index: 'venues',
      body: venuesMapping
    }).catch(err => {
      if (err.meta?.body?.error?.type !== 'resource_already_exists_exception') {
        throw err;
      }
      logger.info('Venues index already exists');
    });
    logger.info('✅ Venues index created with full mapping (~60 fields)');

    // Create events index with full mapping
    await client.indices.create({
      index: 'events',
      body: eventsMapping
    }).catch(err => {
      if (err.meta?.body?.error?.type !== 'resource_already_exists_exception') {
        throw err;
      }
      logger.info('Events index already exists');
    });
    logger.info('✅ Events index created with full mapping (~50 fields)');

    // Create tickets index with full mapping
    await client.indices.create({
      index: 'tickets',
      body: ticketsMapping
    }).catch(err => {
      if (err.meta?.body?.error?.type !== 'resource_already_exists_exception') {
        throw err;
      }
      logger.info('Tickets index already exists');
    });
    logger.info('✅ Tickets index created with full mapping (~100+ fields)');

    // Create marketplace index with full mapping
    await client.indices.create({
      index: 'marketplace',
      body: marketplaceMapping
    }).catch(err => {
      if (err.meta?.body?.error?.type !== 'resource_already_exists_exception') {
        throw err;
      }
      logger.info('Marketplace index already exists');
    });
    logger.info('✅ Marketplace index created with full mapping (~150+ fields)');

    logger.info('✅ All Elasticsearch indices created successfully with full mappings');
    logger.info('📊 Summary:');
    logger.info('  - Venues: ~60 fields (nested sections, amenities, accessibility, ratings)');
    logger.info('  - Events: ~50 fields (nested performers, venue data, pricing, ratings)');
    logger.info('  - Tickets: ~100+ fields (transfer history, blockchain, validation, marketplace)');
    logger.info('  - Marketplace: ~150+ fields (seller reputation, offers, analytics, blockchain)');
    
    process.exit(0);
  } catch (error) {
    logger.error('Failed to create indices:', error);
    process.exit(1);
  }
}

createIndices();
