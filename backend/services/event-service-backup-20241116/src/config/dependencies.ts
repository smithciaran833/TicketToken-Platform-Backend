import { createContainer, asFunction, asValue, AwilixContainer, InjectionMode } from 'awilix';
import { config } from './index';
import { createDatabaseConnection } from './database';
import { createRedisConnection } from './redis';
import { Dependencies } from '../types';
import { EventService } from '../services/event.service';
import { PricingService } from '../services/pricing.service';
import { CapacityService } from '../services/capacity.service';
import { VenueServiceClient } from '../services/venue-service.client';

export const createDependencyContainer = (): AwilixContainer<Dependencies> => {
  const container = createContainer<Dependencies>({
    injectionMode: InjectionMode.PROXY
  });

  container.register({
    // Configuration
    config: asValue(config),

    // Database and Redis
    db: asFunction(createDatabaseConnection).singleton(),
    redis: asFunction(createRedisConnection).singleton(),

    // External service clients
    venueServiceClient: asFunction(() => new VenueServiceClient()).singleton(),

    // Services
    eventService: asFunction(({ db, venueServiceClient, redis }) =>
      new EventService(db, venueServiceClient, redis)
    ).singleton(),

    pricingService: asFunction(({ db }) =>
      new PricingService(db)
    ).singleton(),

    capacityService: asFunction(({ db }) =>
      new CapacityService(db)
    ).singleton()
  });

  return container;
};

