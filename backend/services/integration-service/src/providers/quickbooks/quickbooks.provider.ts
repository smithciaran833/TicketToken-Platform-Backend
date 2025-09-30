import { IntegrationProvider, SyncResult } from '../provider.interface';
import { logger } from '../../utils/logger';
import axios from 'axios';

export class QuickBooksProvider implements IntegrationProvider {
  name = 'quickbooks';
  private accessToken: string = '';
  private realmId: string = '';
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.QUICKBOOKS_SANDBOX === 'true'
      ? 'https://sandbox-quickbooks.api.intuit.com/v3'
      : 'https://quickbooks.api.intuit.com/v3';
  }

  async initialize(credentials: any): Promise<void> {
    this.accessToken = credentials.accessToken;
    this.realmId = credentials.realmId || '';
    logger.info('QuickBooks provider initialized');
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/company/${this.realmId}/companyinfo/${this.realmId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Accept': 'application/json'
          }
        }
      );
      return response.status === 200;
    } catch (error) {
      logger.error('QuickBooks connection test failed', error);
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
        const item = {
          Name: product.name,
          Type: 'Service',
          IncomeAccountRef: {
            value: '1' // Default income account
          },
          Description: product.description,
          UnitPrice: product.price,
          Sku: product.sku || product.id
        };

        await axios.post(
          `${this.baseUrl}/company/${this.realmId}/item`,
          item,
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Accept': 'application/json',
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
        logger.error('Failed to sync product to QuickBooks', {
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

  async syncCustomers(customers: any[]): Promise<SyncResult> {
    const startTime = Date.now();
    let syncedCount = 0;
    let failedCount = 0;

    for (const customer of customers) {
      try {
        const qbCustomer = {
          DisplayName: customer.name,
          PrimaryEmailAddr: {
            Address: customer.email
          },
          PrimaryPhone: customer.phone ? {
            FreeFormNumber: customer.phone
          } : undefined,
          CompanyName: customer.company,
          BillAddr: customer.address ? {
            Line1: customer.address.line1,
            City: customer.address.city,
            CountrySubDivisionCode: customer.address.state,
            PostalCode: customer.address.zip
          } : undefined
        };

        await axios.post(
          `${this.baseUrl}/company/${this.realmId}/customer`,
          qbCustomer,
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          }
        );

        syncedCount++;
      } catch (error) {
        failedCount++;
        logger.error('Failed to sync customer to QuickBooks', error);
      }
    }

    return {
      success: failedCount === 0,
      syncedCount,
      failedCount,
      duration: Date.now() - startTime
    };
  }

  async syncTransactions(transactions: any[]): Promise<SyncResult> {
    const startTime = Date.now();
    let syncedCount = 0;
    let failedCount = 0;

    for (const transaction of transactions) {
      try {
        const invoice = {
          Line: transaction.items.map((item: any) => ({
            Amount: item.amount,
            DetailType: 'SalesItemLineDetail',
            SalesItemLineDetail: {
              ItemRef: {
                value: item.itemId,
                name: item.name
              }
            }
          })),
          CustomerRef: {
            value: transaction.customerId
          },
          DueDate: transaction.dueDate
        };

        await axios.post(
          `${this.baseUrl}/company/${this.realmId}/invoice`,
          invoice,
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          }
        );

        syncedCount++;
      } catch (error) {
        failedCount++;
        logger.error('Failed to sync transaction to QuickBooks', error);
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
      // SECURITY FIX: Use QuickBooks API parameters instead of building SQL-like query
      if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
        throw new Error('Invalid date parameters');
      }
      
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDateStr) || !dateRegex.test(endDateStr)) {
        throw new Error('Invalid date format');
      }
      
      // Use QuickBooks filter parameters directly - no string concatenation
      const response = await axios.get(
        `${this.baseUrl}/company/${this.realmId}/invoice`,
        {
          params: {
            mindate: startDateStr,
            maxdate: endDateStr
          },
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      return response.data.QueryResponse?.Invoice || [];
    } catch (error) {
      logger.error('Failed to fetch QuickBooks transactions', error);
      return [];
    }
  }

  getOAuthUrl(state: string): string {
    const clientId = process.env.QUICKBOOKS_CLIENT_ID;
    const redirectUri = `${process.env.API_URL}/api/v1/integrations/oauth/callback/quickbooks`;
    const scope = 'com.intuit.quickbooks.accounting';

    return `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scope}&redirect_uri=${redirectUri}&response_type=code&state=${state}`;
  }

  async exchangeCodeForToken(code: string): Promise<any> {
    const response = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.API_URL}/api/v1/integrations/oauth/callback/quickbooks`
      }),
      {
        auth: {
          username: process.env.QUICKBOOKS_CLIENT_ID || '',
          password: process.env.QUICKBOOKS_CLIENT_SECRET || ''
        }
      }
    );

    return response.data;
  }

  async refreshToken(refreshToken: string): Promise<any> {
    const response = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }),
      {
        auth: {
          username: process.env.QUICKBOOKS_CLIENT_ID || '',
          password: process.env.QUICKBOOKS_CLIENT_SECRET || ''
        }
      }
    );

    return response.data;
  }

  validateWebhookSignature(payload: string, signature: string): boolean {
    const crypto = require('crypto');
    const webhookToken = process.env.QUICKBOOKS_WEBHOOK_TOKEN || '';

    const hash = crypto
      .createHmac('sha256', webhookToken)
      .update(payload)
      .digest('base64');

    return hash === signature;
  }

  async handleWebhook(event: any): Promise<void> {
    logger.info('Handling QuickBooks webhook', {
      eventType: event.eventNotifications?.[0]?.eventType
    });

    for (const notification of event.eventNotifications || []) {
      switch (notification.eventType) {
        case 'CREATE':
          // Handle entity creation
          break;
        case 'UPDATE':
          // Handle entity update
          break;
        case 'DELETE':
          // Handle entity deletion
          break;
      }
    }
  }
}
