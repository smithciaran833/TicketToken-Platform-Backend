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
      // NOTE: This indexes basic PostgreSQL data only
      // For full enrichment (amenities, images, ratings from MongoDB),
      // use the enrichment services in Phase 2
      await client.index({
        index: 'venues',
        id: venue.id,
        body: {
          venueId: venue.id,
          name: venue.name,
          type: venue.type,
          capacity: venue.capacity,
          address: {
            street: venue.address?.street || '',
            city: venue.address?.city || '',
            state: venue.address?.state || '',
            zipCode: venue.address?.zipCode || '',
            country: venue.address?.country || '',
            fullAddress: venue.address ? `${venue.address.street}, ${venue.address.city}, ${venue.address.state}` : ''
          },
          location: venue.location || null,
          status: venue.is_active ? 'active' : 'inactive',
          metadata: {
            createdAt: venue.created_at,
            updatedAt: venue.updated_at
          }
          // TODO Phase 2: Add MongoDB content via venue-enrichment.service
          // - sections (from venue_sections table)
          // - amenities (from MongoDB venue_content)
          // - accessibilityFeatures (from MongoDB venue_content)
          // - images (from MongoDB venue_content)
          // - ratings (from MongoDB user_content)
          // - contact, parkingInfo, policies (from MongoDB venue_content)
        }
      });
    }
    logger.info(`✅ Synced ${venues.length} venues (basic fields only)`);
    logger.info('   ⚠️  Note: Full enrichment requires venue-enrichment.service (Phase 2)');

    // Sync events
    logger.info('Syncing events...');
    const events = await db('events').select('*');
    
    for (const event of events) {
      // Get venue name for the event
      const venue = venues.find(v => v.id === event.venue_id);
      
      // NOTE: This indexes basic PostgreSQL data only
      // For full enrichment (performers, images, ratings from MongoDB),
      // use the enrichment services in Phase 2
      await client.index({
        index: 'events',
        id: event.id,
        body: {
          eventId: event.id,
          title: event.name || event.title || '',
          description: event.description || '',
          category: event.category || '',
          eventDate: event.date || event.event_date || event.created_at,
          status: event.status || 'active',
          venue: {
            venueId: event.venue_id,
            name: venue?.name || '',
            city: venue?.address?.city || '',
            state: venue?.address?.state || '',
            country: venue?.address?.country || '',
            location: venue?.location || null
          },
          metadata: {
            createdAt: event.created_at,
            updatedAt: event.updated_at
          }
          // TODO Phase 2: Add MongoDB content via event-enrichment.service
          // - performers (from event_performers + performers tables + MongoDB)
          // - pricing (calculate from tickets table)
          // - images (from MongoDB event_content)
          // - ratings (from MongoDB user_content)
          // - capacity, ticketsSold (from tickets table aggregation)
        }
      });
    }
    logger.info(`✅ Synced ${events.length} events (basic fields only)`);
    logger.info('   ⚠️  Note: Full enrichment requires event-enrichment.service (Phase 2)');

    // Refresh indices
    await client.indices.refresh({ index: ['venues', 'events'] });
    
    logger.info('✅ Data sync complete!');
    logger.info('');
    logger.info('📋 Next Steps (Phase 2):');
    logger.info('  1. Create enrichment services (event, venue, ticket, marketplace)');
    logger.info('  2. Update sync.service.ts to call enrichment before indexing');
    logger.info('  3. Reindex all data with full enrichment');
    logger.info('');
    
    process.exit(0);
  } catch (error) {
    logger.error('Sync failed:', error);
    process.exit(1);
  }
}

syncData();
