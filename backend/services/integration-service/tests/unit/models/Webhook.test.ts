// Mock database config BEFORE imports
const mockReturning = jest.fn();
const mockUpdate = jest.fn(() => ({ returning: mockReturning }));
const mockDel = jest.fn();
const mockFirst = jest.fn();
const mockWhere = jest.fn();
const mockInsert = jest.fn(() => ({ returning: mockReturning }));

// The query builder object that gets returned from db('tableName')
const mockQueryBuilder = {
  insert: mockInsert,
  where: mockWhere,
  first: mockFirst,
  update: mockUpdate,
  del: mockDel,
};

// Make where() return the same query builder for chaining
mockWhere.mockReturnValue(mockQueryBuilder);

const mockDb = jest.fn(() => mockQueryBuilder);

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

import { WebhookModel, IWebhook } from '../../../src/models/Webhook';

describe('WebhookModel', () => {
  let model: WebhookModel;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnValue(mockQueryBuilder);
    model = new WebhookModel();
  });

  describe('constructor', () => {
    it('should use default db when no db provided', () => {
      const instance = new WebhookModel();
      expect(instance).toBeInstanceOf(WebhookModel);
    });

    it('should use provided db when passed', () => {
      const customDb = jest.fn() as any;
      const instance = new WebhookModel(customDb);
      expect(instance).toBeInstanceOf(WebhookModel);
    });
  });

  describe('create', () => {
    it('should insert webhook and return created record', async () => {
      const webhookData: IWebhook = {
        integration_id: 'int-123',
        url: 'https://example.com/webhook',
        events: ['sync.completed', 'sync.failed'],
        active: true,
      };

      const createdWebhook = {
        id: 'webhook-789',
        ...webhookData,
        created_at: new Date(),
      };

      mockReturning.mockResolvedValue([createdWebhook]);

      const result = await model.create(webhookData);

      expect(mockDb).toHaveBeenCalledWith('webhooks');
      expect(mockInsert).toHaveBeenCalledWith(webhookData);
      expect(mockReturning).toHaveBeenCalledWith('*');
      expect(result).toEqual(createdWebhook);
    });

    it('should insert webhook with secret', async () => {
      const webhookData: IWebhook = {
        integration_id: 'int-123',
        url: 'https://example.com/webhook',
        events: ['payment.completed'],
        secret: 'whsec_abc123',
        active: true,
      };

      mockReturning.mockResolvedValue([{ id: 'webhook-1', ...webhookData }]);

      await model.create(webhookData);

      expect(mockInsert).toHaveBeenCalledWith(webhookData);
    });

    it('should handle inactive webhook', async () => {
      const webhookData: IWebhook = {
        integration_id: 'int-123',
        url: 'https://example.com/webhook',
        events: ['sync.started'],
        active: false,
      };

      mockReturning.mockResolvedValue([{ id: 'webhook-1', ...webhookData }]);

      const result = await model.create(webhookData);

      expect(result.active).toBe(false);
    });

    it('should handle multiple events', async () => {
      const webhookData: IWebhook = {
        integration_id: 'int-123',
        url: 'https://example.com/webhook',
        events: ['sync.completed', 'sync.failed', 'sync.started', 'data.updated'],
        active: true,
      };

      mockReturning.mockResolvedValue([{ id: 'webhook-1', ...webhookData }]);

      const result = await model.create(webhookData);

      expect(result.events).toHaveLength(4);
    });

    it('should insert webhook with last_triggered timestamp', async () => {
      const lastTriggered = new Date();
      const webhookData: IWebhook = {
        integration_id: 'int-123',
        url: 'https://example.com/webhook',
        events: ['sync.completed'],
        active: true,
        last_triggered: lastTriggered,
      };

      mockReturning.mockResolvedValue([{ id: 'webhook-1', ...webhookData }]);

      await model.create(webhookData);

      expect(mockInsert).toHaveBeenCalledWith(webhookData);
    });
  });

  describe('findById', () => {
    it('should return webhook when found', async () => {
      const webhook: IWebhook = {
        id: 'webhook-123',
        integration_id: 'int-456',
        url: 'https://example.com/webhook',
        events: ['sync.completed'],
        active: true,
      };

      mockFirst.mockResolvedValue(webhook);

      const result = await model.findById('webhook-123');

      expect(mockDb).toHaveBeenCalledWith('webhooks');
      expect(mockWhere).toHaveBeenCalledWith({ id: 'webhook-123' });
      expect(mockFirst).toHaveBeenCalled();
      expect(result).toEqual(webhook);
    });

    it('should return null when webhook not found', async () => {
      mockFirst.mockResolvedValue(undefined);

      const result = await model.findById('non-existent');

      expect(mockWhere).toHaveBeenCalledWith({ id: 'non-existent' });
      expect(result).toBeNull();
    });

    it('should return null when first returns null', async () => {
      mockFirst.mockResolvedValue(null);

      const result = await model.findById('webhook-123');

      expect(result).toBeNull();
    });
  });

  describe('findByIntegrationId', () => {
    it('should return only active webhooks for integration', async () => {
      const webhooks: IWebhook[] = [
        {
          id: 'webhook-1',
          integration_id: 'int-123',
          url: 'https://example.com/webhook1',
          events: ['sync.completed'],
          active: true,
        },
        {
          id: 'webhook-2',
          integration_id: 'int-123',
          url: 'https://example.com/webhook2',
          events: ['sync.failed'],
          active: true,
        },
      ];

      mockWhere.mockResolvedValue(webhooks);

      const result = await model.findByIntegrationId('int-123');

      expect(mockDb).toHaveBeenCalledWith('webhooks');
      expect(mockWhere).toHaveBeenCalledWith({ integration_id: 'int-123', active: true });
      expect(result).toEqual(webhooks);
    });

    it('should return empty array when no active webhooks found', async () => {
      mockWhere.mockResolvedValue([]);

      const result = await model.findByIntegrationId('int-456');

      expect(result).toEqual([]);
    });

    it('should filter by active status', async () => {
      mockWhere.mockResolvedValue([]);

      await model.findByIntegrationId('int-123');

      expect(mockWhere).toHaveBeenCalledWith({ integration_id: 'int-123', active: true });
    });
  });

  describe('update', () => {
    beforeEach(() => {
      // Reset where to return query builder for update tests
      mockWhere.mockReturnValue(mockQueryBuilder);
    });

    it('should update webhook and return updated record', async () => {
      const updateData: Partial<IWebhook> = {
        url: 'https://new.example.com/webhook',
        active: false,
      };

      const updatedWebhook = {
        id: 'webhook-123',
        integration_id: 'int-456',
        url: 'https://new.example.com/webhook',
        events: ['sync.completed'],
        active: false,
        updated_at: expect.any(Date),
      };

      mockReturning.mockResolvedValue([updatedWebhook]);

      const result = await model.update('webhook-123', updateData);

      expect(mockDb).toHaveBeenCalledWith('webhooks');
      expect(mockWhere).toHaveBeenCalledWith({ id: 'webhook-123' });
      expect(mockUpdate).toHaveBeenCalledWith({
        ...updateData,
        updated_at: expect.any(Date),
      });
      expect(mockReturning).toHaveBeenCalledWith('*');
      expect(result).toEqual(updatedWebhook);
    });

    it('should return null when webhook not found', async () => {
      mockReturning.mockResolvedValue([]);

      const result = await model.update('non-existent', { active: false });

      expect(result).toBeNull();
    });

    it('should automatically set updated_at', async () => {
      mockReturning.mockResolvedValue([{ id: 'webhook-123', active: true }]);

      await model.update('webhook-123', { active: true });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          updated_at: expect.any(Date),
        })
      );
    });

    it('should update last_triggered timestamp', async () => {
      const lastTriggered = new Date();
      mockReturning.mockResolvedValue([{ id: 'webhook-123', last_triggered: lastTriggered }]);

      await model.update('webhook-123', { last_triggered: lastTriggered });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          last_triggered: lastTriggered,
        })
      );
    });

    it('should update events array', async () => {
      const events = ['sync.completed', 'sync.failed', 'data.updated'];
      mockReturning.mockResolvedValue([{ id: 'webhook-123', events }]);

      await model.update('webhook-123', { events });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          events,
        })
      );
    });

    it('should update secret', async () => {
      const secret = 'whsec_new_secret';
      mockReturning.mockResolvedValue([{ id: 'webhook-123', secret }]);

      await model.update('webhook-123', { secret });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          secret,
        })
      );
    });

    it('should handle partial updates', async () => {
      mockReturning.mockResolvedValue([{ id: 'webhook-123', active: false }]);

      await model.update('webhook-123', { active: false });

      expect(mockUpdate).toHaveBeenCalledWith({
        active: false,
        updated_at: expect.any(Date),
      });
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      // Reset where to return query builder for delete tests
      mockWhere.mockReturnValue(mockQueryBuilder);
    });

    it('should return true when webhook deleted', async () => {
      mockDel.mockResolvedValue(1);

      const result = await model.delete('webhook-123');

      expect(mockDb).toHaveBeenCalledWith('webhooks');
      expect(mockWhere).toHaveBeenCalledWith({ id: 'webhook-123' });
      expect(mockDel).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when webhook not found', async () => {
      mockDel.mockResolvedValue(0);

      const result = await model.delete('non-existent');

      expect(result).toBe(false);
    });

    it('should return true when multiple rows deleted', async () => {
      mockDel.mockResolvedValue(3);

      const result = await model.delete('webhook-123');

      expect(result).toBe(true);
    });
  });
});
