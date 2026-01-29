/**
 * External Service Mocks
 * 
 * Mock implementations for Stripe, TaxJar, blockchain RPCs, and other external services.
 */

import Stripe from 'stripe';

// ============================================================================
// Stripe Mocks
// ============================================================================

export interface MockPaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: Stripe.PaymentIntent.Status;
  client_secret: string;
  metadata: Record<string, string>;
  created: number;
  charges: {
    data: Array<{
      id: string;
      amount: number;
      balance_transaction: string;
    }>;
  };
}

export interface MockRefund {
  id: string;
  amount: number;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  payment_intent: string;
  created: number;
}

export interface MockTransfer {
  id: string;
  amount: number;
  currency: string;
  destination: string;
  source_transaction: string;
  created: number;
}

export interface MockBalance {
  available: Array<{ amount: number; currency: string }>;
  pending: Array<{ amount: number; currency: string }>;
}

/**
 * Creates a mock Stripe client for testing
 */
export function createMockStripeClient() {
  const paymentIntents = new Map<string, MockPaymentIntent>();
  const refunds = new Map<string, MockRefund>();
  const transfers = new Map<string, MockTransfer>();

  return {
    paymentIntents: {
      create: async (params: Stripe.PaymentIntentCreateParams): Promise<MockPaymentIntent> => {
        const id = `pi_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const intent: MockPaymentIntent = {
          id,
          amount: params.amount as number,
          currency: params.currency as string,
          status: 'requires_payment_method',
          client_secret: `${id}_secret_test`,
          metadata: (params.metadata as Record<string, string>) || {},
          created: Math.floor(Date.now() / 1000),
          charges: { data: [] },
        };
        paymentIntents.set(id, intent);
        return intent;
      },

      retrieve: async (id: string): Promise<MockPaymentIntent> => {
        const intent = paymentIntents.get(id);
        if (!intent) {
          throw new Error(`No such payment_intent: ${id}`);
        }
        return intent;
      },

      confirm: async (id: string): Promise<MockPaymentIntent> => {
        const intent = paymentIntents.get(id);
        if (!intent) {
          throw new Error(`No such payment_intent: ${id}`);
        }
        intent.status = 'succeeded';
        intent.charges.data.push({
          id: `ch_test_${Date.now()}`,
          amount: intent.amount,
          balance_transaction: `txn_test_${Date.now()}`,
        });
        return intent;
      },

      capture: async (id: string, params?: { amount_to_capture?: number }): Promise<MockPaymentIntent> => {
        const intent = paymentIntents.get(id);
        if (!intent) {
          throw new Error(`No such payment_intent: ${id}`);
        }
        if (params?.amount_to_capture) {
          intent.amount = params.amount_to_capture;
        }
        intent.status = 'succeeded';
        return intent;
      },

      cancel: async (id: string): Promise<MockPaymentIntent> => {
        const intent = paymentIntents.get(id);
        if (!intent) {
          throw new Error(`No such payment_intent: ${id}`);
        }
        intent.status = 'canceled';
        return intent;
      },

      update: async (id: string, params: Stripe.PaymentIntentUpdateParams): Promise<MockPaymentIntent> => {
        const intent = paymentIntents.get(id);
        if (!intent) {
          throw new Error(`No such payment_intent: ${id}`);
        }
        if (params.metadata) {
          intent.metadata = { ...intent.metadata, ...(params.metadata as Record<string, string>) };
        }
        return intent;
      },

      // For testing: manually set status
      _setStatus: (id: string, status: Stripe.PaymentIntent.Status) => {
        const intent = paymentIntents.get(id);
        if (intent) {
          intent.status = status;
        }
      },

      // For testing: get all intents
      _getAll: () => Array.from(paymentIntents.values()),

      // For testing: clear all
      _clear: () => paymentIntents.clear(),
    },

    refunds: {
      create: async (params: Stripe.RefundCreateParams): Promise<MockRefund> => {
        const id = `re_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const refund: MockRefund = {
          id,
          amount: params.amount as number,
          status: 'succeeded',
          payment_intent: params.payment_intent as string,
          created: Math.floor(Date.now() / 1000),
        };
        refunds.set(id, refund);
        return refund;
      },

      retrieve: async (id: string): Promise<MockRefund> => {
        const refund = refunds.get(id);
        if (!refund) {
          throw new Error(`No such refund: ${id}`);
        }
        return refund;
      },

      _getAll: () => Array.from(refunds.values()),
      _clear: () => refunds.clear(),
    },

    transfers: {
      create: async (params: Stripe.TransferCreateParams): Promise<MockTransfer> => {
        const id = `tr_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const transfer: MockTransfer = {
          id,
          amount: params.amount as number,
          currency: params.currency as string,
          destination: params.destination as string,
          source_transaction: params.source_transaction as string || '',
          created: Math.floor(Date.now() / 1000),
        };
        transfers.set(id, transfer);
        return transfer;
      },

      retrieve: async (id: string): Promise<MockTransfer> => {
        const transfer = transfers.get(id);
        if (!transfer) {
          throw new Error(`No such transfer: ${id}`);
        }
        return transfer;
      },

      createReversal: async (transferId: string, params?: { amount?: number }) => {
        const transfer = transfers.get(transferId);
        if (!transfer) {
          throw new Error(`No such transfer: ${transferId}`);
        }
        return {
          id: `trr_test_${Date.now()}`,
          amount: params?.amount || transfer.amount,
          transfer: transferId,
          created: Math.floor(Date.now() / 1000),
        };
      },

      _getAll: () => Array.from(transfers.values()),
      _clear: () => transfers.clear(),
    },

    balance: {
      retrieve: async (): Promise<MockBalance> => ({
        available: [{ amount: 1000000, currency: 'usd' }],
        pending: [{ amount: 50000, currency: 'usd' }],
      }),
    },

    webhookEndpoints: {
      list: async () => ({ data: [] }),
    },

    // For testing: clear all mock data
    _clearAll: () => {
      paymentIntents.clear();
      refunds.clear();
      transfers.clear();
    },
  };
}

// Singleton mock client
let mockStripeClient: ReturnType<typeof createMockStripeClient> | null = null;

export function getMockStripeClient() {
  if (!mockStripeClient) {
    mockStripeClient = createMockStripeClient();
  }
  return mockStripeClient;
}

export function resetMockStripeClient() {
  if (mockStripeClient) {
    mockStripeClient._clearAll();
  }
}

// ============================================================================
// TaxJar Mocks
// ============================================================================

export interface MockTaxCalculation {
  order_total_amount: number;
  shipping: number;
  taxable_amount: number;
  amount_to_collect: number;
  rate: number;
  has_nexus: boolean;
  freight_taxable: boolean;
  tax_source: string;
  breakdown: {
    state_taxable_amount: number;
    state_tax_rate: number;
    state_tax_collectable: number;
    county_taxable_amount: number;
    county_tax_rate: number;
    county_tax_collectable: number;
    city_taxable_amount: number;
    city_tax_rate: number;
    city_tax_collectable: number;
    special_district_taxable_amount: number;
    special_tax_rate: number;
    special_district_tax_collectable: number;
  };
}

const STATE_TAX_RATES: Record<string, number> = {
  CA: 0.0725,
  NY: 0.08,
  TX: 0.0625,
  FL: 0.06,
  TN: 0.07,
  WA: 0.065,
  OR: 0, // No sales tax
  MT: 0, // No sales tax
  NH: 0, // No sales tax
  DE: 0, // No sales tax
};

export function createMockTaxJarClient() {
  return {
    taxForOrder: async (params: {
      to_state: string;
      to_zip: string;
      amount: number;
      shipping: number;
    }): Promise<{ tax: MockTaxCalculation }> => {
      const rate = STATE_TAX_RATES[params.to_state] || 0.05;
      const taxableAmount = params.amount;
      const amountToCollect = Math.round(taxableAmount * rate * 100) / 100;

      return {
        tax: {
          order_total_amount: params.amount + params.shipping,
          shipping: params.shipping,
          taxable_amount: taxableAmount,
          amount_to_collect: amountToCollect,
          rate,
          has_nexus: true,
          freight_taxable: false,
          tax_source: 'destination',
          breakdown: {
            state_taxable_amount: taxableAmount,
            state_tax_rate: rate,
            state_tax_collectable: amountToCollect,
            county_taxable_amount: 0,
            county_tax_rate: 0,
            county_tax_collectable: 0,
            city_taxable_amount: 0,
            city_tax_rate: 0,
            city_tax_collectable: 0,
            special_district_taxable_amount: 0,
            special_tax_rate: 0,
            special_district_tax_collectable: 0,
          },
        },
      };
    },

    ratesForLocation: async (zip: string) => ({
      rate: {
        zip,
        state_rate: 0.05,
        county_rate: 0.01,
        city_rate: 0.005,
        combined_rate: 0.065,
      },
    }),
  };
}

// ============================================================================
// Blockchain RPC Mocks
// ============================================================================

export function createMockSolanaConnection() {
  return {
    getLatestBlockhash: async () => ({
      blockhash: 'mock_blockhash_' + Date.now(),
      lastValidBlockHeight: 100000000,
    }),

    getSlot: async () => 150000000,

    getFeeForMessage: async () => ({
      value: 5000, // lamports
    }),

    getBalance: async () => 1000000000, // 1 SOL in lamports

    sendTransaction: async () => 'mock_tx_signature_' + Date.now(),

    confirmTransaction: async () => ({
      value: { err: null },
    }),
  };
}

export function createMockPolygonProvider() {
  return {
    getFeeData: async () => ({
      gasPrice: BigInt(30000000000), // 30 gwei
      maxFeePerGas: BigInt(50000000000),
      maxPriorityFeePerGas: BigInt(2000000000),
    }),

    getGasPrice: async () => BigInt(30000000000),

    estimateGas: async () => BigInt(21000),

    getBalance: async () => BigInt(1000000000000000000), // 1 MATIC in wei

    sendTransaction: async () => ({
      hash: '0xmock_tx_hash_' + Date.now(),
      wait: async () => ({ status: 1 }),
    }),
  };
}

// ============================================================================
// HTTP Service Mocks
// ============================================================================

export interface MockHttpResponse {
  status: number;
  data: any;
  headers?: Record<string, string>;
}

type MockHandler = (url: string, options?: any) => Promise<MockHttpResponse>;

const mockHandlers = new Map<string, MockHandler>();

export function mockHttpEndpoint(urlPattern: string, handler: MockHandler) {
  mockHandlers.set(urlPattern, handler);
}

export function clearHttpMocks() {
  mockHandlers.clear();
}

export function createMockHttpClient() {
  return {
    get: async (url: string, options?: any): Promise<MockHttpResponse> => {
      for (const [pattern, handler] of mockHandlers) {
        if (url.includes(pattern)) {
          return handler(url, options);
        }
      }
      return { status: 404, data: { error: 'Not found' } };
    },

    post: async (url: string, data?: any, options?: any): Promise<MockHttpResponse> => {
      for (const [pattern, handler] of mockHandlers) {
        if (url.includes(pattern)) {
          return handler(url, { ...options, data });
        }
      }
      return { status: 404, data: { error: 'Not found' } };
    },

    put: async (url: string, data?: any, options?: any): Promise<MockHttpResponse> => {
      for (const [pattern, handler] of mockHandlers) {
        if (url.includes(pattern)) {
          return handler(url, { ...options, data });
        }
      }
      return { status: 404, data: { error: 'Not found' } };
    },

    delete: async (url: string, options?: any): Promise<MockHttpResponse> => {
      for (const [pattern, handler] of mockHandlers) {
        if (url.includes(pattern)) {
          return handler(url, options);
        }
      }
      return { status: 404, data: { error: 'Not found' } };
    },
  };
}

// ============================================================================
// Notification Service Mock
// ============================================================================

interface SentNotification {
  type: string;
  recipient: string;
  data: Record<string, any>;
  sentAt: Date;
}

const sentNotifications: SentNotification[] = [];

export function createMockNotificationService() {
  return {
    send: async (type: string, recipient: string, data: Record<string, any>) => {
      sentNotifications.push({
        type,
        recipient,
        data,
        sentAt: new Date(),
      });
      return { success: true, messageId: `msg_${Date.now()}` };
    },

    sendEmail: async (to: string, subject: string, body: string) => {
      sentNotifications.push({
        type: 'email',
        recipient: to,
        data: { subject, body },
        sentAt: new Date(),
      });
      return { success: true };
    },

    sendSms: async (to: string, message: string) => {
      sentNotifications.push({
        type: 'sms',
        recipient: to,
        data: { message },
        sentAt: new Date(),
      });
      return { success: true };
    },

    // For testing
    getSentNotifications: () => [...sentNotifications],
    clearNotifications: () => sentNotifications.length = 0,
    getNotificationsByType: (type: string) => sentNotifications.filter(n => n.type === type),
    getNotificationsByRecipient: (recipient: string) => sentNotifications.filter(n => n.recipient === recipient),
  };
}

// Singleton
let mockNotificationService: ReturnType<typeof createMockNotificationService> | null = null;

export function getMockNotificationService() {
  if (!mockNotificationService) {
    mockNotificationService = createMockNotificationService();
  }
  return mockNotificationService;
}

export function resetMockNotificationService() {
  if (mockNotificationService) {
    mockNotificationService.clearNotifications();
  }
}

// ============================================================================
// Queue Mocks (Bull/RabbitMQ)
// ============================================================================

interface QueuedJob {
  id: string;
  name: string;
  data: any;
  opts: any;
  addedAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
}

const queuedJobs = new Map<string, QueuedJob[]>();

export function createMockQueue(queueName: string) {
  if (!queuedJobs.has(queueName)) {
    queuedJobs.set(queueName, []);
  }

  const jobs = queuedJobs.get(queueName)!;

  return {
    name: queueName,

    add: async (name: string, data: any, opts?: any) => {
      const job: QueuedJob = {
        id: `job_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name,
        data,
        opts: opts || {},
        addedAt: new Date(),
      };
      jobs.push(job);
      return job;
    },

    process: (handler: (job: any) => Promise<any>) => {
      // Store handler for manual processing in tests
      (queuedJobs as any)[`${queueName}_handler`] = handler;
    },

    getJobs: async (statuses: string[]) => jobs,

    getJob: async (id: string) => jobs.find(j => j.id === id),

    getJobCounts: async () => ({
      waiting: jobs.filter(j => !j.processedAt).length,
      active: 0,
      completed: jobs.filter(j => j.completedAt).length,
      failed: jobs.filter(j => j.failedAt).length,
    }),

    // For testing: process next job
    _processNext: async () => {
      const handler = (queuedJobs as any)[`${queueName}_handler`];
      if (!handler) return null;

      const job = jobs.find(j => !j.processedAt);
      if (!job) return null;

      job.processedAt = new Date();
      try {
        await handler(job);
        job.completedAt = new Date();
      } catch (err) {
        job.failedAt = new Date();
        job.error = (err as Error).message;
      }
      return job;
    },

    // For testing: get all jobs
    _getAll: () => [...jobs],

    // For testing: clear queue
    _clear: () => jobs.length = 0,

    close: async () => {},
  };
}

