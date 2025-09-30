import { createContainer, asClass, asValue, InjectionMode } from 'awilix';
import { db } from './database';
import { logger } from '../utils/logger';
import Redis from 'ioredis';
import { Client } from '@elastic/elasticsearch';
import { SearchService } from '../services/search.service';
import { AutocompleteService } from '../services/autocomplete.service';
import { SyncService } from '../services/sync.service';
import { ProfessionalSearchService } from '../services/professional-search.service';

export async function initializeContainer() {
  const container = createContainer({
    injectionMode: InjectionMode.PROXY,
  });

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
    }))
  });

  // Register services
  container.register({
    searchService: asClass(SearchService).singleton(),
    autocompleteService: asClass(AutocompleteService).singleton(),
    syncService: asClass(SyncService).singleton(),
    professionalSearchService: asClass(ProfessionalSearchService).singleton()
  });

  return container;
}
