import Stripe from 'stripe';
import { credentialEncryptionService } from '../credential-encryption.service';

export interface StripeCustomer {
  id?: string;
  email?: string;
  name?: string;
  phone?: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface StripePaymentIntent {
  id?: string;
  amount: number;
  currency: string;
  customer?: string;
  description?: string;
  metadata?: Record<string, string>;
  paymentMethod?: string;
}

export interface StripeCharge {
  id?: string;
  amount: number;
  currency: string;
  customer?: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface StripeSyncResult {
  success: boolean;
  recordsSynced: number;
  errors: Array<{ record: string; error: string }>;
}

export class StripeSyncService {
  private client: Stripe | null = null;

  /**
   * Initialize Stripe client with API key
   */
  private async initializeClient(venueId: string): Promise<Stripe> {
    if (this.client) {
      return this.client;
    }

    // Get API key from credential encryption service
    const credentials = await credentialEncryptionService.retrieveApiKeys(
      venueId,
      'stripe',
      'secret_key'
    );

    if (!credentials) {
      throw new Error(`No Stripe credentials found for venue ${venueId}`);
    }

    this.client = new Stripe(credentials.apiKey, {
      apiVersion: '2022-11-15',
      typescript: true,
    });

    return this.client;
  }

  /**
   * Sync customers to Stripe
   */
  async syncCustomersToStripe(
    venueId: string,
    customers: StripeCustomer[]
  ): Promise<StripeSyncResult> {
    const errors: Array<{ record: string; error: string }> = [];
    let recordsSynced = 0;

    try {
      const stripe = await this.initializeClient(venueId);

      for (const customer of customers) {
        try {
          if (customer.id) {
            // Update existing customer
            await stripe.customers.update(customer.id, {
              email: customer.email,
              name: customer.name,
              phone: customer.phone,
              description: customer.description,
              metadata: customer.metadata,
            });
          } else {
            // Create new customer
            await stripe.customers.create({
              email: customer.email,
              name: customer.name,
              phone: customer.phone,
              description: customer.description,
              metadata: customer.metadata,
            });
          }
          recordsSynced++;
        } catch (error) {
          console.error('Stripe customer sync error:', error);
          errors.push({
            record: customer.email || customer.id || 'Unknown',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return {
        success: errors.length === 0,
        recordsSynced,
        errors,
      };
    } catch (error) {
      console.error('Stripe sync failed:', error);
      throw new Error(`Stripe sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sync customers from Stripe
   */
  async syncCustomersFromStripe(venueId: string): Promise<StripeCustomer[]> {
    try {
      const stripe = await this.initializeClient(venueId);
      const customers: StripeCustomer[] = [];

      let hasMore = true;
      let startingAfter: string | undefined;

      while (hasMore) {
        const response = await stripe.customers.list({
          limit: 100,
          starting_after: startingAfter,
        });

        customers.push(...response.data.map((c) => ({
          id: c.id,
          email: c.email || undefined,
          name: c.name || undefined,
          phone: c.phone || undefined,
          description: c.description || undefined,
          metadata: c.metadata,
        })));

        hasMore = response.has_more;
        if (hasMore && response.data.length > 0) {
          startingAfter = response.data[response.data.length - 1].id;
        }
      }

      return customers;
    } catch (error) {
      console.error('Stripe sync from failed:', error);
      throw new Error(`Stripe sync from failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create payment intent in Stripe
   */
  async createPaymentIntent(
    venueId: string,
    paymentIntent: StripePaymentIntent
  ): Promise<Stripe.PaymentIntent> {
    try {
      const stripe = await this.initializeClient(venueId);

      return await stripe.paymentIntents.create({
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        customer: paymentIntent.customer,
        description: paymentIntent.description,
        metadata: paymentIntent.metadata,
        payment_method: paymentIntent.paymentMethod,
        confirm: false,
      });
    } catch (error) {
      console.error('Stripe payment intent creation failed:', error);
      throw new Error(`Stripe payment intent creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sync payment intents from Stripe
   */
  async syncPaymentIntentsFromStripe(
    venueId: string,
    startDate?: number
  ): Promise<Stripe.PaymentIntent[]> {
    try {
      const stripe = await this.initializeClient(venueId);
      const paymentIntents: Stripe.PaymentIntent[] = [];

      let hasMore = true;
      let startingAfter: string | undefined;

      while (hasMore) {
        const params: any = {
          limit: 100,
          starting_after: startingAfter,
        };

        if (startDate) {
          params.created = { gte: startDate };
        }

        const response = await stripe.paymentIntents.list(params);

        paymentIntents.push(...response.data);

        hasMore = response.has_more;
        if (hasMore && response.data.length > 0) {
          startingAfter = response.data[response.data.length - 1].id;
        }
      }

      return paymentIntents;
    } catch (error) {
      console.error('Stripe payment intent sync failed:', error);
      throw new Error(`Stripe payment intent sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sync charges from Stripe
   */
  async syncChargesFromStripe(
    venueId: string,
    startDate?: number
  ): Promise<Stripe.Charge[]> {
    try {
      const stripe = await this.initializeClient(venueId);
      const charges: Stripe.Charge[] = [];

      let hasMore = true;
      let startingAfter: string | undefined;

      while (hasMore) {
        const params: any = {
          limit: 100,
          starting_after: startingAfter,
        };

        if (startDate) {
          params.created = { gte: startDate };
        }

        const response = await stripe.charges.list(params);

        charges.push(...response.data);

        hasMore = response.has_more;
        if (hasMore && response.data.length > 0) {
          startingAfter = response.data[response.data.length - 1].id;
        }
      }

      return charges;
    } catch (error) {
      console.error('Stripe charge sync failed:', error);
      throw new Error(`Stripe charge sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create refund in Stripe
   */
  async createRefund(
    venueId: string,
    chargeId: string,
    amount?: number,
    reason?: string
  ): Promise<Stripe.Refund> {
    try {
      const stripe = await this.initializeClient(venueId);

      const params: Stripe.RefundCreateParams = {
        charge: chargeId,
      };

      if (amount) {
        params.amount = amount;
      }

      if (reason) {
        params.reason = reason as Stripe.RefundCreateParams.Reason;
      }

      return await stripe.refunds.create(params);
    } catch (error) {
      console.error('Stripe refund creation failed:', error);
      throw new Error(`Stripe refund creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get balance from Stripe
   */
  async getBalance(venueId: string): Promise<Stripe.Balance> {
    try {
      const stripe = await this.initializeClient(venueId);
      return await stripe.balance.retrieve();
    } catch (error) {
      console.error('Failed to get Stripe balance:', error);
      throw new Error(`Failed to get Stripe balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get balance transactions from Stripe
   */
  async getBalanceTransactions(
    venueId: string,
    startDate?: number
  ): Promise<Stripe.BalanceTransaction[]> {
    try {
      const stripe = await this.initializeClient(venueId);
      const transactions: Stripe.BalanceTransaction[] = [];

      let hasMore = true;
      let startingAfter: string | undefined;

      while (hasMore) {
        const params: any = {
          limit: 100,
          starting_after: startingAfter,
        };

        if (startDate) {
          params.created = { gte: startDate };
        }

        const response = await stripe.balanceTransactions.list(params);

        transactions.push(...response.data);

        hasMore = response.has_more;
        if (hasMore && response.data.length > 0) {
          startingAfter = response.data[response.data.length - 1].id;
        }
      }

      return transactions;
    } catch (error) {
      console.error('Failed to get Stripe balance transactions:', error);
      throw new Error(`Failed to get Stripe balance transactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify connection to Stripe
   */
  async verifyConnection(venueId: string): Promise<boolean> {
    try {
      const stripe = await this.initializeClient(venueId);
      await stripe.balance.retrieve();
      return true;
    } catch (error) {
      console.error('Stripe connection verification failed:', error);
      return false;
    }
  }

  /**
   * Construct webhook event from raw body and signature
   */
  constructWebhookEvent(
    payload: string | Buffer,
    signature: string,
    webhookSecret: string
  ): Stripe.Event {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2022-11-15',
    });

    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  /**
   * Process webhook event
   */
  async processWebhookEvent(event: Stripe.Event): Promise<void> {
    console.log(`Processing Stripe webhook event: ${event.type}`);

    switch (event.type) {
      case 'customer.created':
      case 'customer.updated':
      case 'customer.deleted':
        // Handle customer events
        console.log('Customer event:', event.data.object);
        break;

      case 'payment_intent.created':
      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
        // Handle payment intent events
        console.log('Payment intent event:', event.data.object);
        break;

      case 'charge.succeeded':
      case 'charge.failed':
      case 'charge.refunded':
        // Handle charge events
        console.log('Charge event:', event.data.object);
        break;

      case 'invoice.created':
      case 'invoice.paid':
      case 'invoice.payment_failed':
        // Handle invoice events
        console.log('Invoice event:', event.data.object);
        break;

      case 'subscription.created':
      case 'subscription.updated':
      case 'subscription.deleted':
        // Handle subscription events
        console.log('Subscription event:', event.data.object);
        break;

      default:
        console.log('Unhandled event type:', event.type);
    }
  }

  /**
   * Get webhook endpoints
   */
  async getWebhookEndpoints(venueId: string): Promise<Stripe.WebhookEndpoint[]> {
    try {
      const stripe = await this.initializeClient(venueId);
      const response = await stripe.webhookEndpoints.list({ limit: 100 });
      return response.data;
    } catch (error) {
      console.error('Failed to get Stripe webhook endpoints:', error);
      throw new Error(`Failed to get Stripe webhook endpoints: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create webhook endpoint
   */
  async createWebhookEndpoint(
    venueId: string,
    url: string,
    enabledEvents: string[]
  ): Promise<Stripe.WebhookEndpoint> {
    try {
      const stripe = await this.initializeClient(venueId);
      return await stripe.webhookEndpoints.create({
        url,
        enabled_events: enabledEvents as Stripe.WebhookEndpointCreateParams.EnabledEvent[],
      });
    } catch (error) {
      console.error('Failed to create Stripe webhook endpoint:', error);
      throw new Error(`Failed to create Stripe webhook endpoint: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ========== PHASE 5: SUBSCRIPTION MANAGEMENT ==========

  /**
   * Create subscription
   */
  async createSubscription(
    venueId: string,
    customer: string,
    priceId: string,
    metadata?: Record<string, string>
  ): Promise<Stripe.Subscription> {
    try {
      const stripe = await this.initializeClient(venueId);
      return await stripe.subscriptions.create({
        customer,
        items: [{ price: priceId }],
        metadata,
      });
    } catch (error) {
      console.error('Failed to create Stripe subscription:', error);
      throw new Error(`Failed to create Stripe subscription: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get subscriptions for a customer
   */
  async getSubscriptions(
    venueId: string,
    customerId?: string
  ): Promise<Stripe.Subscription[]> {
    try {
      const stripe = await this.initializeClient(venueId);
      const subscriptions: Stripe.Subscription[] = [];
      
      let hasMore = true;
      let startingAfter: string | undefined;

      while (hasMore) {
        const params: any = {
          limit: 100,
          starting_after: startingAfter,
        };

        if (customerId) {
          params.customer = customerId;
        }

        const response = await stripe.subscriptions.list(params);
        subscriptions.push(...response.data);

        hasMore = response.has_more;
        if (hasMore && response.data.length > 0) {
          startingAfter = response.data[response.data.length - 1].id;
        }
      }

      return subscriptions;
    } catch (error) {
      console.error('Failed to get Stripe subscriptions:', error);
      throw new Error(`Failed to get Stripe subscriptions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    venueId: string,
    subscriptionId: string,
    cancelAtPeriodEnd: boolean = false
  ): Promise<Stripe.Subscription> {
    try {
      const stripe = await this.initializeClient(venueId);
      
      if (cancelAtPeriodEnd) {
        return await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });
      } else {
        return await stripe.subscriptions.cancel(subscriptionId);
      }
    } catch (error) {
      console.error('Failed to cancel Stripe subscription:', error);
      throw new Error(`Failed to cancel Stripe subscription: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update subscription
   */
  async updateSubscription(
    venueId: string,
    subscriptionId: string,
    updates: Stripe.SubscriptionUpdateParams
  ): Promise<Stripe.Subscription> {
    try {
      const stripe = await this.initializeClient(venueId);
      return await stripe.subscriptions.update(subscriptionId, updates);
    } catch (error) {
      console.error('Failed to update Stripe subscription:', error);
      throw new Error(`Failed to update Stripe subscription: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ========== PHASE 5: DISPUTE HANDLING ==========

  /**
   * Get disputes
   */
  async getDisputes(venueId: string, startDate?: number): Promise<Stripe.Dispute[]> {
    try {
      const stripe = await this.initializeClient(venueId);
      const disputes: Stripe.Dispute[] = [];

      let hasMore = true;
      let startingAfter: string | undefined;

      while (hasMore) {
        const params: any = {
          limit: 100,
          starting_after: startingAfter,
        };

        if (startDate) {
          params.created = { gte: startDate };
        }

        const response = await stripe.disputes.list(params);
        disputes.push(...response.data);

        hasMore = response.has_more;
        if (hasMore && response.data.length > 0) {
          startingAfter = response.data[response.data.length - 1].id;
        }
      }

      return disputes;
    } catch (error) {
      console.error('Failed to get Stripe disputes:', error);
      throw new Error(`Failed to get Stripe disputes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update dispute with evidence
   */
  async updateDispute(
    venueId: string,
    disputeId: string,
    evidence: Stripe.DisputeUpdateParams.Evidence
  ): Promise<Stripe.Dispute> {
    try {
      const stripe = await this.initializeClient(venueId);
      return await stripe.disputes.update(disputeId, { evidence });
    } catch (error) {
      console.error('Failed to update Stripe dispute:', error);
      throw new Error(`Failed to update Stripe dispute: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Close dispute
   */
  async closeDispute(venueId: string, disputeId: string): Promise<Stripe.Dispute> {
    try {
      const stripe = await this.initializeClient(venueId);
      return await stripe.disputes.close(disputeId);
    } catch (error) {
      console.error('Failed to close Stripe dispute:', error);
      throw new Error(`Failed to close Stripe dispute: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ========== PHASE 5: PRODUCTS & PRICES ==========

  /**
   * Sync products to Stripe
   */
  async syncProductsToStripe(
    venueId: string,
    products: Array<{
      id?: string;
      name: string;
      description?: string;
      metadata?: Record<string, string>;
    }>
  ): Promise<StripeSyncResult> {
    const errors: Array<{ record: string; error: string }> = [];
    let recordsSynced = 0;

    try {
      const stripe = await this.initializeClient(venueId);

      for (const product of products) {
        try {
          if (product.id) {
            await stripe.products.update(product.id, {
              name: product.name,
              description: product.description,
              metadata: product.metadata,
            });
          } else {
            await stripe.products.create({
              name: product.name,
              description: product.description,
              metadata: product.metadata,
            });
          }
          recordsSynced++;
        } catch (error) {
          errors.push({
            record: product.name,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return {
        success: errors.length === 0,
        recordsSynced,
        errors,
      };
    } catch (error) {
      console.error('Stripe product sync failed:', error);
      throw new Error(`Stripe product sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get products from Stripe
   */
  async getProducts(venueId: string): Promise<Stripe.Product[]> {
    try {
      const stripe = await this.initializeClient(venueId);
      const products: Stripe.Product[] = [];

      let hasMore = true;
      let startingAfter: string | undefined;

      while (hasMore) {
        const response = await stripe.products.list({
          limit: 100,
          starting_after: startingAfter,
        });

        products.push(...response.data);

        hasMore = response.has_more;
        if (hasMore && response.data.length > 0) {
          startingAfter = response.data[response.data.length - 1].id;
        }
      }

      return products;
    } catch (error) {
      console.error('Failed to get Stripe products:', error);
      throw new Error(`Failed to get Stripe products: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const stripeSyncService = new StripeSyncService();
