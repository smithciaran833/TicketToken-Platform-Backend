import { IntegrationProvider, SyncResult } from '../provider.interface';
import { logger } from '../../utils/logger';
import Stripe from 'stripe';

export class StripeProvider implements IntegrationProvider {
  name = 'stripe';
  private stripe: Stripe;
  
  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2022-11-15'
    });
  }

  async initialize(credentials: any): Promise<void> {
    if (credentials.secretKey) {
      this.stripe = new Stripe(credentials.secretKey, {
        apiVersion: '2022-11-15'
      });
    }
    logger.info('Stripe provider initialized');
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.stripe.accounts.retrieve();
      return true;
    } catch (error) {
      logger.error('Stripe connection test failed', error);
      return false;
    }
  }

  async syncProducts(products: any[]): Promise<SyncResult> {
    const startTime = Date.now();
    let syncedCount = 0;
    let failedCount = 0;
    const errors: any[] = [];

    for (const product of products) {
      try {
        // Check if product exists
        let stripeProduct;
        try {
          stripeProduct = await this.stripe.products.retrieve(product.id);
          // Update existing
          stripeProduct = await this.stripe.products.update(product.id, {
            name: product.name,
            description: product.description,
            metadata: {
              venue_product_id: product.id
            }
          });
        } catch {
          // Create new
          stripeProduct = await this.stripe.products.create({
            id: product.id,
            name: product.name,
            description: product.description,
            metadata: {
              venue_product_id: product.id
            }
          });
        }

        // Create or update price
        await this.stripe.prices.create({
          product: stripeProduct.id,
          unit_amount: Math.round(product.price * 100),
          currency: 'usd',
          metadata: {
            venue_price_id: `${product.id}_price`
          }
        });

        syncedCount++;
      } catch (error: any) {
        failedCount++;
        errors.push({
          productId: product.id,
          error: error.message
        });
        logger.error('Failed to sync product to Stripe', { 
          productId: product.id, 
          error 
        });
      }
    }

    return {
      success: failedCount === 0,
      syncedCount,
      failedCount,
      errors,
      duration: Date.now() - startTime
    };
  }

  async fetchTransactions(startDate: Date, endDate: Date): Promise<any[]> {
    try {
      const charges = await this.stripe.charges.list({
        created: {
          gte: Math.floor(startDate.getTime() / 1000),
          lte: Math.floor(endDate.getTime() / 1000)
        },
        limit: 100
      });

      return charges.data;
    } catch (error) {
      logger.error('Failed to fetch Stripe transactions', error);
      return [];
    }
  }

  async syncCustomers(customers: any[]): Promise<SyncResult> {
    const startTime = Date.now();
    let syncedCount = 0;
    let failedCount = 0;

    for (const customer of customers) {
      try {
        await this.stripe.customers.create({
          email: customer.email,
          name: customer.name,
          metadata: {
            venue_customer_id: customer.id
          }
        });
        syncedCount++;
      } catch (error) {
        failedCount++;
        logger.error('Failed to sync customer to Stripe', error);
      }
    }

    return {
      success: failedCount === 0,
      syncedCount,
      failedCount,
      duration: Date.now() - startTime
    };
  }

  validateWebhookSignature(payload: string, signature: string): boolean {
    try {
      const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
      this.stripe.webhooks.constructEvent(payload, signature, endpointSecret);
      return true;
    } catch {
      return false;
    }
  }

  async handleWebhook(event: any): Promise<void> {
    logger.info('Handling Stripe webhook', { type: event.type });
    
    switch (event.type) {
      case 'payment_intent.succeeded':
        // Handle successful payment
        break;
      case 'customer.created':
        // Handle new customer
        break;
      case 'charge.refunded':
        // Handle refund
        break;
    }
  }
}
