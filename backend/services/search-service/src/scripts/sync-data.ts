import 'dotenv/config';
import { Client } from '@elastic/elasticsearch';
import { db } from '../config/database';
import { logger } from '../utils/logger';

const client = new Client({
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200'
});

async function syncData() {
  try {
    // Sync venues
    logger.info('Syncing venues...');
    const venues = await db('venues').select('*');
    
    for (const venue of venues) {
      await client.index({
        index: 'venues',
        id: venue.id,
        body: {
          id: venue.id,
          name: venue.name,
          type: venue.type,
          capacity: venue.capacity,
          address: venue.address?.street || '',
          city: venue.address?.city || '',
          state: venue.address?.state || '',
          slug: venue.slug,
          is_active: venue.is_active,
          created_at: venue.created_at
        }
      });
    }
    logger.info(`✅ Synced ${venues.length} venues`);

    // Sync events
    logger.info('Syncing events...');
    const events = await db('events').select('*');
    
    for (const event of events) {
      // Get venue name for the event
      const venue = venues.find(v => v.id === event.venue_id);
      
      await client.index({
        index: 'events',
        id: event.id,
        body: {
          id: event.id,
          venue_id: event.venue_id,
          venue_name: venue?.name || '',
          name: event.name || event.title || '',
          description: event.description || '',
          date: event.date || event.event_date || event.created_at,
          status: event.status || 'active',
          created_at: event.created_at
        }
      });
    }
    logger.info(`✅ Synced ${events.length} events`);

    // Refresh indices
    await client.indices.refresh({ index: ['venues', 'events'] });
    
    logger.info('✅ Data sync complete!');
    process.exit(0);
  } catch (error) {
    logger.error('Sync failed:', error);
    process.exit(1);
  }
}

syncData();
