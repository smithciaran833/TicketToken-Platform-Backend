import Stripe from 'stripe';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { getConfig } from '../config/index';

/**
 * SECURITY FIX (ST8): Lock Stripe API version to prevent breaking changes
 * Update this when explicitly upgrading Stripe API compatibility
 */
export const STRIPE_API_VERSION = '2024-11-20.acacia';

/**
 * SECURITY FIX (DS4): Simple circuit breaker for Stripe API calls
 */
class StripeCircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private isOpen = false;
  private readonly threshold: number;
  private readonly resetTimeout: number;

  constructor(threshold = 5, resetTimeoutMs = 30000) {
    this.threshold = threshold;
    this.resetTimeout = resetTimeoutMs;
  }

  async execute<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    // Check if circuit should be reset
    if (this.isOpen && Date.now() - this.lastFailure > this.resetTimeout) {
      logger.info({ operationName }, 'Stripe circuit breaker half-open, attempting reset');
      this.isOpen = false;
      this.failures = 0;
    }

    // Check if circuit is open
    if (this.isOpen) {
      logger.warn({ operationName, failures: this.failures }, 'Stripe circuit breaker open, rejecting request');
      throw new Error('Stripe service temporarily unavailable (circuit breaker open)');
    }

    try {
      const result = await operation();
      // Success - reset failure count
      if (this.failures > 0) {
        logger.info({ operationName }, 'Stripe circuit breaker: operation succeeded, resetting failures');
        this.failures = 0;
      }
      return result;
    } catch (error: any) {
      this.failures++;
      this.lastFailure = Date.now();

      // Check if we should open the circuit
      if (this.failures >= this.threshold) {
        this.isOpen = true;
        logger.error({
          operationName,
          failures: this.failures,
          threshold: this.threshold
        }, 'Stripe circuit breaker opened after threshold reached');
      }

      logger.warn({
        operationName,
        failures: this.failures,
        error: error.message
      }, 'Stripe operation failed');

      throw error;
    }
  }

  getState(): { isOpen: boolean; failures: number; lastFailure: Date | null } {
    return {
      isOpen: this.isOpen,
      failures: this.failures,
      lastFailure: this.lastFailure ? new Date(this.lastFailure) : null,
    };
  }

  // For testing: reset the circuit breaker state
  reset(): void {
    this.isOpen = false;
    this.failures = 0;
    this.lastFailure = 0;
  }
}

// Shared circuit breaker instance for Stripe calls
export const stripeCircuitBreaker = new StripeCircuitBreaker(5, 30000);

// Export for webhook handler consistency
export function createStripeClient(): Stripe {
  const stripeKey = getConfig().stripe.secretKey;
  if (!stripeKey) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }
  return new Stripe(stripeKey, {
    apiVersion: STRIPE_API_VERSION as any,
    // SECURITY: Set reasonable timeout
    timeout: 30000,
    // SECURITY: Set max network retries
    maxNetworkRetries: 2,
  });
}

interface OnboardingResult {
  accountId: string;
  onboardingUrl: string;
  accountStatus: string;
}

interface AccountStatus {
  accountId: string | null;
  status: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirements: {
    currentlyDue: string[];
    eventuallyDue: string[];
    pastDue: string[];
  };
}

export class VenueStripeOnboardingService {
  private stripe: Stripe;
  private db = db;
  private log = logger.child({ component: 'VenueStripeOnboardingService' });

  constructor() {
    // SECURITY FIX (ST8): Use centralized Stripe client with locked API version
    this.stripe = createStripeClient();
  }

  /**
   * SECURITY FIX (TENANT1): Validate tenant context is provided
   */
  private validateTenantContext(tenantId?: string): void {
    if (!tenantId) {
      throw new Error('Tenant context required for this operation');
    }
  }

  /**
   * SECURITY FIX (TENANT1): Verify venue belongs to tenant
   */
  private async verifyVenueOwnership(venueId: string, tenantId: string): Promise<void> {
    const venue = await this.db('venues')
      .where({ id: venueId, tenant_id: tenantId })
      .first();

    if (!venue) {
      throw new Error('Venue not found or access denied');
    }
  }

