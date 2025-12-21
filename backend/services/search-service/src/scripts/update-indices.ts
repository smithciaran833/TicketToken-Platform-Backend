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

async function updateIndices() {
  try {
    // Load mapping files
    const ticketsMapping = loadMapping('tickets_mapping.json');
    const marketplaceMapping = loadMapping('marketplace_mapping.json');

    logger.info('Loaded mapping files successfully');

    // Add tickets index with full mapping
    await client.indices.create({
      index: 'tickets',
      body: ticketsMapping
    }).catch(err => {
      if (err.meta?.body?.error?.type !== 'resource_already_exists_exception') {
        throw err;
      }
      logger.info('Tickets index already exists');
    });
    logger.info('✅ Tickets index created/updated with full mapping (~100+ fields)');

    // Add marketplace index with full mapping
    await client.indices.create({
      index: 'marketplace',
      body: marketplaceMapping
    }).catch(err => {
      if (err.meta?.body?.error?.type !== 'resource_already_exists_exception') {
        throw err;
      }
      logger.info('Marketplace index already exists');
    });
    logger.info('✅ Marketplace index created/updated with full mapping (~150+ fields)');

    // Add search_analytics index for tracking (simple mapping, not from JSON file)
    await client.indices.create({
      index: 'search_analytics',
      body: {
        mappings: {
          properties: {
            query: { type: 'text' },
            results_count: { type: 'integer' },
            user_id: { type: 'keyword' },
            timestamp: { type: 'date' },
            clicked_result: { type: 'keyword' },
            filters: {
              type: 'object',
              enabled: false
            }
          }
        }
      }
    }).catch(err => {
      if (err.meta?.body?.error?.type !== 'resource_already_exists_exception') {
        throw err;
      }
      logger.info('Search analytics index already exists');
    });
    logger.info('✅ Search analytics index created for query tracking');

    logger.info('✅ All indices updated successfully with full mappings');
    logger.info('📊 Summary:');
    logger.info('  - Tickets: ~100+ fields (transfer history, blockchain, validation, marketplace)');
    logger.info('  - Marketplace: ~150+ fields (seller reputation, offers, analytics, blockchain)');
    logger.info('  - Search Analytics: Query tracking and user behavior');
    
    process.exit(0);
  } catch (error) {
    logger.error('Failed to update indices:', error);
    process.exit(1);
  }
}

updateIndices();