export function clearAllQueues() {
  queuedJobs.clear();
}

// ============================================================================
// IP Geolocation Mock (ip-api.com)
// ============================================================================

export function createMockIpApiClient() {
  const ipData: Record<string, any> = {
    '192.168.1.1': {
      status: 'success',
      country: 'United States',
      countryCode: 'US',
      region: 'CA',
      city: 'Los Angeles',
      zip: '90001',
      lat: 34.0522,
      lon: -118.2437,
      isp: 'Test ISP',
      org: 'Test Org',
      as: 'AS12345 Test',
      proxy: false,
      hosting: false,
    },
    '10.0.0.1': {
      status: 'success',
      country: 'United States',
      countryCode: 'US',
      region: 'NY',
      city: 'New York',
      zip: '10001',
      lat: 40.7128,
      lon: -74.006,
      isp: 'Test ISP NYC',
      org: 'Test Org NYC',
      as: 'AS67890 Test',
      proxy: false,
      hosting: false,
    },
  };

  return {
    lookup: async (ip: string) => {
      if (ipData[ip]) {
        return ipData[ip];
      }
      // Default response for unknown IPs
      return {
        status: 'success',
        country: 'United States',
        countryCode: 'US',
        region: 'CA',
        city: 'San Francisco',
        zip: '94102',
        lat: 37.7749,
        lon: -122.4194,
        isp: 'Unknown ISP',
        org: 'Unknown Org',
        as: 'AS00000 Unknown',
        proxy: false,
        hosting: false,
      };
    },

    // For testing: add custom IP data
    _addIp: (ip: string, data: any) => {
      ipData[ip] = data;
    },

    // For testing: mark IP as proxy/VPN
    _markAsProxy: (ip: string) => {
      if (ipData[ip]) {
        ipData[ip].proxy = true;
      }
    },

    // For testing: mark IP as hosting/datacenter
    _markAsHosting: (ip: string) => {
      if (ipData[ip]) {
        ipData[ip].hosting = true;
      }
    },
  };
}

// ============================================================================
// Reset All Mocks
// ============================================================================

export function resetAllMocks() {
  resetMockStripeClient();
  resetMockNotificationService();
  clearHttpMocks();
  clearAllQueues();
}
