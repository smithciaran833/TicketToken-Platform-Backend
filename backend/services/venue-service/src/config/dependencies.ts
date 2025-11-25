import { asClass, asValue, createContainer } from 'awilix';
import { Knex } from 'knex';
import Redis from 'ioredis';
import { VenueService } from '../services/venue.service';
import { CacheService } from '../services/cache.service';
import { AnalyticsService } from '../services/analytics.service';
import { EventPublisher } from '../services/eventPublisher';
import { IntegrationService } from '../services/integration.service';
import { OnboardingService } from '../services/onboarding.service';
import { ComplianceService } from '../services/compliance.service';
import { VerificationService } from '../services/verification.service';
import { HealthCheckService } from '../services/healthCheck.service';
import { logger } from '../utils/logger';

export interface Dependencies {
  db: Knex;
  redis: Redis;
  venueService: VenueService;
  cacheService: CacheService;
  analyticsService: AnalyticsService;
  eventPublisher: EventPublisher;
  integrationService: IntegrationService;
  onboardingService: OnboardingService;
  complianceService: ComplianceService;
  verificationService: VerificationService;
  healthCheckService: HealthCheckService;
  logger: typeof logger;
  queueService: any;
}

export function registerDependencies(db: Knex, redis: Redis) {
  const container = createContainer<Dependencies>();

  container.register({
    db: asValue(db),
    redis: asValue(redis),
    logger: asValue(logger),
    queueService: asValue(null),
    cacheService: asClass(CacheService).singleton(),
    analyticsService: asClass(AnalyticsService).singleton(),
    eventPublisher: asClass(EventPublisher).singleton(),
    venueService: asClass(VenueService).singleton(),
    integrationService: asClass(IntegrationService).singleton(),
    onboardingService: asClass(OnboardingService).singleton(),
    complianceService: asClass(ComplianceService).singleton(),
    verificationService: asClass(VerificationService).singleton(),
    healthCheckService: asClass(HealthCheckService).singleton(),
  });

  return container;
}
