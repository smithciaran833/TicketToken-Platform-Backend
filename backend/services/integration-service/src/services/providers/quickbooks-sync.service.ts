import axios from 'axios';
import { credentialEncryptionService } from '../credential-encryption.service';
import { config } from '../../config';

export interface QuickBooksCustomer {
  id?: string;
  displayName: string;
  givenName?: string;
  familyName?: string;
  companyName?: string;
  primaryEmailAddr?: string;
  primaryPhone?: string;
  billAddr?: {
    line1?: string;
    city?: string;
    countrySubDivisionCode?: string;
    postalCode?: string;
  };
}

export interface QuickBooksInvoice {
  id?: string;
  docNumber?: string;
  customerRef: { value: string };
  txnDate: string;
  dueDate?: string;
  totalAmt: number;
  balance: number;
  line: Array<{
    detailType: 'SalesItemLineDetail';
    amount: number;
    description?: string;
    salesItemLineDetail: {
      itemRef: { value: string };
      qty?: number;
      unitPrice?: number;
    };
  }>;
}

export interface QuickBooksPayment {
  id?: string;
  customerRef: { value: string };
  totalAmt: number;
  txnDate: string;
  paymentMethodRef?: { value: string };
  privateNote?: string;
}

export interface QuickBooksSyncResult {
  success: boolean;
  recordsSynced: number;
  errors: Array<{ record: string; error: string }>;
}

