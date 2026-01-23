import { createContainer, asFunction, asValue, AwilixContainer, InjectionMode } from 'awilix';
import { config } from './index';
import { createDatabaseConnection } from './database';
import { getRedis } from './redis';
import { initializeMongoDB } from './mongodb';
import { Dependencies } from '../types';
import { EventService } from '../services/event.service';
import { PricingService } from '../services/pricing.service';
import { CapacityService } from '../services/capacity.service';
// PHASE 5c REFACTORED: VenueServiceClient now imported from @tickettoken/shared in services
import { EventContentService } from '../services/event-content.service';
import { EventBlockchainService } from '../services/blockchain.service';
import { CancellationService } from '../services/cancellation.service';
import { EventCancellationService } from '../services/event-cancellation.service';
import { ReservationCleanupService } from '../services/reservation-cleanup.service';

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
    mongodb: asFunction(async () => await initializeMongoDB()).singleton(),

    // PHASE 5c REFACTORED: venueServiceClient now used directly from @tickettoken/shared

    // Core Services
    eventContentService: asFunction(() => new EventContentService()).singleton(),

    eventService: asFunction(({ db, redis }) =>
      new EventService(db, redis)
    ).singleton(),

    pricingService: asFunction(({ db }) =>
      new PricingService(db)
    ).singleton(),

    capacityService: asFunction(({ db }) =>
      new CapacityService(db)
    ).singleton(),

    // CRITICAL FIX: Register missing services (Issue #3)
    blockchainService: asFunction(() =>
      new EventBlockchainService()
    ).singleton(),

    // Both cancellationService and eventCancellationService point to the same instance
    // This provides backward compatibility while transitioning
    cancellationService: asFunction(() =>
      new EventCancellationService()
    ).singleton(),

    eventCancellationService: asFunction(() =>
      new EventCancellationService()
    ).singleton(),

    reservationCleanupService: asFunction(({ db }) =>
      new ReservationCleanupService(
        db,
        parseInt(process.env.RESERVATION_CLEANUP_INTERVAL_MINUTES || '1', 10)
      )
    ).singleton()
  });

  return container;
};
