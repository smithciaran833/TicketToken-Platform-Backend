/**
 * Unit Tests for middleware/webhook-idempotency.ts
 * 
 * Tests webhook deduplication and idempotency handling.
 * Priority: 🟠 High
 */

import {
  isWebhookProcessed,
  markWebhookProcessed,
  getWebhookProcessingInfo,
  webhookIdempotencyMiddleware,
  clearWebhookProcessingStatus
} from '../../../src/middleware/webhook-idempotency';

// =============================================================================
// Mock Setup
// =============================================================================

jest.mock('../../../src/utils/logger', () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock Redis
const mockRedis = {
  exists: jest.fn(),
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  on: jest.fn()
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

const createMockRequest = (overrides: any = {}) => ({
  id: 'req-123',
  headers: {},
  url: '/webhook',
  method: 'POST',
  body: {},
  ...overrides
});

const createMockReply = () => ({
  code: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis()
});

// =============================================================================
// isWebhookProcessed Tests
// =============================================================================

describe('isWebhookProcessed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return true when event exists', async () => {
    mockRedis.exists.mockResolvedValue(1);
    
    const result = await isWebhookProcessed('event-123');
    
    expect(result).toBe(true);
    expect(mockRedis.exists).toHaveBeenCalled();
  });

  it('should return false when event does not exist', async () => {
    mockRedis.exists.mockResolvedValue(0);
    
    const result = await isWebhookProcessed('event-456');
    
    expect(result).toBe(false);
  });

  it('should return false on Redis error', async () => {
    mockRedis.exists.mockRejectedValue(new Error('Redis error'));
    
    const result = await isWebhookProcessed('event-789');
    
    expect(result).toBe(false);
  });
});

// =============================================================================
// markWebhookProcessed Tests
// =============================================================================

describe('markWebhookProcessed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call setex with correct TTL', async () => {
    mockRedis.setex.mockResolvedValue('OK');
    
    await markWebhookProcessed('event-123');
    
    expect(mockRedis.setex).toHaveBeenCalledWith(
      expect.stringContaining('webhook:processed:event-123'),
      86400, // 24 hours in seconds
      expect.any(String)
    );
  });

  it('should include metadata in stored value', async () => {
    mockRedis.setex.mockResolvedValue('OK');
    
    await markWebhookProcessed('event-123', { type: 'payment.completed' });
    
    expect(mockRedis.setex).toHaveBeenCalled();
    const storedValue = mockRedis.setex.mock.calls[0][2];
    const parsed = JSON.parse(storedValue);
    expect(parsed.type).toBe('payment.completed');
  });

  it('should include processedAt timestamp', async () => {
    mockRedis.setex.mockResolvedValue('OK');
    
    await markWebhookProcessed('event-123');
    
    const storedValue = mockRedis.setex.mock.calls[0][2];
    const parsed = JSON.parse(storedValue);
    expect(parsed.processedAt).toBeDefined();
  });

  it('should not throw on Redis error', async () => {
    mockRedis.setex.mockRejectedValue(new Error('Redis error'));
    
    await expect(markWebhookProcessed('event-123')).resolves.not.toThrow();
  });
});

// =============================================================================
// getWebhookProcessingInfo Tests
// =============================================================================

describe('getWebhookProcessingInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return null when not found', async () => {
    mockRedis.get.mockResolvedValue(null);
    
    const result = await getWebhookProcessingInfo('event-123');
    
    expect(result).toBeNull();
  });

  it('should return parsed processing info', async () => {
    const storedData = { processedAt: '2026-01-01T00:00:00Z', type: 'test.event' };
    mockRedis.get.mockResolvedValue(JSON.stringify(storedData));
    
    const result = await getWebhookProcessingInfo('event-123');
    
    expect(result).toEqual(storedData);
  });

  it('should return null on Redis error', async () => {
    mockRedis.get.mockRejectedValue(new Error('Redis error'));
    
    const result = await getWebhookProcessingInfo('event-123');
    
    expect(result).toBeNull();
  });
});

// =============================================================================
// webhookIdempotencyMiddleware Tests
// =============================================================================

describe('webhookIdempotencyMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should extract event ID from body.id', async () => {
    mockRedis.exists.mockResolvedValue(0);
    const request = createMockRequest({ body: { id: 'event-from-body' } });
    const reply = createMockReply();

    await webhookIdempotencyMiddleware(request as any, reply as any);

    expect((request as any).webhookEventId).toBe('event-from-body');
  });

  it('should extract event ID from x-webhook-id header', async () => {
    mockRedis.exists.mockResolvedValue(0);
    const request = createMockRequest({
      headers: { 'x-webhook-id': 'event-from-header' },
      body: {}
    });
    const reply = createMockReply();

    await webhookIdempotencyMiddleware(request as any, reply as any);

    expect((request as any).webhookEventId).toBe('event-from-header');
  });

  it('should return 200 for duplicate webhook', async () => {
    mockRedis.exists.mockResolvedValue(1);
    mockRedis.get.mockResolvedValue(JSON.stringify({ processedAt: '2026-01-01' }));
    const request = createMockRequest({ body: { id: 'duplicate-event' } });
    const reply = createMockReply();

    await webhookIdempotencyMiddleware(request as any, reply as any);

    expect(reply.code).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'already_processed' })
    );
  });

  it('should allow processing for new webhook', async () => {
    mockRedis.exists.mockResolvedValue(0);
    const request = createMockRequest({ body: { id: 'new-event' } });
    const reply = createMockReply();

    await webhookIdempotencyMiddleware(request as any, reply as any);

    expect(reply.code).not.toHaveBeenCalled();
    expect((request as any).webhookEventId).toBe('new-event');
  });
});

// =============================================================================
// clearWebhookProcessingStatus Tests
// =============================================================================

describe('clearWebhookProcessingStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call Redis del', async () => {
    mockRedis.del.mockResolvedValue(1);

    await clearWebhookProcessingStatus('event-123');

    expect(mockRedis.del).toHaveBeenCalledWith(
      expect.stringContaining('webhook:processed:event-123')
    );
  });

  it('should not throw on error', async () => {
    mockRedis.del.mockRejectedValue(new Error('Redis error'));

    await expect(clearWebhookProcessingStatus('event-123')).resolves.not.toThrow();
  });
});