  /**
   * Create Stripe Connect Express account and generate onboarding link for venue
   * SECURITY FIX (TENANT1): Added tenantId parameter for tenant validation
   */
  async createConnectAccountAndOnboardingLink(
    venueId: string,
    tenantId: string,
    email: string,
    returnUrl: string,
    refreshUrl: string
  ): Promise<OnboardingResult> {
    try {
      // SECURITY FIX (TENANT1): Validate tenant context and venue ownership
      this.validateTenantContext(tenantId);
      await this.verifyVenueOwnership(venueId, tenantId);

      this.log.info('Creating Stripe Connect account for venue', { venueId, tenantId });

      // Check if venue already has a Connect account
      const existingVenue = await db('venues')
        .where('id', venueId)
        .select('stripe_connect_account_id', 'stripe_connect_status')
        .first();

      let accountId = existingVenue?.stripe_connect_account_id;

      // Create new Connect account if needed
      if (!accountId) {
        // SECURITY FIX (PF4): Add idempotencyKey to prevent duplicate account creation
        const idempotencyKey = `connect-create:${venueId}`;

        // SECURITY FIX (CB1): Use circuit breaker for Stripe API call
        const account = await stripeCircuitBreaker.execute(
          () => this.stripe.accounts.create({
            type: 'express',
            country: 'US',
            email: email,
            capabilities: {
              card_payments: { requested: true },
              transfers: { requested: true },
            },
            business_type: 'company', // Venues are typically businesses
            metadata: {
              venue_id: venueId,
              tenant_id: tenantId,
            },
          }, {
            idempotencyKey,
          }),
          'accounts.create'
        );

        accountId = account.id;

        // Save to database
        await db('venues')
          .where('id', venueId)
          .update({
            stripe_connect_account_id: accountId,
            stripe_connect_status: 'pending',
            stripe_connect_charges_enabled: false,
            stripe_connect_payouts_enabled: false,
            updated_at: new Date(),
          });

        this.log.info('Created Stripe Connect account for venue', { venueId, accountId });
      }

      // Generate account link for onboarding
      // Note: accountLinks are short-lived so we include timestamp for uniqueness
      // SECURITY FIX (CB1): Use circuit breaker for Stripe API call
      const accountLink = await stripeCircuitBreaker.execute(
        () => this.stripe.accountLinks.create({
          account: accountId,
          refresh_url: refreshUrl,
          return_url: returnUrl,
          type: 'account_onboarding',
        }, {
          idempotencyKey: `connect-link:${venueId}:${Date.now()}`,
        }),
        'accountLinks.create'
      );

      this.log.info('Generated onboarding link for venue', { venueId, accountId });

      return {
        accountId,
        onboardingUrl: accountLink.url,
        accountStatus: existingVenue?.stripe_connect_status || 'pending',
      };
    } catch (error: any) {
      this.log.error('Failed to create Connect account or onboarding link for venue', {
        venueId,
        error: error.message,
      });
      throw new Error(`Stripe Connect onboarding failed: ${error.message}`);
    }
  }

  /**
   * Get Stripe Connect account status for venue
   * SECURITY FIX (TENANT1): Added tenantId parameter for tenant validation
   */
  async getAccountStatus(venueId: string, tenantId: string): Promise<AccountStatus> {
    try {
      // SECURITY FIX (TENANT1): Validate tenant context and venue ownership
      this.validateTenantContext(tenantId);
      await this.verifyVenueOwnership(venueId, tenantId);

      const venue = await db('venues')
        .where('id', venueId)
        .select('stripe_connect_account_id', 'stripe_connect_status')
        .first();

      if (!venue?.stripe_connect_account_id) {
        return {
          accountId: null,
          status: 'not_started',
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          requirements: {
            currentlyDue: [],
            eventuallyDue: [],
            pastDue: [],
          },
        };
      }

      // Retrieve account from Stripe
      // SECURITY FIX (CB1): Use circuit breaker for Stripe API call
      const account = await stripeCircuitBreaker.execute(
        () => this.stripe.accounts.retrieve(venue.stripe_connect_account_id),
        'accounts.retrieve'
      );

      // Update database with current status
      await this.updateVenueStripeStatus(venueId, account);

      return {
        accountId: account.id,
        status: this.determineAccountStatus(account),
        chargesEnabled: account.charges_enabled || false,
        payoutsEnabled: account.payouts_enabled || false,
        detailsSubmitted: account.details_submitted || false,
        requirements: {
          currentlyDue: account.requirements?.currently_due || [],
          eventuallyDue: account.requirements?.eventually_due || [],
          pastDue: account.requirements?.past_due || [],
        },
      };
    } catch (error: any) {
      this.log.error('Failed to get account status for venue', { venueId, error: error.message });
      throw new Error(`Failed to get account status: ${error.message}`);
    }
  }

