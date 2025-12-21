import { FastifyInstance } from 'fastify';
import { sellerOnboardingController } from '../controllers/seller-onboarding.controller';

export async function sellerOnboardingRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook('onRequest', fastify.authenticate);

  /**
   * POST /api/marketplace/seller/onboard
   * Start Stripe Connect onboarding process
   */
  fastify.post('/onboard', {
    schema: {
      description: 'Start Stripe Connect onboarding for seller',
      tags: ['Seller Onboarding'],
      body: {
        type: 'object',
        properties: {
          returnUrl: { type: 'string', description: 'URL to redirect after successful onboarding' },
          refreshUrl: { type: 'string', description: 'URL to redirect if onboarding needs refresh' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                accountId: { type: 'string' },
                onboardingUrl: { type: 'string' },
                accountStatus: { type: 'string' },
              },
            },
          },
        },
      },
    },
    handler: sellerOnboardingController.startOnboarding.bind(sellerOnboardingController),
  });

  /**
   * GET /api/marketplace/seller/status
   * Get Stripe Connect account status
   */
  fastify.get('/status', {
    schema: {
      description: 'Get seller Stripe Connect account status',
      tags: ['Seller Onboarding'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                accountId: { type: ['string', 'null'] },
                status: { type: 'string' },
                chargesEnabled: { type: 'boolean' },
                payoutsEnabled: { type: 'boolean' },
                detailsSubmitted: { type: 'boolean' },
                requirements: {
                  type: 'object',
                  properties: {
                    currentlyDue: { type: 'array', items: { type: 'string' } },
                    eventuallyDue: { type: 'array', items: { type: 'string' } },
                    pastDue: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: sellerOnboardingController.getStatus.bind(sellerOnboardingController),
  });

  /**
   * POST /api/marketplace/seller/refresh-link
   * Get new onboarding link
   */
  fastify.post('/refresh-link', {
    schema: {
      description: 'Generate new Stripe Connect onboarding link',
      tags: ['Seller Onboarding'],
      body: {
        type: 'object',
        properties: {
          returnUrl: { type: 'string' },
          refreshUrl: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                onboardingUrl: { type: 'string' },
              },
            },
          },
        },
      },
    },
    handler: sellerOnboardingController.refreshOnboardingLink.bind(sellerOnboardingController),
  });

  /**
   * GET /api/marketplace/seller/can-accept-fiat
   * Check if seller can accept fiat payments
   */
  fastify.get('/can-accept-fiat', {
    schema: {
      description: 'Check if seller can accept fiat payments',
      tags: ['Seller Onboarding'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                canAcceptFiatPayments: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
    handler: sellerOnboardingController.canAcceptFiat.bind(sellerOnboardingController),
  });
}
