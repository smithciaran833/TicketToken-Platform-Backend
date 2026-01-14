import axios from 'axios';
import { credentialEncryptionService } from '../credential-encryption.service';
import { config } from '../../config';

export interface SquareCustomer {
  id?: string;
  givenName?: string;
  familyName?: string;
  emailAddress?: string;
  phoneNumber?: string;
  companyName?: string;
  note?: string;
  referenceId?: string;
}

export interface SquareOrder {
  id?: string;
  locationId: string;
  referenceId?: string;
  customerId?: string;
  lineItems: Array<{
    name: string;
    quantity: string;
    basePriceMoney: {
      amount: number;
      currency: string;
    };
    note?: string;
  }>;
  state?: string;
  totalMoney?: {
    amount: number;
    currency: string;
  };
}

export interface SquareInventory {
  catalogObjectId: string;
  locationId: string;
  quantity?: string;
  occurredAt?: string;
}

export interface SquareSyncResult {
  success: boolean;
  recordsSynced: number;
  errors: Array<{ record: string; error: string }>;
}

export class SquareSyncService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;
  private locationId: string | null = null;

  /**
   * Initialize Square API client with credentials
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async initializeClient(venueId: string): Promise<any> {
    if (this.client && this.locationId) {
      return this.client;
    }

    // Get access token from credential encryption service
    const credentials = await credentialEncryptionService.retrieveApiKeys(
      venueId,
      'square',
      'access_token'
    );

    if (!credentials) {
      throw new Error(`No Square credentials found for venue ${venueId}`);
    }

    const baseURL = config.providers.square.environment === 'sandbox'
      ? 'https://connect.squareupsandbox.com'
      : 'https://connect.squareup.com';

    this.client = axios.create({
      baseURL: `${baseURL}/v2`,
      headers: {
        'Authorization': `Bearer ${credentials.apiKey}`,
        'Content-Type': 'application/json',
        'Square-Version': '2023-12-13',
      },
      timeout: 30000,
    });

    // Get location ID (first location by default)
    const locationsResponse = await this.client.get('/locations');
    const locations = locationsResponse.data.locations || [];
    
    if (locations.length === 0) {
      throw new Error('No Square locations found');
    }
    
    this.locationId = locations[0].id;

    return this.client;
  }

  /**
   * Sync customers to Square
   */
  async syncCustomersToSquare(
    venueId: string,
    customers: SquareCustomer[]
  ): Promise<SquareSyncResult> {
    const errors: Array<{ record: string; error: string }> = [];
    let recordsSynced = 0;

    try {
      const client = await this.initializeClient(venueId);

      for (const customer of customers) {
        try {
          if (customer.id) {
            // Update existing customer
            await client.put(`/customers/${customer.id}`, { customer });
          } else {
            // Create new customer
            await client.post('/customers', {
              idempotencyKey: `${venueId}-${Date.now()}-${Math.random()}`,
              customer,
            });
          }
          recordsSynced++;
        } catch (error) {
          console.error('Square customer sync error:', error);
          errors.push({
            record: customer.emailAddress || customer.id || 'Unknown',
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
      console.error('Square sync failed:', error);
      throw new Error(`Square sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sync customers from Square
   */
  async syncCustomersFromSquare(venueId: string): Promise<SquareCustomer[]> {
    try {
      const client = await this.initializeClient(venueId);
      const customers: SquareCustomer[] = [];

      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const response = await client.post('/customers/search', {
          limit: 100,
          cursor,
        });

        const data = response.data;
        const fetchedCustomers = data.customers || [];

        customers.push(...fetchedCustomers.map((c: any) => ({
          id: c.id,
          givenName: c.given_name,
          familyName: c.family_name,
          emailAddress: c.email_address,
          phoneNumber: c.phone_number,
          companyName: c.company_name,
          note: c.note,
          referenceId: c.reference_id,
        })));

        cursor = data.cursor;
        hasMore = !!cursor;
      }

      return customers;
    } catch (error) {
      console.error('Square sync from failed:', error);
      throw new Error(`Square sync from failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sync orders to Square
   */
  async syncOrdersToSquare(
    venueId: string,
    orders: SquareOrder[]
  ): Promise<SquareSyncResult> {
    const errors: Array<{ record: string; error: string }> = [];
    let recordsSynced = 0;

    try {
      const client = await this.initializeClient(venueId);

      for (const order of orders) {
        try {
          if (order.id) {
            // Update existing order
            await client.put(`/orders/${order.id}`, {
              order,
            });
          } else {
            // Create new order
            await client.post('/orders', {
              idempotencyKey: `${venueId}-${Date.now()}-${Math.random()}`,
              order: {
                ...order,
                locationId: order.locationId || this.locationId,
              },
            });
          }
          recordsSynced++;
        } catch (error) {
          console.error('Square order sync error:', error);
          errors.push({
            record: order.referenceId || order.id || 'Unknown',
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
      console.error('Square order sync failed:', error);
      throw new Error(`Square order sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sync orders from Square
   */
  async syncOrdersFromSquare(
    venueId: string,
    startDate?: string
  ): Promise<SquareOrder[]> {
    try {
      const client = await this.initializeClient(venueId);
      const orders: SquareOrder[] = [];

      const query: any = {
        location_ids: [this.locationId],
        limit: 100,
      };

      if (startDate) {
        query.query = {
          filter: {
            date_time_filter: {
              created_at: {
                start_at: startDate,
              },
            },
          },
        };
      }

      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const response = await client.post('/orders/search', {
          ...query,
          cursor,
        });

        const data = response.data;
        const fetchedOrders = data.orders || [];

        orders.push(...fetchedOrders);

        cursor = data.cursor;
        hasMore = !!cursor;
      }

      return orders;
    } catch (error) {
      console.error('Square order sync from failed:', error);
      throw new Error(`Square order sync from failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update inventory in Square
   */
  async updateInventory(
    venueId: string,
    inventoryChanges: SquareInventory[]
  ): Promise<SquareSyncResult> {
    const errors: Array<{ record: string; error: string }> = [];
    let recordsSynced = 0;

    try {
      const client = await this.initializeClient(venueId);

      // Batch inventory updates
      const batchSize = 100;
      for (let i = 0; i < inventoryChanges.length; i += batchSize) {
        const batch = inventoryChanges.slice(i, i + batchSize);

        try {
          await client.post('/inventory/changes/batch-create', {
            idempotencyKey: `${venueId}-${Date.now()}-${i}`,
            changes: batch.map((item) => ({
              type: 'ADJUSTMENT',
              adjustment: {
                catalog_object_id: item.catalogObjectId,
                from_state: 'IN_STOCK',
                to_state: 'IN_STOCK',
                location_id: item.locationId || this.locationId,
                quantity: item.quantity,
                occurred_at: item.occurredAt || new Date().toISOString(),
              },
            })),
          });

          recordsSynced += batch.length;
        } catch (error) {
          console.error('Square inventory sync error:', error);
          batch.forEach((item) => {
            errors.push({
              record: item.catalogObjectId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          });
        }
      }

      return {
        success: errors.length === 0,
        recordsSynced,
        errors,
      };
    } catch (error) {
      console.error('Square inventory sync failed:', error);
      throw new Error(`Square inventory sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get inventory counts from Square
   */
  async getInventoryCounts(venueId: string, catalogObjectIds: string[]): Promise<any[]> {
    try {
      const client = await this.initializeClient(venueId);

      // Batch retrieve inventory
      const batchSize = 100;
      const allInventory: any[] = [];

      for (let i = 0; i < catalogObjectIds.length; i += batchSize) {
        const batch = catalogObjectIds.slice(i, i + batchSize);

        const response = await client.post('/inventory/counts/batch-retrieve', {
          catalog_object_ids: batch,
          location_ids: [this.locationId],
        });

        allInventory.push(...(response.data.counts || []));
      }

      return allInventory;
    } catch (error) {
      console.error('Failed to get Square inventory:', error);
      throw new Error(`Failed to get Square inventory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get locations
   */
  async getLocations(venueId: string): Promise<any[]> {
    try {
      const client = await this.initializeClient(venueId);
      const response = await client.get('/locations');
      return response.data.locations || [];
    } catch (error) {
      console.error('Failed to get Square locations:', error);
      throw new Error(`Failed to get Square locations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify connection to Square
   */
  async verifyConnection(venueId: string): Promise<boolean> {
    try {
      await this.getLocations(venueId);
      return true;
    } catch (error) {
      console.error('Square connection verification failed:', error);
      return false;
    }
  }

  /**
   * Process webhook event
   */
  async processWebhookEvent(eventType: string, eventData: any): Promise<void> {
    console.log(`Processing Square webhook event: ${eventType}`);

    switch (eventType) {
      case 'customer.created':
      case 'customer.updated':
        // Handle customer events
        console.log('Customer event:', eventData);
        break;

      case 'order.created':
      case 'order.updated':
        // Handle order events
        console.log('Order event:', eventData);
        break;

      case 'payment.created':
      case 'payment.updated':
        // Handle payment events
        console.log('Payment event:', eventData);
        break;

      case 'inventory.count.updated':
        // Handle inventory events
        console.log('Inventory event:', eventData);
        break;

      default:
        console.log('Unhandled event type:', eventType);
    }
  }

  // ========== PHASE 5: LOYALTY PROGRAM ==========

  /**
   * Create loyalty account for customer
   */
  async createLoyaltyAccount(
    venueId: string,
    programId: string,
    customerId: string
  ): Promise<any> {
    try {
      const client = await this.initializeClient(venueId);
      
      const response = await client.post('/loyalty/accounts', {
        idempotency_key: `${venueId}-${customerId}-${Date.now()}`,
        loyalty_account: {
          program_id: programId,
          mapping: {
            type: 'CUSTOMER',
            value: customerId,
          },
        },
      });

      return response.data.loyalty_account;
    } catch (error) {
      console.error('Failed to create Square loyalty account:', error);
      throw new Error(`Failed to create Square loyalty account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get loyalty account for customer
   */
  async getLoyaltyAccount(venueId: string, customerId: string): Promise<any> {
    try {
      const client = await this.initializeClient(venueId);
      
      const response = await client.post('/loyalty/accounts/search', {
        query: {
          mappings: [
            {
              type: 'CUSTOMER',
              value: customerId,
            },
          ],
        },
      });

      const accounts = response.data.loyalty_accounts || [];
      return accounts.length > 0 ? accounts[0] : null;
    } catch (error) {
      console.error('Failed to get Square loyalty account:', error);
      throw new Error(`Failed to get Square loyalty account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Accumulate loyalty points
   */
  async accumulateLoyaltyPoints(
    venueId: string,
    accountId: string,
    orderId: string,
    points: number
  ): Promise<any> {
    try {
      const client = await this.initializeClient(venueId);
      
      const response = await client.post(`/loyalty/accounts/${accountId}/accumulate`, {
        idempotency_key: `${venueId}-${orderId}-${Date.now()}`,
        accumulate_points: {
          order_id: orderId,
          points,
        },
        location_id: this.locationId,
      });

      return response.data.event;
    } catch (error) {
      console.error('Failed to accumulate Square loyalty points:', error);
      throw new Error(`Failed to accumulate Square loyalty points: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Redeem loyalty points
   */
  async redeemLoyaltyPoints(
    venueId: string,
    accountId: string,
    rewardId: string,
    orderId: string
  ): Promise<any> {
    try {
      const client = await this.initializeClient(venueId);
      
      const response = await client.post(`/loyalty/accounts/${accountId}/redeem`, {
        idempotency_key: `${venueId}-${orderId}-${Date.now()}`,
        redeem_points: {
          reward_id: rewardId,
          order_id: orderId,
        },
        location_id: this.locationId,
      });

      return response.data.event;
    } catch (error) {
      console.error('Failed to redeem Square loyalty points:', error);
      throw new Error(`Failed to redeem Square loyalty points: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get loyalty programs
   */
  async getLoyaltyPrograms(venueId: string): Promise<any[]> {
    try {
      const client = await this.initializeClient(venueId);
      const response = await client.get('/loyalty/programs');
      return response.data.programs || [];
    } catch (error) {
      console.error('Failed to get Square loyalty programs:', error);
      throw new Error(`Failed to get Square loyalty programs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ========== PHASE 5: CATALOG MANAGEMENT ==========

  /**
   * Create or update catalog objects (products)
   */
  async upsertCatalogObjects(
    venueId: string,
    catalogObjects: Array<{
      type: string;
      id?: string;
      itemData?: any;
      categoryData?: any;
    }>
  ): Promise<SquareSyncResult> {
    const errors: Array<{ record: string; error: string }> = [];
    let recordsSynced = 0;

    try {
      const client = await this.initializeClient(venueId);

      // Batch upsert catalog objects
      const batchSize = 1000; // Square allows up to 1000 objects per batch
      for (let i = 0; i < catalogObjects.length; i += batchSize) {
        const batch = catalogObjects.slice(i, i + batchSize);

        try {
          await client.post('/catalog/batch-upsert', {
            idempotency_key: `${venueId}-${Date.now()}-${i}`,
            batches: [{
              objects: batch.map((obj) => ({
                type: obj.type,
                id: obj.id || `#temp-${i}-${Math.random()}`,
                item_data: obj.itemData,
                category_data: obj.categoryData,
              })),
            }],
          });

          recordsSynced += batch.length;
        } catch (error) {
          console.error('Square catalog upsert error:', error);
          batch.forEach((obj) => {
            errors.push({
              record: obj.id || 'Unknown',
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          });
        }
      }

      return {
        success: errors.length === 0,
        recordsSynced,
        errors,
      };
    } catch (error) {
      console.error('Square catalog upsert failed:', error);
      throw new Error(`Square catalog upsert failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search catalog objects
   */
  async searchCatalogObjects(
    venueId: string,
    objectTypes: string[],
    query?: string
  ): Promise<any[]> {
    try {
      const client = await this.initializeClient(venueId);
      const catalogObjects: any[] = [];

      const searchQuery: any = {
        object_types: objectTypes,
        limit: 100,
      };

      if (query) {
        searchQuery.query = {
          text_query: {
            keywords: [query],
          },
        };
      }

      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const response = await client.post('/catalog/search', {
          ...searchQuery,
          cursor,
        });

        const data = response.data;
        const objects = data.objects || [];

        catalogObjects.push(...objects);

        cursor = data.cursor;
        hasMore = !!cursor;
      }

      return catalogObjects;
    } catch (error) {
      console.error('Failed to search Square catalog:', error);
      throw new Error(`Failed to search Square catalog: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get catalog object by ID
   */
  async getCatalogObject(venueId: string, objectId: string): Promise<any> {
    try {
      const client = await this.initializeClient(venueId);
      const response = await client.get(`/catalog/object/${objectId}`);
      return response.data.object;
    } catch (error) {
      console.error('Failed to get Square catalog object:', error);
      throw new Error(`Failed to get Square catalog object: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete catalog object
   */
  async deleteCatalogObject(venueId: string, objectId: string): Promise<void> {
    try {
      const client = await this.initializeClient(venueId);
      await client.delete(`/catalog/object/${objectId}`);
    } catch (error) {
      console.error('Failed to delete Square catalog object:', error);
      throw new Error(`Failed to delete Square catalog object: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ========== PHASE 5: PAYMENTS ==========

  /**
   * Create payment
   */
  async createPayment(
    venueId: string,
    sourceId: string,
    amount: number,
    currency: string = 'USD',
    customerId?: string,
    orderId?: string
  ): Promise<any> {
    try {
      const client = await this.initializeClient(venueId);
      
      const response = await client.post('/payments', {
        idempotency_key: `${venueId}-${Date.now()}-${Math.random()}`,
        source_id: sourceId,
        amount_money: {
          amount,
          currency,
        },
        location_id: this.locationId,
        customer_id: customerId,
        order_id: orderId,
      });

      return response.data.payment;
    } catch (error) {
      console.error('Failed to create Square payment:', error);
      throw new Error(`Failed to create Square payment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get payments
   */
  async getPayments(venueId: string, beginTime?: string, endTime?: string): Promise<any[]> {
    try {
      const client = await this.initializeClient(venueId);
      const payments: any[] = [];

      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const params: any = {
          location_id: this.locationId,
          limit: 100,
        };

        if (beginTime) params.begin_time = beginTime;
        if (endTime) params.end_time = endTime;
        if (cursor) params.cursor = cursor;

        const response = await client.get('/payments', { params });

        const data = response.data;
        const fetchedPayments = data.payments || [];

        payments.push(...fetchedPayments);

        cursor = data.cursor;
        hasMore =!!cursor;
      }

      return payments;
    } catch (error) {
      console.error('Failed to get Square payments:', error);
      throw new Error(`Failed to get Square payments: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const squareSyncService = new SquareSyncService();
