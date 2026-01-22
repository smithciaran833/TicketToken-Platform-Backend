import { asClass, asValue, asFunction, createContainer } from 'awilix';
import { Knex } from 'knex';
import type Redis from 'ioredis';
import { Connection } from 'mongoose';
import { VenueService } from '../services/venue.service';
import { CacheService } from '../services/cache.service';
import { AnalyticsService } from '../services/analytics.service';
import { EventPublisher } from '../services/eventPublisher';
import { IntegrationService } from '../services/integration.service';
import { OnboardingService } from '../services/onboarding.service';
import { ComplianceService } from '../services/compliance.service';
import { VerificationService } from '../services/verification.service';
import { HealthCheckService } from '../services/healthCheck.service';
import { VenueContentService } from '../services/venue-content.service';
import { logger } from '../utils/logger';

export interface Dependencies {
  db: Knex;
  redis: Redis;
  mongodb: Connection;
  venueService: VenueService;
  cacheService: CacheService;
  analyticsService: AnalyticsService;
  eventPublisher: EventPublisher;
  integrationService: IntegrationService;
  onboardingService: OnboardingService;
  complianceService: ComplianceService;
  verificationService: VerificationService;
  healthCheckService: HealthCheckService;
  venueContentService: VenueContentService;
  logger: typeof logger;
  queueService: any;
}

export function registerDependencies(db: Knex, redis: Redis, mongodb: Connection) {
  const container = createContainer<Dependencies>();

  container.register({
    db: asValue(db),
    redis: asValue(redis),
    mongodb: asValue(mongodb),
    logger: asValue(logger),
    queueService: asValue(null),
    cacheService: asFunction(({ redis }) => new CacheService(redis)).singleton(),
    analyticsService: asClass(AnalyticsService).singleton(),
    eventPublisher: asClass(EventPublisher).singleton(),
    venueService: asClass(VenueService).singleton(),
    integrationService: asClass(IntegrationService).singleton(),
    onboardingService: asClass(OnboardingService).singleton(),
    complianceService: asClass(ComplianceService).singleton(),
    verificationService: asClass(VerificationService).singleton(),
    healthCheckService: asClass(HealthCheckService).singleton(),
    venueContentService: asClass(VenueContentService).singleton(),
  });

  return container;
}
