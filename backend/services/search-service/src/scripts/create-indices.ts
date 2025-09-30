import 'dotenv/config';
import { Client } from '@elastic/elasticsearch';
import { logger } from '../utils/logger';

const client = new Client({
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200'
});

async function createIndices() {
  try {
    // Venues index
    await client.indices.create({
      index: 'venues',
      body: {
        mappings: {
          properties: {
            id: { type: 'keyword' },
            name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            description: { type: 'text' },
            address: { type: 'text' },
            city: { type: 'keyword' },
            state: { type: 'keyword' },
            capacity: { type: 'integer' },
            location: { type: 'geo_point' },
            amenities: { type: 'keyword' },
            created_at: { type: 'date' }
          }
        }
      }
    }).catch(err => {
      if (err.meta?.body?.error?.type !== 'resource_already_exists_exception') {
        throw err;
      }
      logger.info('Venues index already exists');
    });

    // Events index
    await client.indices.create({
      index: 'events',
      body: {
        mappings: {
          properties: {
            id: { type: 'keyword' },
            venue_id: { type: 'keyword' },
            venue_name: { type: 'text' },
            name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            description: { type: 'text' },
            date: { type: 'date' },
            category: { type: 'keyword' },
            artist: { type: 'text' },
            genre: { type: 'keyword' },
            status: { type: 'keyword' },
            ticket_price_min: { type: 'float' },
            ticket_price_max: { type: 'float' },
            created_at: { type: 'date' }
          }
        }
      }
    }).catch(err => {
      if (err.meta?.body?.error?.type !== 'resource_already_exists_exception') {
        throw err;
      }
      logger.info('Events index already exists');
    });

    logger.info('✅ Elasticsearch indices created successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Failed to create indices:', error);
    process.exit(1);
  }
}

createIndices();
