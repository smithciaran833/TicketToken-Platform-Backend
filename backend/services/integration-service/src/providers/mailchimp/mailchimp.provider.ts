import { IntegrationProvider, SyncResult } from '../provider.interface';
import { logger } from '../../utils/logger';
import axios from 'axios';
import crypto from 'crypto';

export class MailchimpProvider implements IntegrationProvider {
  name = 'mailchimp';
  private apiKey: string = '';
  private serverPrefix: string = '';
  private baseUrl: string = '';
  private listId: string = '';
  
  async initialize(credentials: any): Promise<void> {
    this.apiKey = credentials.apiKey;
    this.listId = credentials.listId || '';
    
    // Extract server prefix from API key
    this.serverPrefix = this.apiKey.split('-')[1] || 'us1';
    this.baseUrl = `https://${this.serverPrefix}.api.mailchimp.com/3.0`;
    
    logger.info('Mailchimp provider initialized');
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/ping`, {
        auth: {
          username: 'anystring',
          password: this.apiKey
        }
      });
      return response.data.health_status === "Everything's Chimpy!";
    } catch (error) {
      logger.error('Mailchimp connection test failed', error);
      return false;
    }
  }

  async syncCustomers(customers: any[]): Promise<SyncResult> {
    const startTime = Date.now();
    let syncedCount = 0;
    let failedCount = 0;
    const errors: any[] = [];

    // Batch operations for efficiency
    const batches = this.chunkArray(customers, 500);
    
    for (const batch of batches) {
      const operations = batch.map(customer => ({
        method: 'PUT',
        path: `/lists/${this.listId}/members/${this.getSubscriberHash(customer.email)}`,
        body: JSON.stringify({
          email_address: customer.email,
          status: customer.subscribed ? 'subscribed' : 'unsubscribed',
          merge_fields: {
            FNAME: customer.firstName || '',
            LNAME: customer.lastName || ''
          },
          tags: customer.tags || []
        })
      }));

      try {
        const response = await axios.post(
          `${this.baseUrl}/batches`,
          { operations },
          {
            auth: {
              username: 'anystring',
              password: this.apiKey
            }
          }
        );
        
        syncedCount += batch.length;
        logger.info('Mailchimp batch synced', { 
          batchId: response.data.id,
          count: batch.length 
        });
      } catch (error: any) {
        failedCount += batch.length;
        errors.push({
          batch: 'batch',
          error: error.message
        });
        logger.error('Failed to sync batch to Mailchimp', error);
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

  async fetchCustomers(): Promise<any[]> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/lists/${this.listId}/members`,
        {
          params: {
            count: 1000,
            offset: 0
          },
          auth: {
            username: 'anystring',
            password: this.apiKey
          }
        }
      );

      return response.data.members || [];
    } catch (error) {
      logger.error('Failed to fetch Mailchimp customers', error);
      return [];
    }
  }

  async createCampaign(campaignData: any): Promise<any> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/campaigns`,
        {
          type: 'regular',
          recipients: {
            list_id: this.listId,
            segment_opts: campaignData.segmentOpts
          },
          settings: {
            subject_line: campaignData.subject,
            from_name: campaignData.fromName,
            reply_to: campaignData.replyTo,
            title: campaignData.title
          }
        },
        {
          auth: {
            username: 'anystring',
            password: this.apiKey
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Failed to create Mailchimp campaign', error);
      throw error;
    }
  }

  validateWebhookSignature(_payload: string, _signature: string): boolean {
    // Mailchimp doesn't use signature validation in the same way
    // Implementation would depend on your webhook setup
    return true;
  }

  async handleWebhook(event: any): Promise<void> {
    logger.info('Handling Mailchimp webhook', { type: event.type });
    
    switch (event.type) {
      case 'subscribe':
        // Handle new subscription
        break;
      case 'unsubscribe':
        // Handle unsubscribe
        break;
      case 'campaign':
        // Handle campaign event
        break;
    }
  }

  getOAuthUrl(state: string): string {
    const clientId = process.env.MAILCHIMP_CLIENT_ID;
    return `https://login.mailchimp.com/oauth2/authorize?response_type=code&client_id=${clientId}&state=${state}`;
  }

  async exchangeCodeForToken(code: string): Promise<any> {
    const response = await axios.post(
      'https://login.mailchimp.com/oauth2/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.MAILCHIMP_CLIENT_ID || '',
        client_secret: process.env.MAILCHIMP_CLIENT_SECRET || '',
        code,
        redirect_uri: `${process.env.API_URL}/api/v1/integrations/oauth/callback/mailchimp`
      })
    );

    return response.data;
  }

  private getSubscriberHash(email: string): string {
    return crypto.createHash('md5').update(email.toLowerCase()).digest('hex');
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
