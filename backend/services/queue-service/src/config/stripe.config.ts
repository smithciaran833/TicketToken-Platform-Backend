import Stripe from 'stripe';
import { logger } from '../utils/logger';

/**
 * Stripe Configuration
 * Initializes and exports the Stripe client with proper configuration
 */

// Validate required environment variables
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION as Stripe.LatestApiVersion || '2023-10-16';

if (!STRIPE_SECRET_KEY) {
  throw new Error('FATAL: STRIPE_SECRET_KEY environment variable is required');
}

// Validate Stripe key format
if (!STRIPE_SECRET_KEY.startsWith('sk_')) {
  throw new Error('FATAL: Invalid STRIPE_SECRET_KEY format. Must start with "sk_"');
}

// Initialize Stripe client
export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION,
  typescript: true,
  appInfo: {
    name: 'TicketToken Queue Service',
    version: '1.0.0',
  },
  maxNetworkRetries: 3,
  timeout: 80000, // 80 seconds (Stripe recommends 80s for payments)
});

// Stripe webhook configuration
export const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!stripeWebhookSecret) {
  logger.warn('STRIPE_WEBHOOK_SECRET not set - webhook signature verification will be disabled');
}

// Export configuration
export const stripeConfig = {
  secretKey: STRIPE_SECRET_KEY,
  apiVersion: STRIPE_API_VERSION,
  webhookSecret: stripeWebhookSecret,
  isTestMode: STRIPE_SECRET_KEY.includes('_test_'),
};

logger.info('Stripe configuration initialized', {
  apiVersion: STRIPE_API_VERSION,
  isTestMode: stripeConfig.isTestMode,
  webhookConfigured: !!stripeWebhookSecret,
});
