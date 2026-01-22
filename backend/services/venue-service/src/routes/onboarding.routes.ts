import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { OnboardingController } from '../controllers/onboarding.controller';
import { OnboardingService } from '../services/onboarding.service';
import { VenueService } from '../services/venue.service';
import { authenticate } from '../middleware/auth.middleware';
import { requireTenant } from '../middleware/tenant.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  onboardingVenueIdSchema,
  onboardingStepParamsSchema,
  completeStepBodySchema
} from '../schemas/onboarding.schema';

export default async function onboardingRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
): Promise<void> {
  // Get dependencies from container
  const db = (fastify as any).db;
  const redis = (fastify as any).redis;
  const logger = (fastify as any).log;
  const cacheService = (fastify as any).cacheService;
  const eventPublisher = (fastify as any).eventPublisher;

  // Initialize services
  const venueService = new VenueService({
    db,
    redis,
    cacheService,
    eventPublisher,
    logger
  });

  const onboardingService = new OnboardingService({
    venueService,
    db,
    logger
  });

  // Initialize controller
  const onboardingController = new OnboardingController(onboardingService);

  /**
   * GET /venues/:venueId/onboarding/status
   * Get onboarding status and progress for a venue
   */
  fastify.get(
    '/:venueId/onboarding/status',
    {
      preHandler: [authenticate, requireTenant, validate(onboardingVenueIdSchema)]
    },
    onboardingController.getStatus.bind(onboardingController)
  );

  /**
   * POST /venues/:venueId/onboarding/steps/:stepId
   * Complete an onboarding step
   */
  fastify.post(
    '/:venueId/onboarding/steps/:stepId',
    {
      preHandler: [
        authenticate,
        requireTenant,
        validate(onboardingStepParamsSchema),
        validate(completeStepBodySchema)
      ],
    },
    onboardingController.completeStep.bind(onboardingController)
  );
}