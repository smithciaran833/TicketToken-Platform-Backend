import { createContainer, asFunction, asValue, AwilixContainer, InjectionMode } from 'awilix';
import { config } from './index';
import { createDatabaseConnection } from './database';
import { getRedis } from './redis';
import { initializeMongoDB } from './mongodb';
import { Dependencies } from '../types';
import { EventService } from '../services/event.service';
import { PricingService } from '../services/pricing.service';
import { CapacityService } from '../services/capacity.service';
import { VenueServiceClient } from '../services/venue-service.client';
import { EventContentService } from '../services/event-content.service';

export const createDependencyContainer = (): AwilixContainer<Dependencies> => {
  const container = createContainer<Dependencies>({
    injectionMode: InjectionMode.PROXY
  });

  container.register({
    // Configuration
    config: asValue(config),

    // Database and Redis
    db: asFunction(createDatabaseConnection).singleton(),
    redis: asFunction(() => getRedis()).singleton(),
    mongodb: asFunction(() => initializeMongoDB()).singleton(),

    // External service clients
    venueServiceClient: asFunction(() => new VenueServiceClient()).singleton(),

    // Services
    eventContentService: asFunction(() => new EventContentService()).singleton(),
    
    eventService: asFunction(({ db, venueServiceClient, redis }) =>
      new EventService(db, venueServiceClient, redis)
    ).singleton(),

    pricingService: asFunction(({ db }) =>
      new PricingService(db)
    ).singleton(),

    capacityService: asFunction(({ db, venueServiceClient }) =>
      new CapacityService(db, venueServiceClient)
    ).singleton()
  });

  return container;
};
