const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('../../../src/config/redis', () => ({
  getRedis: () => mockRedis,
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

import {
  getRecentPasswordReset,
  storePasswordResetIdempotency,
  getRecentMFASetup,
  storeMFASetupIdempotency,
  clearMFASetupIdempotency,
} from '../../../src/utils/idempotency-helpers';

describe('idempotency-helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRecentPasswordReset', () => {
    it('returns existing token if within window', async () => {
      mockRedis.get.mockResolvedValue('existing-token');

      const result = await getRecentPasswordReset('test@example.com');

      expect(result).toBe('existing-token');
      expect(mockRedis.get).toHaveBeenCalledWith('idempotent:password-reset:test@example.com');
    });

    it('normalizes email to lowercase', async () => {
      mockRedis.get.mockResolvedValue(null);

      await getRecentPasswordReset('TEST@EXAMPLE.COM');

      expect(mockRedis.get).toHaveBeenCalledWith('idempotent:password-reset:test@example.com');
    });

    it('returns null on miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await getRecentPasswordReset('new@example.com');

      expect(result).toBeNull();
    });

    it('returns null on Redis error (fail-open)', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis down'));

      const result = await getRecentPasswordReset('test@example.com');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('storePasswordResetIdempotency', () => {
    it('stores token with 5 minute TTL', async () => {
      await storePasswordResetIdempotency('test@example.com', 'token-123');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'idempotent:password-reset:test@example.com',
        300, // 5 minutes
        'token-123'
      );
    });

    it('normalizes email to lowercase', async () => {
      await storePasswordResetIdempotency('TEST@EXAMPLE.COM', 'token');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'idempotent:password-reset:test@example.com',
        300,
        'token'
      );
    });

    it('logs warning on Redis error but does not throw', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis down'));

      await expect(
        storePasswordResetIdempotency('test@example.com', 'token')
      ).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('getRecentMFASetup', () => {
    it('returns parsed setup data if within window', async () => {
      const setupData = { secret: 'SECRET', qrCode: 'data:image/png' };
      mockRedis.get.mockResolvedValue(JSON.stringify(setupData));

      const result = await getRecentMFASetup('user-123');

      expect(result).toEqual(setupData);
      expect(mockRedis.get).toHaveBeenCalledWith('idempotent:mfa-setup:user-123');
    });

    it('returns null on miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await getRecentMFASetup('user-123');

      expect(result).toBeNull();
    });

    it('returns null on Redis error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis down'));

      const result = await getRecentMFASetup('user-123');

      expect(result).toBeNull();
    });
  });

  describe('storeMFASetupIdempotency', () => {
    it('stores setup data with 10 minute TTL', async () => {
      const setupData = { secret: 'SECRET', qrCode: 'data:image/png' };

      await storeMFASetupIdempotency('user-123', setupData);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'idempotent:mfa-setup:user-123',
        600, // 10 minutes
        JSON.stringify(setupData)
      );
    });

    it('logs warning on Redis error but does not throw', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis down'));

      await expect(
        storeMFASetupIdempotency('user-123', { secret: 's', qrCode: 'q' })
      ).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('clearMFASetupIdempotency', () => {
    it('deletes the idempotency key', async () => {
      await clearMFASetupIdempotency('user-123');

      expect(mockRedis.del).toHaveBeenCalledWith('idempotent:mfa-setup:user-123');
    });

    it('logs warning on Redis error but does not throw', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis down'));

      await expect(clearMFASetupIdempotency('user-123')).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});