export class QuickBooksSyncService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;
  private realmId: string | null = null;

  /**
   * Initialize QuickBooks API client with OAuth credentials
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async initializeClient(venueId: string): Promise<any> {
    if (this.client && this.realmId) {
      return this.client;
    }

    // Get OAuth tokens from credential encryption service
    const credentials = await credentialEncryptionService.retrieveOAuthTokens(
      venueId,
      'quickbooks'
    );

    if (!credentials) {
      throw new Error(`No QuickBooks credentials found for venue ${venueId}`);
    }

    // Get realm ID from venue configuration (stored in metadata)
    // In production, this would come from venue_integrations table
    this.realmId = config.providers.quickbooks.realmId;

    const baseURL = config.providers.quickbooks.sandbox
      ? 'https://sandbox-quickbooks.api.intuit.com'
      : 'https://quickbooks.api.intuit.com';

    this.client = axios.create({
      baseURL: `${baseURL}/v3/company/${this.realmId}`,
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    return this.client;
  }

  /**
   * Sync customers to QuickBooks
   */
  async syncCustomersToQuickBooks(
    venueId: string,
    customers: QuickBooksCustomer[]
  ): Promise<QuickBooksSyncResult> {
    const errors: Array<{ record: string; error: string }> = [];
    let recordsSynced = 0;

    try {
      const client = await this.initializeClient(venueId);

      for (const customer of customers) {
        try {
          if (customer.id) {
            // Update existing customer
            await client.post('/customer', {
              ...customer,
              sparse: true,
            });
          } else {
            // Create new customer
            await client.post('/customer', customer);
          }
          recordsSynced++;
        } catch (error) {
          console.error('QuickBooks customer sync error:', error);
          errors.push({
            record: customer.displayName,
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
      console.error('QuickBooks sync failed:', error);
      throw new Error(`QuickBooks sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sync customers from QuickBooks
   */
  async syncCustomersFromQuickBooks(venueId: string): Promise<QuickBooksCustomer[]> {
    try {
      const client = await this.initializeClient(venueId);
      const customers: QuickBooksCustomer[] = [];

      let startPosition = 1;
      const maxResults = 1000;
      let hasMore = true;

      while (hasMore) {
        const response = await client.get('/query', {
          params: {
            query: `SELECT * FROM Customer STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`,
          },
        });

        const queryResponse = response.data.QueryResponse;
        const fetchedCustomers = queryResponse?.Customer || [];

        customers.push(...fetchedCustomers.map((c: any) => ({
          id: c.Id,
          displayName: c.DisplayName,
          givenName: c.GivenName,
          familyName: c.FamilyName,
          companyName: c.CompanyName,
          primaryEmailAddr: c.PrimaryEmailAddr?.Address,
          primaryPhone: c.PrimaryPhone?.FreeFormNumber,
          billAddr: c.BillAddr,
        })));

        hasMore = fetchedCustomers.length === maxResults;
        startPosition += maxResults;
      }

      return customers;
    } catch (error) {
      console.error('QuickBooks sync from failed:', error);
      throw new Error(`QuickBooks sync from failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sync invoices to QuickBooks
   */
  async syncInvoicesToQuickBooks(
    venueId: string,
    invoices: QuickBooksInvoice[]
  ): Promise<QuickBooksSyncResult> {
    const errors: Array<{ record: string; error: string }> = [];
    let recordsSynced = 0;

    try {
      const client = await this.initializeClient(venueId);

      for (const invoice of invoices) {
        try {
          if (invoice.id) {
            // Update existing invoice
            await client.post('/invoice', {
              ...invoice,
              sparse: true,
            });
          } else {
            // Create new invoice
            await client.post('/invoice', invoice);
          }
          recordsSynced++;
        } catch (error) {
          console.error('QuickBooks invoice sync error:', error);
          errors.push({
            record: invoice.docNumber || 'Unknown',
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
      console.error('QuickBooks invoice sync failed:', error);
      throw new Error(`QuickBooks invoice sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sync invoices from QuickBooks
   */
  async syncInvoicesFromQuickBooks(
    venueId: string,
    startDate?: string
  ): Promise<QuickBooksInvoice[]> {
    try {
      const client = await this.initializeClient(venueId);
      const invoices: QuickBooksInvoice[] = [];

      let query = 'SELECT * FROM Invoice';
      if (startDate) {
        query += ` WHERE TxnDate >= '${startDate}'`;
      }

      let startPosition = 1;
      const maxResults = 1000;
      let hasMore = true;

      while (hasMore) {
        const response = await client.get('/query', {
          params: {
            query: `${query} STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`,
          },
        });

        const queryResponse = response.data.QueryResponse;
        const fetchedInvoices = queryResponse?.Invoice || [];

        invoices.push(...fetchedInvoices);

        hasMore = fetchedInvoices.length === maxResults;
        startPosition += maxResults;
      }

      return invoices;
    } catch (error) {
      console.error('QuickBooks invoice sync from failed:', error);
      throw new Error(`QuickBooks invoice sync from failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sync payments to QuickBooks
   */
  async syncPaymentsToQuickBooks(
    venueId: string,
    payments: QuickBooksPayment[]
  ): Promise<QuickBooksSyncResult> {
    const errors: Array<{ record: string; error: string }> = [];
    let recordsSynced = 0;

    try {
      const client = await this.initializeClient(venueId);

      for (const payment of payments) {
        try {
          await client.post('/payment', payment);
          recordsSynced++;
        } catch (error) {
          console.error('QuickBooks payment sync error:', error);
          errors.push({
            record: payment.id || 'Unknown',
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
      console.error('QuickBooks payment sync failed:', error);
      throw new Error(`QuickBooks payment sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get company info
   */
  async getCompanyInfo(venueId: string): Promise<any> {
    try {
      const client = await this.initializeClient(venueId);
      const response = await client.get('/companyinfo/' + this.realmId);
      return response.data.CompanyInfo;
    } catch (error) {
      console.error('Failed to get QuickBooks company info:', error);
      throw new Error(`Failed to get QuickBooks company info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify connection to QuickBooks
   */
  async verifyConnection(venueId: string): Promise<boolean> {
    try {
      await this.getCompanyInfo(venueId);
      return true;
    } catch (error) {
      console.error('QuickBooks connection verification failed:', error);
      return false;
    }
  }

  /**
   * Refresh OAuth token if needed
   */
  async refreshToken(venueId: string, refreshToken: string): Promise<void> {
    try {
      const clientId = config.providers.quickbooks.clientId;
      const clientSecret = config.providers.quickbooks.clientSecret;

      if (!clientId || !clientSecret) {
        throw new Error('QuickBooks OAuth credentials not configured');
      }

      const response = await axios.post<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
        x_refresh_token_expires_in: number;
      }>(
        'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      // Store new tokens
      await credentialEncryptionService.rotateOAuthTokens(
        venueId,
        'quickbooks',
        {
          accessToken: response.data.access_token,
          refreshToken: response.data.refresh_token,
          expiresAt: new Date(Date.now() + response.data.expires_in * 1000),
          refreshExpiresAt: new Date(Date.now() + response.data.x_refresh_token_expires_in * 1000),
          tokenType: 'Bearer',
        }
      );

      // Reset client to pick up new token
      this.client = null;
    } catch (error) {
      console.error('Failed to refresh QuickBooks token:', error);
      throw new Error(`Failed to refresh QuickBooks token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const quickbooksSyncService = new QuickBooksSyncService();
