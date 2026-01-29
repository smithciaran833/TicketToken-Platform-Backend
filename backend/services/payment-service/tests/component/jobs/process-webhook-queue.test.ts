/**
 * COMPONENT TEST: ProcessWebhookQueueJob
 *
 * Tests webhook queue processing
 */

import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock data
let mockWebhooks: any[] = [];

// Mock client
const mockClientQuery = jest.fn();

// Mock withSystemContextPool
jest.mock('../../../src/workers/system-job-utils', () => ({
  withSystemContextPool: jest.fn(async (pool: any, fn: any) => {
    const mockClient = { query: mockClientQuery };
    return fn(mockClient);
  }),
}));

// Mock StripeWebhookHandler
const mockHandleEvent = jest.fn();
jest.mock('../../../src/webhooks/stripe-handler', () => ({
  StripeWebhookHandler: jest.fn().mockImplementation(() => ({
    handleEvent: mockHandleEvent,
  })),
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { ProcessWebhookQueueJob } from '../../../src/jobs/process-webhook-queue';

describe('ProcessWebhookQueueJob Component Tests', () => {
  let job: ProcessWebhookQueueJob;
  let mockPool: Pool;
  let mockStripe: any;

  beforeEach(() => {
    mockWebhooks = [];
    mockClientQuery.mockReset();
    mockHandleEvent.mockReset();
    mockHandleEvent.mockResolvedValue(undefined);

    mockPool = {} as Pool;
    mockStripe = {};

    // Default query behavior
    mockClientQuery.mockImplementation(async (query: string, params?: any[]) => {
      // SELECT webhooks
      if (query.includes('SELECT') && query.includes('webhook_inbox')) {
        return { rows: mockWebhooks.filter(w => w.status === 'pending' && w.retry_count < 5) };
      }

      // UPDATE - mark processed
      if (query.includes('UPDATE webhook_inbox') && query.includes('processed')) {
        const webhookId = params?.[0];
        const webhook = mockWebhooks.find(w => w.id === webhookId);
        if (webhook) {
          webhook.status = 'processed';
          webhook.processed_at = new Date();
        }
        return { rows: [] };
      }

      // UPDATE - increment retry
      if (query.includes('UPDATE webhook_inbox') && query.includes('retry_count')) {
        const webhookId = params?.[1];
        const webhook = mockWebhooks.find(w => w.id === webhookId);
        if (webhook) {
          webhook.retry_count = (webhook.retry_count || 0) + 1;
          webhook.error_message = params?.[0];
        }
        return { rows: [] };
      }

      return { rows: [] };
    });

    job = new ProcessWebhookQueueJob(mockPool, mockStripe);
  });

  // Helper to add webhook
  function addWebhook(webhook: Partial<any>): string {
    const id = webhook.id || uuidv4();
    mockWebhooks.push({
      id,
      tenant_id: webhook.tenant_id || uuidv4(),
      webhook_id: webhook.webhook_id || `wh_${uuidv4().replace(/-/g, '')}`,
      event_id: webhook.event_id || `evt_${uuidv4().replace(/-/g, '')}`,
      provider: webhook.provider || 'stripe',
      event_type: webhook.event_type || 'payment_intent.succeeded',
      payload: webhook.payload || JSON.stringify({ type: 'payment_intent.succeeded' }),
      status: webhook.status || 'pending',
      retry_count: webhook.retry_count || 0,
      created_at: webhook.created_at || new Date(),
    });
    return id;
  }

  // ===========================================================================
  // SUCCESSFUL PROCESSING
  // ===========================================================================
  describe('successful processing', () => {
    it('should process pending Stripe webhooks', async () => {
      const webhookId = addWebhook({
        provider: 'stripe',
        payload: JSON.stringify({ type: 'payment_intent.succeeded', data: {} }),
      });

      await job.execute();

      const webhook = mockWebhooks.find(w => w.id === webhookId);
      expect(webhook?.status).toBe('processed');
      expect(webhook?.processed_at).toBeDefined();
    });

    it('should parse string payload', async () => {
      addWebhook({
        payload: JSON.stringify({ type: 'charge.succeeded' }),
      });

      await job.execute();

      // Should not throw - payload parsed successfully
      expect(mockWebhooks[0].status).toBe('processed');
    });

    it('should handle object payload', async () => {
      addWebhook({
        payload: { type: 'charge.succeeded' }, // Already an object
      });

      await job.execute();

      expect(mockWebhooks[0].status).toBe('processed');
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should increment retry count on error', async () => {
      // Make the query that marks as processed throw an error
      mockClientQuery.mockImplementation(async (query: string, params?: any[]) => {
        if (query.includes('SELECT')) {
          return { rows: mockWebhooks.filter(w => w.status === 'pending') };
        }
        if (query.includes("status = 'processed'")) {
          throw new Error('Processing failed');
        }
        if (query.includes('retry_count')) {
          const webhookId = params?.[1];
          const webhook = mockWebhooks.find(w => w.id === webhookId);
          if (webhook) {
            webhook.retry_count = (webhook.retry_count || 0) + 1;
            webhook.error_message = params?.[0];
          }
          return { rows: [] };
        }
        return { rows: [] };
      });

      const webhookId = addWebhook({ retry_count: 0 });

      await job.execute();

      const webhook = mockWebhooks.find(w => w.id === webhookId);
      expect(webhook?.retry_count).toBe(1);
      expect(webhook?.error_message).toContain('Processing failed');
    });
  });

  // ===========================================================================
  // FILTERING
  // ===========================================================================
  describe('filtering', () => {
    it('should not process webhooks exceeding retry limit', async () => {
      addWebhook({ retry_count: 5 });

      await job.execute();

      // Should not be processed (filtered out by query)
      expect(mockWebhooks[0].status).toBe('pending');
    });

    it('should not process already processed webhooks', async () => {
      addWebhook({ status: 'processed' });

      await job.execute();

      // Query filters these out
      expect(mockWebhooks[0].status).toBe('processed');
    });
  });

  // ===========================================================================
  // BATCH PROCESSING
  // ===========================================================================
  describe('batch processing', () => {
    it('should process multiple webhooks', async () => {
      addWebhook({});
      addWebhook({});
      addWebhook({});

      await job.execute();

      const processed = mockWebhooks.filter(w => w.status === 'processed');
      expect(processed.length).toBe(3);
    });
  });

  // ===========================================================================
  // PROVIDER HANDLING
  // ===========================================================================
  describe('provider handling', () => {
    it('should handle Stripe provider', async () => {
      addWebhook({ provider: 'stripe' });

      await job.execute();

      expect(mockWebhooks[0].status).toBe('processed');
    });

    it('should handle unknown provider gracefully', async () => {
      addWebhook({ provider: 'unknown_provider' });

      await job.execute();

      // Should still mark as processed (no error thrown)
      expect(mockWebhooks[0].status).toBe('processed');
    });
  });
});
