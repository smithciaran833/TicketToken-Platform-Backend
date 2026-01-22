import { FastifyRequest, FastifyReply } from 'fastify';
import { OnboardingService } from '../services/onboarding.service';
import { getTenantId } from '../middleware/tenant.middleware';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'OnboardingController' });

/**
 * Onboarding Controller
 * Handles venue onboarding HTTP requests
 */
export class OnboardingController {
  private onboardingService: OnboardingService;

  constructor(onboardingService: OnboardingService) {
    this.onboardingService = onboardingService;
  }

  /**
   * GET /venues/:venueId/onboarding/status
   * Get onboarding status and progress for a venue
   */
  async getStatus(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { venueId } = request.params as { venueId: string };
      const tenantId = getTenantId(request);
      const userId = (request as any).user?.id;

      log.info({ venueId, tenantId, userId }, 'Getting onboarding status');

      const status = await this.onboardingService.getOnboardingStatus(venueId, tenantId);

      reply.status(200).send({
        success: true,
        data: status
      });
    } catch (error: any) {
      log.error({ error: error.message, venueId: (request.params as any).venueId }, 'Failed to get onboarding status');

      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return reply.status(404).send({
          success: false,
          error: 'Venue not found or access denied'
        });
      }

      if (error.message.includes('Invalid tenant')) {
        return reply.status(401).send({
          success: false,
          error: error.message
        });
      }

      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve onboarding status'
      });
    }
  }

  /**
   * POST /venues/:venueId/onboarding/steps/:stepId
   * Complete an onboarding step
   */
  async completeStep(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { venueId, stepId } = request.params as { venueId: string; stepId: string };
      const tenantId = getTenantId(request);
      const userId = (request as any).user?.id;
      const data = request.body;

      log.info({ venueId, stepId, tenantId, userId }, 'Completing onboarding step');

      await this.onboardingService.completeStep(venueId, tenantId, stepId, data);

      // Get updated status
      const status = await this.onboardingService.getOnboardingStatus(venueId, tenantId);

      reply.status(200).send({
        success: true,
        message: `Step '${stepId}' completed successfully`,
        data: status
      });
    } catch (error: any) {
      log.error({
        error: error.message,
        venueId: (request.params as any).venueId,
        stepId: (request.params as any).stepId
      }, 'Failed to complete onboarding step');

      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return reply.status(404).send({
          success: false,
          error: 'Venue not found or access denied'
        });
      }

      if (error.message.includes('Invalid tenant')) {
        return reply.status(401).send({
          success: false,
          error: error.message
        });
      }

      if (error.message.includes('Unknown onboarding step')) {
        return reply.status(422).send({  // FIX: Changed from 400 to 422
          success: false,
          error: error.message
        });
      }

      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        return reply.status(409).send({
          success: false,
          error: error.message
        });
      }

      // FIX: Catch validation errors and return 422
      if (error.message.includes('required') || 
          error.message.includes('Invalid integration type') ||
          error.message.includes('Missing required fields') ||
          error.message.includes('limit')) {
        return reply.status(422).send({  // FIX: Changed from 400 to 422
          success: false,
          error: error.message
        });
      }

      reply.status(500).send({
        success: false,
        error: 'Failed to complete onboarding step'
      });
    }
  }
}
