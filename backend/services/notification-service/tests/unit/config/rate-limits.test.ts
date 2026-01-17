import { RATE_LIMITS, shouldBypassRateLimit } from '../../../src/config/rate-limits';

describe('Rate Limits Configuration', () => {
  describe('RATE_LIMITS Configuration', () => {
    describe('Email Limits', () => {
      it('should have default per-user email limit', () => {
        expect(RATE_LIMITS.email.perUser.max).toBe(20);
        expect(RATE_LIMITS.email.perUser.duration).toBe(3600);
      });

      it('should have default global email limit', () => {
        expect(RATE_LIMITS.email.global.max).toBe(1000);
        expect(RATE_LIMITS.email.global.duration).toBe(60);
      });

      it('should respect environment variable for per-user email limit', () => {
        const originalEnv = process.env.RATE_LIMIT_EMAIL_PER_USER;
        process.env.RATE_LIMIT_EMAIL_PER_USER = '50';
        
        jest.resetModules();
        const { RATE_LIMITS: limits } = require('../../../src/config/rate-limits');
        
        expect(limits.email.perUser.max).toBe(50);
        
        process.env.RATE_LIMIT_EMAIL_PER_USER = originalEnv;
      });

      it('should respect environment variable for global email limit', () => {
        const originalEnv = process.env.RATE_LIMIT_EMAIL_GLOBAL;
        process.env.RATE_LIMIT_EMAIL_GLOBAL = '5000';
        
        jest.resetModules();
        const { RATE_LIMITS: limits } = require('../../../src/config/rate-limits');
        
        expect(limits.email.global.max).toBe(5000);
        
        process.env.RATE_LIMIT_EMAIL_GLOBAL = originalEnv;
      });
    });

    describe('SMS Limits', () => {
      it('should have default per-user SMS limit', () => {
        expect(RATE_LIMITS.sms.perUser.max).toBe(5);
        expect(RATE_LIMITS.sms.perUser.duration).toBe(3600);
      });

      it('should have default global SMS limit', () => {
        expect(RATE_LIMITS.sms.global.max).toBe(100);
        expect(RATE_LIMITS.sms.global.duration).toBe(60);
      });

      it('should respect environment variable for per-user SMS limit', () => {
        const originalEnv = process.env.RATE_LIMIT_SMS_PER_USER;
        process.env.RATE_LIMIT_SMS_PER_USER = '10';
        
        jest.resetModules();
        const { RATE_LIMITS: limits } = require('../../../src/config/rate-limits');
        
        expect(limits.sms.perUser.max).toBe(10);
        
        process.env.RATE_LIMIT_SMS_PER_USER = originalEnv;
      });

      it('should respect environment variable for global SMS limit', () => {
        const originalEnv = process.env.RATE_LIMIT_SMS_GLOBAL;
        process.env.RATE_LIMIT_SMS_GLOBAL = '500';
        
        jest.resetModules();
        const { RATE_LIMITS: limits } = require('../../../src/config/rate-limits');
        
        expect(limits.sms.global.max).toBe(500);
        
        process.env.RATE_LIMIT_SMS_GLOBAL = originalEnv;
      });
    });

    describe('Push Limits', () => {
      it('should have default per-user push limit', () => {
        expect(RATE_LIMITS.push.perUser.max).toBe(50);
        expect(RATE_LIMITS.push.perUser.duration).toBe(3600);
      });

      it('should have default global push limit', () => {
        expect(RATE_LIMITS.push.global.max).toBe(5000);
        expect(RATE_LIMITS.push.global.duration).toBe(60);
      });

      it('should respect environment variable for per-user push limit', () => {
        const originalEnv = process.env.RATE_LIMIT_PUSH_PER_USER;
        process.env.RATE_LIMIT_PUSH_PER_USER = '100';
        
        jest.resetModules();
        const { RATE_LIMITS: limits } = require('../../../src/config/rate-limits');
        
        expect(limits.push.perUser.max).toBe(100);
        
        process.env.RATE_LIMIT_PUSH_PER_USER = originalEnv;
      });

      it('should respect environment variable for global push limit', () => {
        const originalEnv = process.env.RATE_LIMIT_PUSH_GLOBAL;
        process.env.RATE_LIMIT_PUSH_GLOBAL = '10000';
        
        jest.resetModules();
        const { RATE_LIMITS: limits } = require('../../../src/config/rate-limits');
        
        expect(limits.push.global.max).toBe(10000);
        
        process.env.RATE_LIMIT_PUSH_GLOBAL = originalEnv;
      });
    });

    describe('Critical Notification Types', () => {
      it('should include payment_failed as critical', () => {
        expect(RATE_LIMITS.criticalTypes).toContain('payment_failed');
      });

      it('should include account_security as critical', () => {
        expect(RATE_LIMITS.criticalTypes).toContain('account_security');
      });

      it('should include account_locked as critical', () => {
        expect(RATE_LIMITS.criticalTypes).toContain('account_locked');
      });

      it('should include password_reset as critical', () => {
        expect(RATE_LIMITS.criticalTypes).toContain('password_reset');
      });

      it('should include two_factor_auth as critical', () => {
        expect(RATE_LIMITS.criticalTypes).toContain('two_factor_auth');
      });

      it('should have exactly 5 critical types', () => {
        expect(RATE_LIMITS.criticalTypes).toHaveLength(5);
      });
    });

    describe('Bypass Users', () => {
      it('should default to empty array when not set', () => {
        expect(Array.isArray(RATE_LIMITS.bypassUsers)).toBe(true);
      });

      it('should parse bypass users from environment', () => {
        const originalEnv = process.env.RATE_LIMIT_BYPASS_USERS;
        process.env.RATE_LIMIT_BYPASS_USERS = 'admin,test-user,support';
        
        jest.resetModules();
        const { RATE_LIMITS: limits } = require('../../../src/config/rate-limits');
        
        expect(limits.bypassUsers).toEqual(['admin', 'test-user', 'support']);
        
        process.env.RATE_LIMIT_BYPASS_USERS = originalEnv;
      });

      it('should filter out empty strings', () => {
        const originalEnv = process.env.RATE_LIMIT_BYPASS_USERS;
        process.env.RATE_LIMIT_BYPASS_USERS = 'admin,,test-user';
        
        jest.resetModules();
        const { RATE_LIMITS: limits } = require('../../../src/config/rate-limits');
        
        expect(limits.bypassUsers).toEqual(['admin', 'test-user']);
        
        process.env.RATE_LIMIT_BYPASS_USERS = originalEnv;
      });
    });

    describe('Bypass IPs', () => {
      it('should default to empty array when not set', () => {
        expect(Array.isArray(RATE_LIMITS.bypassIPs)).toBe(true);
      });

      it('should parse bypass IPs from environment', () => {
        const originalEnv = process.env.RATE_LIMIT_BYPASS_IPS;
        process.env.RATE_LIMIT_BYPASS_IPS = '127.0.0.1,10.0.0.1,192.168.1.1';
        
        jest.resetModules();
        const { RATE_LIMITS: limits } = require('../../../src/config/rate-limits');
        
        expect(limits.bypassIPs).toEqual(['127.0.0.1', '10.0.0.1', '192.168.1.1']);
        
        process.env.RATE_LIMIT_BYPASS_IPS = originalEnv;
      });

      it('should filter out empty strings', () => {
        const originalEnv = process.env.RATE_LIMIT_BYPASS_IPS;
        process.env.RATE_LIMIT_BYPASS_IPS = '127.0.0.1,,10.0.0.1';
        
        jest.resetModules();
        const { RATE_LIMITS: limits } = require('../../../src/config/rate-limits');
        
        expect(limits.bypassIPs).toEqual(['127.0.0.1', '10.0.0.1']);
        
        process.env.RATE_LIMIT_BYPASS_IPS = originalEnv;
      });
    });
  });

  describe('shouldBypassRateLimit()', () => {
    describe('Critical Notification Types', () => {
      it('should bypass rate limit for payment_failed', () => {
        const result = shouldBypassRateLimit(undefined, undefined, 'payment_failed');
        expect(result).toBe(true);
      });

      it('should bypass rate limit for account_security', () => {
        const result = shouldBypassRateLimit(undefined, undefined, 'account_security');
        expect(result).toBe(true);
      });

      it('should bypass rate limit for password_reset', () => {
        const result = shouldBypassRateLimit(undefined, undefined, 'password_reset');
        expect(result).toBe(true);
      });

      it('should not bypass rate limit for non-critical type', () => {
        const result = shouldBypassRateLimit(undefined, undefined, 'marketing_email');
        expect(result).toBe(false);
      });

      it('should not bypass rate limit when type is undefined', () => {
        const result = shouldBypassRateLimit(undefined, undefined, undefined);
        expect(result).toBe(false);
      });
    });

    describe('Bypass Users', () => {
      beforeEach(() => {
        const originalEnv = process.env.RATE_LIMIT_BYPASS_USERS;
        process.env.RATE_LIMIT_BYPASS_USERS = 'admin,test-user';
        jest.resetModules();
      });

      it('should bypass rate limit for admin user', () => {
        const { shouldBypassRateLimit: bypass } = require('../../../src/config/rate-limits');
        const result = bypass('admin', undefined, undefined);
        expect(result).toBe(true);
      });

      it('should bypass rate limit for test-user', () => {
        const { shouldBypassRateLimit: bypass } = require('../../../src/config/rate-limits');
        const result = bypass('test-user', undefined, undefined);
        expect(result).toBe(true);
      });

      it('should not bypass rate limit for regular user', () => {
        const { shouldBypassRateLimit: bypass } = require('../../../src/config/rate-limits');
        const result = bypass('regular-user', undefined, undefined);
        expect(result).toBe(false);
      });

      it('should not bypass rate limit when userId is undefined', () => {
        const { shouldBypassRateLimit: bypass } = require('../../../src/config/rate-limits');
        const result = bypass(undefined, undefined, undefined);
        expect(result).toBe(false);
      });
    });

    describe('Bypass IPs', () => {
      beforeEach(() => {
        const originalEnv = process.env.RATE_LIMIT_BYPASS_IPS;
        process.env.RATE_LIMIT_BYPASS_IPS = '127.0.0.1,10.0.0.1';
        jest.resetModules();
      });

      it('should bypass rate limit for 127.0.0.1', () => {
        const { shouldBypassRateLimit: bypass } = require('../../../src/config/rate-limits');
        const result = bypass(undefined, '127.0.0.1', undefined);
        expect(result).toBe(true);
      });

      it('should bypass rate limit for 10.0.0.1', () => {
        const { shouldBypassRateLimit: bypass } = require('../../../src/config/rate-limits');
        const result = bypass(undefined, '10.0.0.1', undefined);
        expect(result).toBe(true);
      });

      it('should not bypass rate limit for non-whitelisted IP', () => {
        const { shouldBypassRateLimit: bypass } = require('../../../src/config/rate-limits');
        const result = bypass(undefined, '192.168.1.1', undefined);
        expect(result).toBe(false);
      });

      it('should not bypass rate limit when IP is undefined', () => {
        const { shouldBypassRateLimit: bypass } = require('../../../src/config/rate-limits');
        const result = bypass(undefined, undefined, undefined);
        expect(result).toBe(false);
      });
    });

    describe('Multiple Bypass Conditions', () => {
      it('should bypass when critical type is present (ignores user/IP)', () => {
        const result = shouldBypassRateLimit('regular-user', '1.2.3.4', 'payment_failed');
        expect(result).toBe(true);
      });

      it('should bypass when user is in bypass list (ignores IP)', () => {
        const originalEnv = process.env.RATE_LIMIT_BYPASS_USERS;
        process.env.RATE_LIMIT_BYPASS_USERS = 'admin';
        jest.resetModules();
        
        const { shouldBypassRateLimit: bypass } = require('../../../src/config/rate-limits');
        const result = bypass('admin', '1.2.3.4', 'regular_notification');
        expect(result).toBe(true);
        
        process.env.RATE_LIMIT_BYPASS_USERS = originalEnv;
      });

      it('should bypass when IP is in bypass list', () => {
        const originalEnv = process.env.RATE_LIMIT_BYPASS_IPS;
        process.env.RATE_LIMIT_BYPASS_IPS = '127.0.0.1';
        jest.resetModules();
        
        const { shouldBypassRateLimit: bypass } = require('../../../src/config/rate-limits');
        const result = bypass('regular-user', '127.0.0.1', 'regular_notification');
        expect(result).toBe(true);
        
        process.env.RATE_LIMIT_BYPASS_IPS = originalEnv;
      });

      it('should not bypass when none of the conditions match', () => {
        const result = shouldBypassRateLimit('regular-user', '1.2.3.4', 'regular_notification');
        expect(result).toBe(false);
      });

      it('should not bypass with all parameters undefined', () => {
        const result = shouldBypassRateLimit(undefined, undefined, undefined);
        expect(result).toBe(false);
      });
    });
  });
});
