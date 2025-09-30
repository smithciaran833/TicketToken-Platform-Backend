import 'dotenv/config';
import { Client } from '@elastic/elasticsearch';
import { logger } from '../utils/logger';

const client = new Client({
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200'
});

async function updateIndices() {
  try {
    // Add tickets index
    await client.indices.create({
      index: 'tickets',
      body: {
        mappings: {
          properties: {
            id: { type: 'keyword' },
            event_id: { type: 'keyword' },
            event_name: { type: 'text' },
            section: { type: 'keyword' },
            row: { type: 'keyword' },
            seat: { type: 'keyword' },
            price: { type: 'float' },
            status: { type: 'keyword' },
            created_at: { type: 'date' }
          }
        }
      }
    }).catch(err => {
      if (err.meta?.body?.error?.type !== 'resource_already_exists_exception') {
        throw err;
      }
      logger.info('Tickets index already exists');
    });

    // Add marketplace index
    await client.indices.create({
      index: 'marketplace',
      body: {
        mappings: {
          properties: {
            id: { type: 'keyword' },
            ticket_id: { type: 'keyword' },
            event_id: { type: 'keyword' },
            event_name: { type: 'text' },
            seller_id: { type: 'keyword' },
            listing_price: { type: 'float' },
            original_price: { type: 'float' },
            status: { type: 'keyword' },
            created_at: { type: 'date' }
          }
        }
      }
    }).catch(err => {
      if (err.meta?.body?.error?.type !== 'resource_already_exists_exception') {
        throw err;
      }
      logger.info('Marketplace index already exists');
    });

    // Add search_analytics index for tracking
    await client.indices.create({
      index: 'search_analytics',
      body: {
        mappings: {
          properties: {
            query: { type: 'text' },
            results_count: { type: 'integer' },
            user_id: { type: 'keyword' },
            timestamp: { type: 'date' },
            clicked_result: { type: 'keyword' }
          }
        }
      }
    }).catch(err => {
      if (err.meta?.body?.error?.type !== 'resource_already_exists_exception') {
        throw err;
      }
      logger.info('Search analytics index already exists');
    });

    logger.info('✅ All indices updated successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Failed to update indices:', error);
    process.exit(1);
  }
}

updateIndices();
