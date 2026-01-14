import axios from 'axios';
import { credentialEncryptionService } from '../credential-encryption.service';

export interface MailchimpContact {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  tags?: string[];
  status?: 'subscribed' | 'unsubscribed' | 'cleaned' | 'pending';
}

export interface MailchimpSyncResult {
  success: boolean;
  contactsSynced: number;
  errors: Array<{ contact: string; error: string }>;
}

export class MailchimpSyncService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;

  /**
   * Initialize Mailchimp API client with credentials
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async initializeClient(venueId: string): Promise<any> {
    if (this.client) {
      return this.client;
    }

    // Get API key from credential encryption service
    const credentials = await credentialEncryptionService.retrieveApiKeys(
      venueId,
      'mailchimp',
      'api_key'
    );

    if (!credentials) {
      throw new Error(`No Mailchimp credentials found for venue ${venueId}`);
    }

    // Extract datacenter from API key (format: xxxxx-usXX)
    const datacenter = credentials.apiKey.split('-')[1];
    if (!datacenter) {
      throw new Error('Invalid Mailchimp API key format');
    }

    this.client = axios.create({
      baseURL: `https://${datacenter}.api.mailchimp.com/3.0`,
      headers: {
        'Authorization': `Bearer ${credentials.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    return this.client;
  }

  /**
   * Sync contacts from TicketToken to Mailchimp
   */
  async syncContactsToMailchimp(
    venueId: string,
    listId: string,
    contacts: MailchimpContact[]
  ): Promise<MailchimpSyncResult> {
    const errors: Array<{ contact: string; error: string }> = [];
    let contactsSynced = 0;

    try {
      const client = await this.initializeClient(venueId);

      // Batch subscribe contacts (Mailchimp supports batch operations)
      const batchSize = 500; // Mailchimp limit
      for (let i = 0; i < contacts.length; i += batchSize) {
        const batch = contacts.slice(i, i + batchSize);
        
        const operations = batch.map((contact) => ({
          method: 'PUT',
          path: `/lists/${listId}/members/${this.getSubscriberHash(contact.email)}`,
          body: JSON.stringify({
            email_address: contact.email,
            status: contact.status || 'subscribed',
            merge_fields: {
              FNAME: contact.firstName || '',
              LNAME: contact.lastName || '',
              PHONE: contact.phone || '',
            },
            tags: contact.tags || [],
          }),
        }));

        try {
          const response = await client.post('/batches', {
            operations,
          });

          // Check batch operation results
          const batchId = response.data.id;
          await this.waitForBatchCompletion(client, batchId);
          
          contactsSynced += batch.length;
        } catch (error) {
          console.error('Mailchimp batch sync error:', error);
          batch.forEach((contact) => {
            errors.push({
              contact: contact.email,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          });
        }
      }

      return {
        success: errors.length === 0,
        contactsSynced,
        errors,
      };
    } catch (error) {
      console.error('Mailchimp sync failed:', error);
      throw new Error(`Mailchimp sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sync contacts from Mailchimp to TicketToken
   */
  async syncContactsFromMailchimp(
    venueId: string,
    listId: string
  ): Promise<MailchimpContact[]> {
    try {
      const client = await this.initializeClient(venueId);
      const contacts: MailchimpContact[] = [];

      let offset = 0;
      const count = 1000; // Max per request
      let hasMore = true;

      while (hasMore) {
        const response = await client.get(`/lists/${listId}/members`, {
          params: {
            count,
            offset,
            fields: 'members.email_address,members.merge_fields,members.status,members.tags,total_items',
          },
        });

        const members = response.data.members || [];
        members.forEach((member: any) => {
          contacts.push({
            email: member.email_address,
            firstName: member.merge_fields?.FNAME,
            lastName: member.merge_fields?.LNAME,
            phone: member.merge_fields?.PHONE,
            status: member.status,
            tags: member.tags?.map((tag: any) => tag.name) || [],
          });
        });

        offset += count;
        hasMore = members.length === count;
      }

      return contacts;
    } catch (error) {
      console.error('Mailchimp sync from failed:', error);
      throw new Error(`Mailchimp sync from failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get Mailchimp lists for a venue
   */
  async getLists(venueId: string): Promise<Array<{ id: string; name: string; memberCount: number }>> {
    try {
      const client = await this.initializeClient(venueId);
      
      const response = await client.get('/lists', {
        params: {
          fields: 'lists.id,lists.name,lists.stats.member_count',
          count: 1000,
        },
      });

      return (response.data.lists || []).map((list: any) => ({
        id: list.id,
        name: list.name,
        memberCount: list.stats?.member_count || 0,
      }));
    } catch (error) {
      console.error('Failed to get Mailchimp lists:', error);
      throw new Error(`Failed to get Mailchimp lists: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a new list in Mailchimp
   */
  async createList(
    venueId: string,
    name: string,
    fromEmail: string,
    fromName: string
  ): Promise<string> {
    try {
      const client = await this.initializeClient(venueId);
      
      const response = await client.post('/lists', {
        name,
        contact: {
          company: fromName,
          address1: '',
          city: '',
          state: '',
          zip: '',
          country: 'US',
        },
        permission_reminder: 'You signed up for updates',
        campaign_defaults: {
          from_name: fromName,
          from_email: fromEmail,
          subject: '',
          language: 'en',
        },
        email_type_option: true,
      });

      return response.data.id;
    } catch (error) {
      console.error('Failed to create Mailchimp list:', error);
      throw new Error(`Failed to create Mailchimp list: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify connection to Mailchimp
   */
  async verifyConnection(venueId: string): Promise<boolean> {
    try {
      const client = await this.initializeClient(venueId);
      await client.get('/ping');
      return true;
    } catch (error) {
      console.error('Mailchimp connection verification failed:', error);
      return false;
    }
  }

  /**
   * Generate MD5 hash for subscriber (Mailchimp requirement)
   */
  private getSubscriberHash(email: string): string {
    const crypto = require('crypto');
    return crypto
      .createHash('md5')
      .update(email.toLowerCase())
      .digest('hex');
  }

  /**
   * Wait for batch operation to complete
   */
  private async waitForBatchCompletion(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: any,
    batchId: string,
    maxWaitTime: number = 30000
  ): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 1000; // 1 second

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await client.get(`/batches/${batchId}`);
        const status = response.data.status;

        if (status === 'finished') {
          return;
        }

        if (status === 'failed') {
          throw new Error('Batch operation failed');
        }

        // Wait before polling again
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error) {
        console.error('Error checking batch status:', error);
        throw error;
      }
    }

    throw new Error('Batch operation timed out');
  }
}

// Export singleton instance
export const mailchimpSyncService = new MailchimpSyncService();
