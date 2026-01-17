import {
  isWebhookDuplicate,
  markWebhookProcessed,
  checkAndMarkWebhook,
  extractSendGridEventId,
  extractTwilioEventId,
} from '../../../src/utils/webhook-dedup';
import { db } from '../../../src/config/database';
import { logger } from '../../../src/config/logger';

jest.mock('../../../src/config/database', () => ({
  db: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    first: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    onConflict: jest.fn().mockReturnThis(),
    ignore: jest.fn(),
  })),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    REDIS_PASSWORD: '',
    REDIS_DB: 0,
  },
}));

const mockRedis = {
  exists: jest.fn(),
  setex: jest.fn(),
  on: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

describe('Webhook Deduplication', () => {
  let mockDbChain: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockDbChain = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      onConflict: jest.fn().mockReturnThis(),
      ignore: jest.fn(),
    };
    
    (db as jest.Mock).mockReturnValue(mockDbChain);
  });

  describe('isWebhookDuplicate()', () => {
    it('should return false for new webhook (Redis check)', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockDbChain.first.mockResolvedValue(null);

      const result = await isWebhookDuplicate('sendgrid', 'event-123');

      expect(result).toBe(false);
      expect(mockRedis.exists).toHaveBeenCalledWith('notification:webhook:sendgrid:event-123');
    });

    it('should return true for duplicate webhook (Redis)', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await isWebhookDuplicate('sendgrid', 'event-123');

      expect(result).toBe(true);
      expect(logger.debug).toHaveBeenCalledWith('Webhook duplicate detected (Redis)', {
        provider: 'sendgrid',
        eventId: 'event-123',
      });
    });

    it('should fallback to database on Redis failure', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Redis error'));
      mockDbChain.first.mockResolvedValue({ id: 1, provider: 'sendgrid', event_id: 'event-123' });

      const result = await isWebhookDuplicate('sendgrid', 'event-123');

      expect(result).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith('Redis webhook check failed, using memory', expect.any(Object));
      expect(logger.debug).toHaveBeenCalledWith('Webhook duplicate detected (DB)', {
        provider: 'sendgrid',
        eventId: 'event-123',
      });
    });

    it('should check database when not in Redis or memory', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockDbChain.first.mockResolvedValue(null);

      const result = await isWebhookDuplicate('twilio', 'msg-456');

      expect(result).toBe(false);
      expect(db).toHaveBeenCalledWith('notification_webhook_events');
      expect(mockDbChain.where).toHaveBeenCalledWith({
        provider: 'twilio',
        event_id: 'msg-456',
      });
    });

    it('should handle database errors gracefully', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockDbChain.first.mockRejectedValue(new Error('DB error'));

      const result = await isWebhookDuplicate('sendgrid', 'event-123');

      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith('Database webhook check failed', expect.any(Object));
    });
  });

  describe('markWebhookProcessed()', () => {
    it('should mark webhook in Redis and database', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      mockDbChain.ignore.mockResolvedValue(1);

      await markWebhookProcessed('sendgrid', 'event-123', 'delivered', { test: 'data' });

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'notification:webhook:sendgrid:event-123',
        604800, // 7 days
        expect.stringContaining('delivered')
      );
      
      expect(db).toHaveBeenCalledWith('notification_webhook_events');
      expect(mockDbChain.insert).toHaveBeenCalledWith({
        provider: 'sendgrid',
        event_id: 'event-123',
        event_type: 'delivered',
        payload: '{"test":"data"}',
        processed_at: expect.any(Date),
        created_at: expect.any(Date),
      });
    });

    it('should handle null payload', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      mockDbChain.ignore.mockResolvedValue(1);

      await markWebhookProcessed('twilio', 'msg-456', 'sent');

      const insertCall = mockDbChain.insert.mock.calls[0][0];
      expect(insertCall.payload).toBeNull();
    });

    it('should continue if Redis fails but database succeeds', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));
      mockDbChain.ignore.mockResolvedValue(1);

      await markWebhookProcessed('sendgrid', 'event-123', 'delivered');

      expect(logger.warn).toHaveBeenCalledWith('Redis webhook mark failed', expect.any(Object));
      expect(logger.debug).toHaveBeenCalledWith('Webhook marked as processed', {
        provider: 'sendgrid',
        eventId: 'event-123',
        eventType: 'delivered',
      });
    });

    it('should handle database insert failures gracefully', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      mockDbChain.ignore.mockRejectedValue(new Error('DB error'));

      await markWebhookProcessed('sendgrid', 'event-123', 'delivered');

      expect(logger.warn).toHaveBeenCalledWith('Database webhook mark failed', expect.any(Object));
    });
  });

  describe('checkAndMarkWebhook()', () => {
    it('should process new webhook', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockDbChain.first.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDbChain.ignore.mockResolvedValue(1);

      const result = await checkAndMarkWebhook('sendgrid', 'event-123', 'delivered', { test: 'data' });

      expect(result).toBe(true);
      expect(mockRedis.setex).toHaveBeenCalled();
      expect(mockDbChain.insert).toHaveBeenCalled();
    });

    it('should skip duplicate webhook', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await checkAndMarkWebhook('sendgrid', 'event-123', 'delivered');

      expect(result).toBe(false);
      expect(logger.info).toHaveBeenCalledWith('Skipping duplicate webhook', {
        provider: 'sendgrid',
        eventId: 'event-123',
        eventType: 'delivered',
      });
      expect(mockDbChain.insert).not.toHaveBeenCalled();
    });

    it('should work with different providers', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockDbChain.first.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDbChain.ignore.mockResolvedValue(1);

      await checkAndMarkWebhook('twilio', 'msg-456', 'sent');

      expect(mockRedis.exists).toHaveBeenCalledWith('notification:webhook:twilio:msg-456');
    });
  });

  describe('extractSendGridEventId()', () => {
    it('should extract sg_event_id', () => {
      const event = { sg_event_id: 'evt-123', sg_message_id: 'msg-456' };
      
      const result = extractSendGridEventId(event);
      
      expect(result).toBe('evt-123');
    });

    it('should fallback to sg_message_id', () => {
      const event = { sg_message_id: 'msg-456' };
      
      const result = extractSendGridEventId(event);
      
      expect(result).toBe('msg-456');
    });

    it('should return null if no IDs present', () => {
      const event = { email: 'test@example.com' };
      
      const result = extractSendGridEventId(event);
      
      expect(result).toBeNull();
    });

    it('should prefer sg_event_id over sg_message_id', () => {
      const event = { 
        sg_event_id: 'evt-123',
        sg_message_id: 'msg-456',
      };
      
      const result = extractSendGridEventId(event);
      
      expect(result).toBe('evt-123');
    });
  });

  describe('extractTwilioEventId()', () => {
    it('should extract MessageSid with status', () => {
      const event = { 
        MessageSid: 'SM123abc',
        MessageStatus: 'delivered',
      };
      
      const result = extractTwilioEventId(event);
      
      expect(result).toBe('SM123abc:delivered');
    });

    it('should handle SmsSid and SmsStatus', () => {
      const event = { 
        SmsSid: 'SM456def',
        SmsStatus: 'sent',
      };
      
      const result = extractTwilioEventId(event);
      
      expect(result).toBe('SM456def:sent');
    });

    it('should return MessageSid only if no status', () => {
      const event = { MessageSid: 'SM123abc' };
      
      const result = extractTwilioEventId(event);
      
      expect(result).toBe('SM123abc');
    });

    it('should return null if no SID present', () => {
      const event = { Body: 'Test message' };
      
      const result = extractTwilioEventId(event);
      
      expect(result).toBeNull();
    });

    it('should handle status updates for same message', () => {
      const event1 = { MessageSid: 'SM123', MessageStatus: 'sent' };
      const event2 = { MessageSid: 'SM123', MessageStatus: 'delivered' };
      
      const id1 = extractTwilioEventId(event1);
      const id2 = extractTwilioEventId(event2);
      
      // Different IDs for different statuses of same message
      expect(id1).toBe('SM123:sent');
      expect(id2).toBe('SM123:delivered');
      expect(id1).not.toBe(id2);
    });
  });
});
