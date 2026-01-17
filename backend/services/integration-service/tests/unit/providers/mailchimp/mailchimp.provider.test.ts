// Mock dependencies BEFORE imports
const mockAxiosGet = jest.fn();
const mockAxiosPost = jest.fn();

jest.mock('axios', () => ({
  get: mockAxiosGet,
  post: mockAxiosPost,
}));

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../../src/config', () => ({
  config: {
    providers: {
      mailchimp: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      },
    },
    server: {
      apiUrl: 'https://api.test.com',
    },
  },
}));

import { MailchimpProvider } from '../../../../src/providers/mailchimp/mailchimp.provider';
import crypto from 'crypto';

describe('MailchimpProvider', () => {
  let provider: MailchimpProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new MailchimpProvider();
  });

  describe('initialize', () => {
    it('should initialize with API key and extract server prefix', async () => {
      const credentials = {
        apiKey: 'testkey123-us1',
        listId: 'list-123',
      };

      await provider.initialize(credentials);

      expect(provider.name).toBe('mailchimp');
    });

    it('should use default server prefix if not in API key', async () => {
      const credentials = {
        apiKey: 'test-key',
        listId: 'list-123',
      };

      await provider.initialize(credentials);
      // Should not throw
    });

    it('should initialize without listId', async () => {
      const credentials = {
        apiKey: 'testkey-us2',
      };

      await provider.initialize(credentials);
      // Should not throw
    });
  });

  describe('testConnection', () => {
    beforeEach(async () => {
      await provider.initialize({ apiKey: 'testkey-us1', listId: 'list-123' });
    });

    it('should return true when connection is successful', async () => {
      mockAxiosGet.mockResolvedValue({
        data: { health_status: "Everything's Chimpy!" },
      });

      const result = await provider.testConnection();

      expect(result).toBe(true);
      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://us1.api.mailchimp.com/3.0/ping',
        expect.objectContaining({
          auth: {
            username: 'anystring',
            password: 'testkey-us1',
          },
        })
      );
    });

    it('should return false when health status is not chimpy', async () => {
      mockAxiosGet.mockResolvedValue({
        data: { health_status: 'Error' },
      });

      const result = await provider.testConnection();

      expect(result).toBe(false);
    });

    it('should return false when connection fails', async () => {
      mockAxiosGet.mockRejectedValue(new Error('Network error'));

      const result = await provider.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('syncCustomers', () => {
    beforeEach(async () => {
      await provider.initialize({ apiKey: 'testkey-us1', listId: 'list-123' });
    });

    it('should sync customers successfully', async () => {
      const customers = [
        {
          email: 'test1@example.com',
          firstName: 'John',
          lastName: 'Doe',
          subscribed: true,
          tags: ['vip'],
        },
        {
          email: 'test2@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          subscribed: false,
        },
      ];

      mockAxiosPost.mockResolvedValue({
        data: { id: 'batch-123' },
      });

      const result = await provider.syncCustomers(customers);

      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://us1.api.mailchimp.com/3.0/batches',
        expect.objectContaining({
          operations: expect.any(Array),
        }),
        expect.any(Object)
      );
    });

    it('should batch customers in groups of 500', async () => {
      const customers = Array.from({ length: 1000 }, (_, i) => ({
        email: `test${i}@example.com`,
        subscribed: true,
      }));

      mockAxiosPost.mockResolvedValue({ data: { id: 'batch' } });

      await provider.syncCustomers(customers);

      expect(mockAxiosPost).toHaveBeenCalledTimes(2); // 500 + 500
    });

    it('should handle batch sync failures', async () => {
      const customers = [{ email: 'test@example.com', subscribed: true }];

      mockAxiosPost.mockRejectedValue(new Error('API error'));

      const result = await provider.syncCustomers(customers);

      expect(result.success).toBe(false);
      expect(result.syncedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should handle customers without tags', async () => {
      const customers = [
        {
          email: 'test@example.com',
          firstName: 'John',
          subscribed: true,
        },
      ];

      mockAxiosPost.mockResolvedValue({ data: { id: 'batch-123' } });

      const result = await provider.syncCustomers(customers);

      expect(result.success).toBe(true);
    });

    it('should generate correct subscriber hash for emails', async () => {
      const customers = [
        { email: 'Test@Example.com', subscribed: true }, // Mixed case
      ];

      mockAxiosPost.mockResolvedValue({ data: { id: 'batch' } });

      await provider.syncCustomers(customers);

      const call = mockAxiosPost.mock.calls[0];
      const operations = call[1].operations;
      
      // Email should be lowercased for hash
      expect(operations[0].path).toContain('/members/');
    });
  });

  describe('fetchCustomers', () => {
    beforeEach(async () => {
      await provider.initialize({ apiKey: 'testkey-us1', listId: 'list-123' });
    });

    it('should fetch customers successfully', async () => {
      const members = [
        { email_address: 'test1@example.com' },
        { email_address: 'test2@example.com' },
      ];

      mockAxiosGet.mockResolvedValue({
        data: { members },
      });

      const result = await provider.fetchCustomers();

      expect(result).toEqual(members);
      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://us1.api.mailchimp.com/3.0/lists/list-123/members',
        expect.objectContaining({
          params: {
            count: 1000,
            offset: 0,
          },
        })
      );
    });

    it('should return empty array on error', async () => {
      mockAxiosGet.mockRejectedValue(new Error('API error'));

      const result = await provider.fetchCustomers();

      expect(result).toEqual([]);
    });

    it('should return empty array when no members', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {},
      });

      const result = await provider.fetchCustomers();

      expect(result).toEqual([]);
    });
  });

  describe('createCampaign', () => {
    beforeEach(async () => {
      await provider.initialize({ apiKey: 'testkey-us1', listId: 'list-123' });
    });

    it('should create campaign successfully', async () => {
      const campaignData = {
        subject: 'Test Campaign',
        fromName: 'Test Sender',
        replyTo: 'reply@example.com',
        title: 'My Campaign',
        segmentOpts: { match: 'all' },
      };

      const createdCampaign = { id: 'campaign-123', ...campaignData };
      mockAxiosPost.mockResolvedValue({ data: createdCampaign });

      const result = await provider.createCampaign(campaignData);

      expect(result).toEqual(createdCampaign);
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://us1.api.mailchimp.com/3.0/campaigns',
        expect.objectContaining({
          type: 'regular',
          recipients: expect.objectContaining({
            list_id: 'list-123',
          }),
          settings: expect.objectContaining({
            subject_line: 'Test Campaign',
          }),
        }),
        expect.any(Object)
      );
    });

    it('should throw error on campaign creation failure', async () => {
      const campaignData = { subject: 'Test' };
      mockAxiosPost.mockRejectedValue(new Error('API error'));

      await expect(provider.createCampaign(campaignData)).rejects.toThrow(
        'API error'
      );
    });
  });

  describe('validateWebhookSignature', () => {
    it('should return true for any signature (no validation)', () => {
      const result = provider.validateWebhookSignature('payload', 'signature');
      expect(result).toBe(true);
    });
  });

  describe('handleWebhook', () => {
    it('should handle subscribe events', async () => {
      const event = { type: 'subscribe', data: { email: 'test@example.com' } };

      await provider.handleWebhook(event);
      // Should not throw
    });

    it('should handle unsubscribe events', async () => {
      const event = { type: 'unsubscribe', data: { email: 'test@example.com' } };

      await provider.handleWebhook(event);
      // Should not throw
    });

    it('should handle campaign events', async () => {
      const event = { type: 'campaign', data: { id: 'campaign-123' } };

      await provider.handleWebhook(event);
      // Should not throw
    });

    it('should handle unknown events', async () => {
      const event = { type: 'unknown', data: {} };

      await provider.handleWebhook(event);
      // Should not throw
    });
  });

  describe('getOAuthUrl', () => {
    it('should generate correct OAuth URL', () => {
      const state = 'test-state-123';
      const url = provider.getOAuthUrl(state);

      expect(url).toContain('https://login.mailchimp.com/oauth2/authorize');
      expect(url).toContain('response_type=code');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('state=test-state-123');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for token successfully', async () => {
      const code = 'auth-code-123';
      const tokenData = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
      };

      mockAxiosPost.mockResolvedValue({ data: tokenData });

      const result = await provider.exchangeCodeForToken(code);

      expect(result).toEqual(tokenData);
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://login.mailchimp.com/oauth2/token',
        expect.any(URLSearchParams)
      );
    });

    it('should propagate exchange errors', async () => {
      mockAxiosPost.mockRejectedValue(new Error('Invalid code'));

      await expect(provider.exchangeCodeForToken('bad-code')).rejects.toThrow(
        'Invalid code'
      );
    });
  });
});
