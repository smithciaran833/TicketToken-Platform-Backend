import { IntegrationProvider, SyncResult } from '../provider.interface';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import axios from 'axios';
import crypto from 'crypto';

export class SquareProvider implements IntegrationProvider {
  name = 'square';
  private accessToken: string = '';
  private locationId: string = '';
  private baseUrl: string;
  
  constructor() {
    this.baseUrl = config.providers.square.sandbox
      ? 'https://connect.squareupsandbox.com/v2'
      : 'https://connect.squareup.com/v2';
  }

  async initialize(credentials: any): Promise<void> {
    this.accessToken = credentials.accessToken;
    this.locationId = credentials.locationId || '';
    logger.info('Square provider initialized');
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/merchants/me`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Square-Version': '2023-10-18'
        }
      });
      return response.status === 200;
    } catch (error) {
      logger.error('Square connection test failed', error);
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
        const catalogItem = this.mapProductToCatalogItem(product);
        
        await axios.post(
          `${this.baseUrl}/catalog/object`,
          {
            idempotency_key: `product-${product.id}-${Date.now()}`,
            object: catalogItem
          },
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Square-Version': '2023-10-18',
              'Content-Type': 'application/json'
            }
          }
        );
        
        syncedCount++;
      } catch (error: any) {
        failedCount++;
        errors.push({
          productId: product.id,
          error: error.message
        });
        logger.error('Failed to sync product to Square', { 
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

  async syncInventory(inventory: any[]): Promise<SyncResult> {
    const startTime = Date.now();
    let syncedCount = 0;
    let failedCount = 0;

    for (const item of inventory) {
      try {
        await axios.post(
          `${this.baseUrl}/inventory/batch-change`,
          {
            idempotency_key: `inventory-${item.id}-${Date.now()}`,
            changes: [
              {
                type: 'ADJUSTMENT',
                adjustment: {
                  catalog_object_id: item.catalogObjectId,
                  from_state: 'NONE',
                  to_state: 'IN_STOCK',
                  quantity: item.quantity.toString(),
                  occurred_at: new Date().toISOString(),
                  location_id: this.locationId
                }
              }
            ]
          },
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Square-Version': '2023-10-18'
            }
          }
        );
        
        syncedCount++;
      } catch (error) {
        failedCount++;
        logger.error('Failed to sync inventory to Square', error);
      }
    }

    return {
      success: failedCount === 0,
      syncedCount,
      failedCount,
      duration: Date.now() - startTime
    };
  }

  async fetchTransactions(startDate: Date, endDate: Date): Promise<any[]> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/payments/search`,
        {
          filter: {
            date_time_filter: {
              created_at: {
                start_at: startDate.toISOString(),
                end_at: endDate.toISOString()
              }
            }
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Square-Version': '2023-10-18'
          }
        }
      );

      const responseData = response.data as { payments?: any[] };
      return responseData.payments || [];
    } catch (error) {
      logger.error('Failed to fetch Square transactions', error);
      return [];
    }
  }

  validateWebhookSignature(payload: string, signature: string): boolean {
    // Square webhook signature validation using centralized config
    const webhookSignatureKey = config.providers.square.webhookSignatureKey;
    
    if (!webhookSignatureKey) {
      logger.warn('Square webhook signature key not configured, skipping verification');
      return false;
    }
    
    const hash = crypto
      .createHmac('sha256', webhookSignatureKey)
      .update(payload)
      .digest('base64');
    
    // Use timing-safe comparison
    try {
      return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  async handleWebhook(event: any): Promise<void> {
    logger.info('Handling Square webhook', { type: event.type });
    
    switch (event.type) {
      case 'payment.created':
        // Handle payment created
        break;
      case 'inventory.count.updated':
        // Handle inventory update
        break;
      case 'catalog.version.updated':
        // Handle catalog update
        break;
    }
  }

  getOAuthUrl(state: string): string {
    const clientId = config.providers.square.clientId;
    const baseUrl = config.providers.square.sandbox
      ? 'https://connect.squareupsandbox.com'
      : 'https://connect.squareup.com';
    
    const scopes = [
      'ITEMS_READ',
      'ITEMS_WRITE',
      'INVENTORY_READ',
      'INVENTORY_WRITE',
      'PAYMENTS_READ',
      'CUSTOMERS_READ',
      'CUSTOMERS_WRITE'
    ].join(' ');

    return `${baseUrl}/oauth2/authorize?client_id=${clientId}&scope=${scopes}&state=${state}`;
  }

  async exchangeCodeForToken(code: string): Promise<any> {
    const response = await axios.post(
      `${this.baseUrl}/oauth2/token`,
      {
        client_id: config.providers.square.clientId,
        client_secret: config.providers.square.clientSecret,
        code,
        grant_type: 'authorization_code'
      }
    );

    return response.data;
  }

  private mapProductToCatalogItem(product: any): any {
    return {
      type: 'ITEM',
      id: `#${product.id}`,
      item_data: {
        name: product.name,
        description: product.description,
        variations: [
          {
            type: 'ITEM_VARIATION',
            id: `#${product.id}-regular`,
            item_variation_data: {
              name: 'Regular',
              pricing_type: 'FIXED_PRICING',
              price_money: {
                amount: Math.round(product.price * 100),
                currency: 'USD'
              }
            }
          }
        ]
      }
    };
  }
}