  /**
   * Refresh onboarding link (if venue needs to complete additional info)
   * SECURITY FIX (TENANT1): Added tenantId parameter for tenant validation
   */
  async refreshOnboardingLink(
    venueId: string,
    tenantId: string,
    returnUrl: string,
    refreshUrl: string
  ): Promise<string> {
    try {
      // SECURITY FIX (TENANT1): Validate tenant context and venue ownership
      this.validateTenantContext(tenantId);
      await this.verifyVenueOwnership(venueId, tenantId);

      const venue = await db('venues')
        .where('id', venueId)
        .select('stripe_connect_account_id')
        .first();

      if (!venue?.stripe_connect_account_id) {
        throw new Error('Venue does not have a Stripe Connect account');
      }

      // SECURITY FIX (CB1): Use circuit breaker for Stripe API call
      const accountLink = await stripeCircuitBreaker.execute(
        () => this.stripe.accountLinks.create({
          account: venue.stripe_connect_account_id,
          refresh_url: refreshUrl,
          return_url: returnUrl,
          type: 'account_onboarding',
        }, {
          idempotencyKey: `connect-refresh:${venueId}:${Date.now()}`,
        }),
        'accountLinks.create'
      );

      this.log.info('Refreshed onboarding link for venue', { venueId });
      return accountLink.url;
    } catch (error: any) {
      this.log.error('Failed to refresh onboarding link for venue', { venueId, error: error.message });
      throw new Error(`Failed to refresh onboarding: ${error.message}`);
    }
  }

  /**
   * Handle Stripe Connect account.updated webhook
   */
  async handleAccountUpdated(account: Stripe.Account): Promise<void> {
    try {
      const venueId = account.metadata?.venue_id;
      if (!venueId) {
        this.log.warn('Account updated webhook missing venue_id in metadata', {
          accountId: account.id,
        });
        return;
      }

      await this.updateVenueStripeStatus(venueId, account);
      this.log.info('Updated venue Stripe status from webhook', { venueId, accountId: account.id });
    } catch (error: any) {
      this.log.error('Failed to handle account.updated webhook for venue', { error: error.message });
    }
  }

  /**
   * Check if venue can accept payments (royalties)
   */
  async canAcceptPayments(venueId: string): Promise<boolean> {
    try {
      const venue = await db('venues')
        .where('id', venueId)
        .select('stripe_connect_charges_enabled', 'stripe_connect_payouts_enabled')
        .first();

      return venue?.stripe_connect_charges_enabled && venue?.stripe_connect_payouts_enabled;
    } catch (error: any) {
      this.log.error('Failed to check payment eligibility for venue', { venueId, error: error.message });
      return false;
    }
  }

  /**
   * Update venue's Stripe Connect status in database
   */
  private async updateVenueStripeStatus(venueId: string, account: Stripe.Account): Promise<void> {
    const status = this.determineAccountStatus(account);

    await db('venues')
      .where('id', venueId)
      .update({
        stripe_connect_status: status,
        stripe_connect_charges_enabled: account.charges_enabled || false,
        stripe_connect_payouts_enabled: account.payouts_enabled || false,
        stripe_connect_details_submitted: account.details_submitted || false,
        stripe_connect_capabilities: JSON.stringify(account.capabilities || {}),
        stripe_connect_country: account.country || null,
        stripe_connect_onboarded_at:
          account.charges_enabled && account.payouts_enabled ? new Date() : null,
        updated_at: new Date(),
      });
  }

  /**
   * Determine overall account status
   */
  private determineAccountStatus(account: Stripe.Account): string {
    if (account.charges_enabled && account.payouts_enabled) {
      return 'enabled';
    }
    if (account.details_submitted) {
      return 'pending';
    }
    if (account.requirements?.disabled_reason) {
      return 'disabled';
    }
    return 'pending';
  }
}

export const venueStripeOnboardingService = new VenueStripeOnboardingService();
