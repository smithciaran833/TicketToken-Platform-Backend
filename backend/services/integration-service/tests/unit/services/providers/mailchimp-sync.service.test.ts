// Mock axios BEFORE imports
const mockAxiosGet = jest.fn();
const mockAxiosPost = jest.fn();
const mockAxiosCreate = jest.fn(() => ({
  get: mockAxiosGet,
  post: mockAxiosPost,
}));

jest.mock('axios', () => ({
  create: mockAxiosCreate,
}));

// Mock credential encryption service
const mockRetrieveApiKeys = jest.fn();

jest.mock('../../../../src/services/credential-encryption.service', () => ({
  credentialEncryptionService: {
    retrieveApiKeys: mockRetrieveApiKeys,
  },
}));

// Mock crypto
jest.mock('crypto', () => ({
  createHash: jest.fn(() => ({
    update: jest.fn(() => ({
      digest: jest.fn(() => 'mocked-md5-hash'),
    })),
  })),
}));

import { MailchimpSyncService, mailchimpSyncService } from '../../../../src/services/providers/mailchimp-sync.service';

describe('MailchimpSyncService', () => {
  let service: MailchimpSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MailchimpSyncService();
  });

  describe('verifyConnection', () => {
    it('should return true on successful ping', async () => {
      mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'test-key-us1' });
      mockAxiosGet.mockResolvedValue({ data: { health_status: 'ok' } });

      const result = await service.verifyConnection('venue-123');

      expect(result).toBe(true);
      expect(mockAxiosGet).toHaveBeenCalledWith('/ping');
    });

    it('should return false on ping failure', async () => {
      mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'test-key-us1' });
      mockAxiosGet.mockRejectedValue(new Error('Connection failed'));

      const result = await service.verifyConnection('venue-123');

      expect(result).toBe(false);
    });

    it('should extract datacenter from API key', async () => {
      mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'abcdef-us5' });
      mockAxiosGet.mockResolvedValue({ data: {} });

      await service.verifyConnection('venue-123');

      expect(mockAxiosCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://us5.api.mailchimp.com/3.0',
        })
      );
    });

    it('should return false when no credentials found', async () => {
      mockRetrieveApiKeys.mockResolvedValue(null);

      const result = await service.verifyConnection('venue-123');

      expect(result).toBe(false);
    });
  });

  describe('syncContactsToMailchimp', () => {
    beforeEach(() => {
      mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'test-key-us1' });
    });

    it('should sync contacts successfully', async () => {
      const contacts = [
        { email: 'test@example.com', firstName: 'John', lastName: 'Doe' },
      ];

      mockAxiosPost.mockResolvedValue({ data: { id: 'batch-123' } });
      mockAxiosGet.mockResolvedValue({ data: { status: 'finished' } });

      const result = await service.syncContactsToMailchimp('venue-123', 'list-1', contacts);

      expect(result.success).toBe(true);
      expect(result.contactsSynced).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should batch contacts in groups of 500', async () => {
      const contacts = Array(600).fill(null).map((_, i) => ({
        email: `test${i}@example.com`,
      }));

      mockAxiosPost.mockResolvedValue({ data: { id: 'batch-123' } });
      mockAxiosGet.mockResolvedValue({ data: { status: 'finished' } });

      await service.syncContactsToMailchimp('venue-123', 'list-1', contacts);

      // Should make 2 batch calls (500 + 100)
      expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    });

    it('should handle batch errors', async () => {
      const contacts = [{ email: 'test@example.com' }];

      mockAxiosPost.mockRejectedValue(new Error('Batch failed'));

      const result = await service.syncContactsToMailchimp('venue-123', 'list-1', contacts);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Batch failed');
    });

    it('should use default status of subscribed', async () => {
      const contacts = [{ email: 'test@example.com' }];

      mockAxiosPost.mockResolvedValue({ data: { id: 'batch-123' } });
      mockAxiosGet.mockResolvedValue({ data: { status: 'finished' } });

      await service.syncContactsToMailchimp('venue-123', 'list-1', contacts);

      expect(mockAxiosPost).toHaveBeenCalledWith('/batches', {
        operations: expect.arrayContaining([
          expect.objectContaining({
            body: expect.stringContaining('"status":"subscribed"'),
          }),
        ]),
      });
    });

    it('should include merge fields in request', async () => {
      const contacts = [{
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '555-1234',
      }];

      mockAxiosPost.mockResolvedValue({ data: { id: 'batch-123' } });
      mockAxiosGet.mockResolvedValue({ data: { status: 'finished' } });

      await service.syncContactsToMailchimp('venue-123', 'list-1', contacts);

      const callBody = mockAxiosPost.mock.calls[0][1].operations[0].body;
      expect(callBody).toContain('"FNAME":"John"');
      expect(callBody).toContain('"LNAME":"Doe"');
      expect(callBody).toContain('"PHONE":"555-1234"');
    });

    it('should throw error on initialization failure', async () => {
      mockRetrieveApiKeys.mockResolvedValue(null);

      await expect(
        service.syncContactsToMailchimp('venue-123', 'list-1', [])
      ).rejects.toThrow('Mailchimp sync failed');
    });
  });

  describe('syncContactsFromMailchimp', () => {
    beforeEach(() => {
      mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'test-key-us1' });
    });

    it('should fetch contacts from Mailchimp', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          members: [
            {
              email_address: 'test@example.com',
              merge_fields: { FNAME: 'John', LNAME: 'Doe', PHONE: '555-1234' },
              status: 'subscribed',
              tags: [{ name: 'vip' }],
            },
          ],
        },
      });

      const contacts = await service.syncContactsFromMailchimp('venue-123', 'list-1');

      expect(contacts).toHaveLength(1);
      expect(contacts[0]).toEqual({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '555-1234',
        status: 'subscribed',
        tags: ['vip'],
      });
    });

    it('should paginate through all contacts', async () => {
      // First call returns 1000 contacts, second returns less (pagination stops)
      mockAxiosGet
        .mockResolvedValueOnce({
          data: {
            members: Array(1000).fill({
              email_address: 'test@example.com',
              merge_fields: {},
              status: 'subscribed',
              tags: [],
            }),
          },
        })
        .mockResolvedValueOnce({
          data: {
            members: Array(500).fill({
              email_address: 'test@example.com',
              merge_fields: {},
              status: 'subscribed',
              tags: [],
            }),
          },
        });

      const contacts = await service.syncContactsFromMailchimp('venue-123', 'list-1');

      expect(contacts).toHaveLength(1500);
      expect(mockAxiosGet).toHaveBeenCalledTimes(2);
    });

    it('should handle empty response', async () => {
      mockAxiosGet.mockResolvedValue({ data: { members: [] } });

      const contacts = await service.syncContactsFromMailchimp('venue-123', 'list-1');

      expect(contacts).toHaveLength(0);
    });

    it('should throw error on API failure', async () => {
      mockAxiosGet.mockRejectedValue(new Error('API error'));

      await expect(
        service.syncContactsFromMailchimp('venue-123', 'list-1')
      ).rejects.toThrow('Mailchimp sync from failed');
    });
  });

  describe('getLists', () => {
    beforeEach(() => {
      mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'test-key-us1' });
    });

    it('should fetch and transform lists', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          lists: [
            { id: 'list-1', name: 'Newsletter', stats: { member_count: 100 } },
            { id: 'list-2', name: 'VIP', stats: { member_count: 50 } },
          ],
        },
      });

      const lists = await service.getLists('venue-123');

      expect(lists).toHaveLength(2);
      expect(lists[0]).toEqual({ id: 'list-1', name: 'Newsletter', memberCount: 100 });
      expect(lists[1]).toEqual({ id: 'list-2', name: 'VIP', memberCount: 50 });
    });

    it('should handle empty lists', async () => {
      mockAxiosGet.mockResolvedValue({ data: { lists: [] } });

      const lists = await service.getLists('venue-123');

      expect(lists).toHaveLength(0);
    });

    it('should handle missing stats', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          lists: [{ id: 'list-1', name: 'Test', stats: null }],
        },
      });

      const lists = await service.getLists('venue-123');

      expect(lists[0].memberCount).toBe(0);
    });

    it('should throw error on API failure', async () => {
      mockAxiosGet.mockRejectedValue(new Error('Failed'));

      await expect(service.getLists('venue-123')).rejects.toThrow(
        'Failed to get Mailchimp lists'
      );
    });
  });

  describe('createList', () => {
    beforeEach(() => {
      mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'test-key-us1' });
    });

    it('should create a new list', async () => {
      mockAxiosPost.mockResolvedValue({ data: { id: 'new-list-id' } });

      const listId = await service.createList(
        'venue-123',
        'My List',
        'from@example.com',
        'My Company'
      );

      expect(listId).toBe('new-list-id');
      expect(mockAxiosPost).toHaveBeenCalledWith('/lists', expect.objectContaining({
        name: 'My List',
        campaign_defaults: expect.objectContaining({
          from_email: 'from@example.com',
          from_name: 'My Company',
        }),
      }));
    });

    it('should throw error on failure', async () => {
      mockAxiosPost.mockRejectedValue(new Error('Creation failed'));

      await expect(
        service.createList('venue-123', 'List', 'email@test.com', 'Name')
      ).rejects.toThrow('Failed to create Mailchimp list');
    });
  });

  describe('waitForBatchCompletion', () => {
    beforeEach(() => {
      mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'test-key-us1' });
    });

    it('should handle failed batch status', async () => {
      const contacts = [{ email: 'test@example.com' }];

      mockAxiosPost.mockResolvedValue({ data: { id: 'batch-123' } });
      mockAxiosGet.mockResolvedValue({ data: { status: 'failed' } });

      const result = await service.syncContactsToMailchimp('venue-123', 'list-1', contacts);

      // Error is caught and added to errors array
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('singleton export', () => {
    it('should export a singleton instance', () => {
      expect(mailchimpSyncService).toBeInstanceOf(MailchimpSyncService);
    });
  });
});
