import { createContainer, asClass, asValue, InjectionMode } from 'awilix';
import { db } from './database';
import { logger } from '../utils/logger';
import Redis from 'ioredis';
import { Client } from '@elastic/elasticsearch';
import { MongoClient } from 'mongodb';
import { RatingService } from '@tickettoken/shared';
import { SearchService } from '../services/search.service';
import { AutocompleteService } from '../services/autocomplete.service';
import { SyncService } from '../services/sync.service';
import { ProfessionalSearchService } from '../services/professional-search.service';
import { ConsistencyService } from '../services/consistency.service';
import { ABTestingService } from '../services/ab-testing.service';
import { EventEnrichmentService } from '../services/event-enrichment.service';
import { VenueEnrichmentService } from '../services/venue-enrichment.service';
import { TicketEnrichmentService } from '../services/ticket-enrichment.service';
import { MarketplaceEnrichmentService } from '../services/marketplace-enrichment.service';

export async function initializeContainer() {
  const container = createContainer({
    injectionMode: InjectionMode.PROXY,
  });

  // Initialize MongoDB connection
  const mongoClient = new MongoClient(
    process.env.MONGODB_URI || 'mongodb://mongodb:27017/tickettoken'
  );
  await mongoClient.connect();

  // Register infrastructure
  container.register({
    db: asValue(db),
    logger: asValue(logger),
    redis: asValue(new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    })),
    elasticsearch: asValue(new Client({
      node: process.env.ELASTICSEARCH_NODE || 'http://elasticsearch:9200'
    })),
    mongodb: asValue(mongoClient)
  });

  // Register RatingService from shared content-reviews
  container.register({
    ratingService: asClass(RatingService).singleton()
  });

  // Register existing services
  container.register({
    consistencyService: asClass(ConsistencyService).singleton(),
    abTestingService: asClass(ABTestingService).singleton(),
    searchService: asClass(SearchService).singleton(),
    autocompleteService: asClass(AutocompleteService).singleton(),
    syncService: asClass(SyncService).singleton(),
    professionalSearchService: asClass(ProfessionalSearchService).singleton()
  });

  // Register enrichment services (Phase 2)
  container.register({
    eventEnrichmentService: asClass(EventEnrichmentService).singleton(),
    venueEnrichmentService: asClass(VenueEnrichmentService).singleton(),
    ticketEnrichmentService: asClass(TicketEnrichmentService).singleton(),
    marketplaceEnrichmentService: asClass(MarketplaceEnrichmentService).singleton()
  });

  return container;
}
