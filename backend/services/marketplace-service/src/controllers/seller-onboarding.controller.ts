import { FastifyRequest, FastifyReply } from 'fastify';
import { sellerOnboardingService } from '../services/seller-onboarding.service';
import { logger } from '../utils/logger';

export class SellerOnboardingController {
  private log = logger.child({ component: 'SellerOnboardingController' });

  /**
   * POST /api/marketplace/seller/onboard
   * Start Stripe Connect onboarding for seller
   */
  async startOnboarding(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.id;
    const email = (request as any).user?.email;

    if (!userId || !email) {
      reply.status(401).send({ error: 'Authentication required' });
      return;
    }

    const { returnUrl, refreshUrl } = request.body as {
      returnUrl?: string;
      refreshUrl?: string;
    };

    // Default URLs if not provided
    const defaultReturnUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/seller/onboarding/complete`;
    const defaultRefreshUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/seller/onboarding`;

    try {
      const result = await sellerOnboardingService.createConnectAccountAndOnboardingLink(
        userId,
        email,
        returnUrl || defaultReturnUrl,
        refreshUrl || defaultRefreshUrl
      );

      this.log.info('Seller onboarding started', { userId, accountId: result.accountId });

      reply.send({
        success: true,
        data: {
          accountId: result.accountId,
          onboardingUrl: result.onboardingUrl,
          accountStatus: result.accountStatus,
        },
      });
    } catch (error: any) {
      this.log.error('Onboarding failed', { userId, error: error.message });
      reply.status(500).send({
        error: 'Failed to start onboarding',
        message: error.message,
      });
    }
  }

  /**
   * GET /api/marketplace/seller/status
   * Get seller's Stripe Connect account status
   */
  async getStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.id;

    if (!userId) {
      reply.status(401).send({ error: 'Authentication required' });
      return;
    }

    try {
      const status = await sellerOnboardingService.getAccountStatus(userId);

      reply.send({
        success: true,
        data: status,
      });
    } catch (error: any) {
      this.log.error('Failed to get account status', { userId, error: error.message });
      reply.status(500).send({
        error: 'Failed to retrieve account status',
        message: error.message,
      });
    }
  }

  /**
   * POST /api/marketplace/seller/refresh-link
   * Generate new onboarding link (if additional info needed)
   */
  async refreshOnboardingLink(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.id;

    if (!userId) {
      reply.status(401).send({ error: 'Authentication required' });
      return;
    }

    const { returnUrl, refreshUrl } = request.body as {
      returnUrl?: string;
      refreshUrl?: string;
    };

    const defaultReturnUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/seller/onboarding/complete`;
    const defaultRefreshUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/seller/onboarding`;

    try {
      const onboardingUrl = await sellerOnboardingService.refreshOnboardingLink(
        userId,
        returnUrl || defaultReturnUrl,
        refreshUrl || defaultRefreshUrl
      );

      this.log.info('Onboarding link refreshed', { userId });

      reply.send({
        success: true,
        data: {
          onboardingUrl,
        },
      });
    } catch (error: any) {
      this.log.error('Failed to refresh onboarding link', { userId, error: error.message });
      reply.status(500).send({
        error: 'Failed to refresh onboarding link',
        message: error.message,
      });
    }
  }

  /**
   * GET /api/marketplace/seller/can-accept-fiat
   * Check if seller can accept fiat payments
   */
  async canAcceptFiat(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.id;

    if (!userId) {
      reply.status(401).send({ error: 'Authentication required' });
      return;
    }

    try {
      const canAccept = await sellerOnboardingService.canAcceptFiatPayments(userId);

      reply.send({
        success: true,
        data: {
          canAcceptFiatPayments: canAccept,
        },
      });
    } catch (error: any) {
      this.log.error('Failed to check fiat payment eligibility', { userId, error: error.message });
      reply.status(500).send({
        error: 'Failed to check eligibility',
        message: error.message,
      });
    }
  }
}

export const sellerOnboardingController = new SellerOnboardingController();
