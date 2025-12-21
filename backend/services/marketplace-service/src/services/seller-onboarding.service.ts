import Stripe from 'stripe';
import { db } from '../config/database';
import { logger } from '../utils/logger';

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

export class SellerOnboardingService {
  private stripe: Stripe;
  private log = logger.child({ component: 'SellerOnboardingService' });

  constructor() {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }
    this.stripe = new Stripe(stripeKey, {
      apiVersion: '2025-11-17.clover',
    });
  }

  /**
   * Create Stripe Connect Express account and generate onboarding link
   */
  async createConnectAccountAndOnboardingLink(
    userId: string,
    email: string,
    returnUrl: string,
    refreshUrl: string
  ): Promise<OnboardingResult> {
    try {
      this.log.info('Creating Stripe Connect account for user', { userId });

      // Check if user already has a Connect account
      const existingUser = await db('users')
        .where('id', userId)
        .select('stripe_connect_account_id', 'stripe_connect_status')
        .first();

      let accountId = existingUser?.stripe_connect_account_id;

      // Create new Connect account if needed
      if (!accountId) {
        const account = await this.stripe.accounts.create({
          type: 'express',
          country: 'US',
          email: email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          business_type: 'individual',
          metadata: {
            user_id: userId,
          },
        });

        accountId = account.id;

        // Save to database
        await db('users')
          .where('id', userId)
          .update({
            stripe_connect_account_id: accountId,
            stripe_connect_status: 'pending',
            updated_at: new Date(),
          });

        this.log.info('Created Stripe Connect account', { userId, accountId });
      }

      // Generate account link for onboarding
      const accountLink = await this.stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      this.log.info('Generated onboarding link', { userId, accountId });

      return {
        accountId,
        onboardingUrl: accountLink.url,
        accountStatus: existingUser?.stripe_connect_status || 'pending',
      };
    } catch (error: any) {
      this.log.error('Failed to create Connect account or onboarding link', {
        userId,
        error: error.message,
      });
      throw new Error(`Stripe Connect onboarding failed: ${error.message}`);
    }
  }

  /**
   * Get Stripe Connect account status
   */
  async getAccountStatus(userId: string): Promise<AccountStatus> {
    try {
      const user = await db('users')
        .where('id', userId)
        .select('stripe_connect_account_id', 'stripe_connect_status')
        .first();

      if (!user?.stripe_connect_account_id) {
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
      const account = await this.stripe.accounts.retrieve(
        user.stripe_connect_account_id
      );

      // Update database with current status
      await this.updateUserStripeStatus(userId, account);

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
      this.log.error('Failed to get account status', { userId, error: error.message });
      throw new Error(`Failed to get account status: ${error.message}`);
    }
  }

  /**
   * Refresh onboarding link (if user needs to complete additional info)
   */
  async refreshOnboardingLink(
    userId: string,
    returnUrl: string,
    refreshUrl: string
  ): Promise<string> {
    try {
      const user = await db('users')
        .where('id', userId)
        .select('stripe_connect_account_id')
        .first();

      if (!user?.stripe_connect_account_id) {
        throw new Error('User does not have a Stripe Connect account');
      }

      const accountLink = await this.stripe.accountLinks.create({
        account: user.stripe_connect_account_id,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      this.log.info('Refreshed onboarding link', { userId });
      return accountLink.url;
    } catch (error: any) {
      this.log.error('Failed to refresh onboarding link', { userId, error: error.message });
      throw new Error(`Failed to refresh onboarding: ${error.message}`);
    }
  }

  /**
   * Handle Stripe Connect account.updated webhook
   */
  async handleAccountUpdated(account: Stripe.Account): Promise<void> {
    try {
      const userId = account.metadata?.user_id;
      if (!userId) {
        this.log.warn('Account updated webhook missing user_id in metadata', {
          accountId: account.id,
        });
        return;
      }

      await this.updateUserStripeStatus(userId, account);
      this.log.info('Updated user Stripe status from webhook', { userId, accountId: account.id });
    } catch (error: any) {
      this.log.error('Failed to handle account.updated webhook', { error: error.message });
    }
  }

  /**
   * Update user's Stripe Connect status in database
   */
  private async updateUserStripeStatus(userId: string, account: Stripe.Account): Promise<void> {
    const status = this.determineAccountStatus(account);

    await db('users')
      .where('id', userId)
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

  /**
   * Check if user can accept fiat payments
   */
  async canAcceptFiatPayments(userId: string): Promise<boolean> {
    try {
      const user = await db('users')
        .where('id', userId)
        .select('stripe_connect_charges_enabled', 'stripe_connect_payouts_enabled')
        .first();

      return user?.stripe_connect_charges_enabled && user?.stripe_connect_payouts_enabled;
    } catch (error: any) {
      this.log.error('Failed to check fiat payment eligibility', { userId, error: error.message });
      return false;
    }
  }
}

export const sellerOnboardingService = new SellerOnboardingService();
