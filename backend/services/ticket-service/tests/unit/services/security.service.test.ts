/**
 * Unit Tests for src/services/security.service.ts
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('../../../src/config', () => ({
  config: {
    redis: {
      url: 'redis://localhost:6379',
      password: undefined,
      tls: false,
    },
  },
}));

jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    query: jest.fn(),
  },
}));

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    incrby: jest.fn(),
    expire: jest.fn(),
    pexpire: jest.fn(),
  }));
});

import {
  accountLockout,
  spendingLimits,
  multiSig,
} from '../../../src/services/security.service';

describe('services/security.service', () => {
  describe('AccountLockoutService', () => {
    describe('recordFailedAttempt()', () => {
      it('returns lockout status', async () => {
        const result = await accountLockout.recordFailedAttempt('user@example.com');

        expect(result).toHaveProperty('locked');
        expect(result).toHaveProperty('failedAttempts');
        expect(result).toHaveProperty('remainingAttempts');
      });
    });

    describe('recordSuccessfulAttempt()', () => {
      it('executes without throwing', async () => {
        await expect(
          accountLockout.recordSuccessfulAttempt('user@example.com')
        ).resolves.not.toThrow();
      });
    });

    describe('isLocked()', () => {
      it('returns lockout status', async () => {
        const result = await accountLockout.isLocked('user@example.com');

        expect(result).toHaveProperty('locked');
        expect(result).toHaveProperty('failedAttempts');
      });
    });

    describe('unlock()', () => {
      it('executes without throwing', async () => {
        await expect(
          accountLockout.unlock('user@example.com', 'admin-123')
        ).resolves.not.toThrow();
      });
    });
  });

  describe('SpendingLimitsService', () => {
    describe('getLimits()', () => {
      it('returns default limits when none configured', async () => {
        const { DatabaseService } = require('../../../src/services/databaseService');
        DatabaseService.query.mockRejectedValueOnce(new Error('Table not found'));

        const limits = await spendingLimits.getLimits('user-123', 'tenant-456');

        expect(limits).toHaveProperty('dailyLimit');
        expect(limits).toHaveProperty('weeklyLimit');
        expect(limits).toHaveProperty('monthlyLimit');
        expect(limits).toHaveProperty('perTransactionLimit');
      });
    });

    describe('checkTransaction()', () => {
      it('rejects transaction exceeding per-transaction limit', async () => {
        const result = await spendingLimits.checkTransaction(
          'user-123',
          'tenant-456',
          100000 // $1000, which exceeds default $500 limit
        );

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('per-transaction');
      });

      it('allows transaction within limits', async () => {
        const result = await spendingLimits.checkTransaction(
          'user-123',
          'tenant-456',
          1000 // $10
        );

        expect(result.allowed).toBe(true);
        expect(result.status).toBeDefined();
      });
    });

    describe('getSpendingStatus()', () => {
      it('returns spending status', async () => {
        const status = await spendingLimits.getSpendingStatus('user-123', 'tenant-456');

        expect(status).toHaveProperty('dailySpent');
        expect(status).toHaveProperty('weeklySpent');
        expect(status).toHaveProperty('monthlySpent');
        expect(status).toHaveProperty('dailyRemaining');
      });
    });
  });

  describe('MultiSigService', () => {
    describe('requiresMultiSig()', () => {
      it('returns required for high-value transfers', () => {
        const result = multiSig.requiresMultiSig('transfer:high_value', {});

        expect(result.required).toBe(true);
        expect(result.config).toBeDefined();
      });

      it('returns required for bulk minting', () => {
        const result = multiSig.requiresMultiSig('mint:bulk', {});

        expect(result.required).toBe(true);
      });

      it('returns required for high-value amounts', () => {
        const result = multiSig.requiresMultiSig('transfer:standard', {
          amountCents: 150000, // $1500
        });

        expect(result.required).toBe(true);
      });

      it('returns not required for low-value operations', () => {
        const result = multiSig.requiresMultiSig('transfer:standard', {
          amountCents: 1000, // $10
        });

        expect(result.required).toBe(false);
      });
    });

    describe('getRequest()', () => {
      it('returns null for non-existent request', async () => {
        const result = await multiSig.getRequest('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('getPendingRequests()', () => {
      it('returns empty array', async () => {
        const result = await multiSig.getPendingRequests('admin');

        expect(result).toEqual([]);
      });
    });
  });
});
