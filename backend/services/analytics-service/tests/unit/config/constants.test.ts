/**
 * Constants Configuration Tests
 */

import { CONSTANTS } from '../../../src/config/constants';

describe('CONSTANTS', () => {
  describe('CACHE_TTL', () => {
    it('should have all required cache TTL values', () => {
      expect(CONSTANTS.CACHE_TTL).toHaveProperty('REAL_TIME');
      expect(CONSTANTS.CACHE_TTL).toHaveProperty('METRICS');
      expect(CONSTANTS.CACHE_TTL).toHaveProperty('INSIGHTS');
      expect(CONSTANTS.CACHE_TTL).toHaveProperty('CUSTOMER_PROFILE');
      expect(CONSTANTS.CACHE_TTL).toHaveProperty('DASHBOARD');
    });

    it('should have positive integer TTL values', () => {
      Object.values(CONSTANTS.CACHE_TTL).forEach((ttl) => {
        expect(typeof ttl).toBe('number');
        expect(ttl).toBeGreaterThan(0);
        expect(Number.isInteger(ttl)).toBe(true);
      });
    });

    it('should have REAL_TIME as shortest TTL', () => {
      const ttls = Object.values(CONSTANTS.CACHE_TTL);
      const minTTL = Math.min(...ttls);
      expect(CONSTANTS.CACHE_TTL.REAL_TIME).toBe(minTTL);
    });

    it('should have CUSTOMER_PROFILE as longest TTL', () => {
      const ttls = Object.values(CONSTANTS.CACHE_TTL);
      const maxTTL = Math.max(...ttls);
      expect(CONSTANTS.CACHE_TTL.CUSTOMER_PROFILE).toBe(maxTTL);
    });
  });

  describe('METRIC_TYPES', () => {
    it('should have all required metric types', () => {
      expect(CONSTANTS.METRIC_TYPES).toEqual({
        SALES: 'sales',
        REVENUE: 'revenue',
        ATTENDANCE: 'attendance',
        CAPACITY: 'capacity',
        CONVERSION: 'conversion',
        CART_ABANDONMENT: 'cart_abandonment',
      });
    });

    it('should have lowercase string values', () => {
      Object.values(CONSTANTS.METRIC_TYPES).forEach((type) => {
        expect(typeof type).toBe('string');
        expect(type).toBe(type.toLowerCase());
      });
    });
  });

  describe('WIDGET_CATEGORIES', () => {
    it('should have all required widget categories', () => {
      expect(CONSTANTS.WIDGET_CATEGORIES).toEqual({
        REAL_TIME: 'real-time',
        INSIGHTS: 'insights',
        PREDICTIONS: 'predictions',
        CUSTOM: 'custom',
      });
    });
  });

  describe('CUSTOMER_SEGMENTS', () => {
    it('should have all required customer segments', () => {
      expect(CONSTANTS.CUSTOMER_SEGMENTS).toEqual({
        NEW: 'new',
        RETURNING: 'returning',
        VIP: 'vip',
        AT_RISK: 'at_risk',
        LOST: 'lost',
      });
    });

    it('should have 5 segments', () => {
      expect(Object.keys(CONSTANTS.CUSTOMER_SEGMENTS)).toHaveLength(5);
    });
  });

  describe('ALERT_PRIORITIES', () => {
    it('should have all required alert priorities', () => {
      expect(CONSTANTS.ALERT_PRIORITIES).toEqual({
        LOW: 'low',
        MEDIUM: 'medium',
        HIGH: 'high',
        CRITICAL: 'critical',
      });
    });

    it('should have 4 priority levels', () => {
      expect(Object.keys(CONSTANTS.ALERT_PRIORITIES)).toHaveLength(4);
    });
  });

  describe('EXPORT_FORMATS', () => {
    it('should have all required export formats', () => {
      expect(CONSTANTS.EXPORT_FORMATS).toEqual({
        CSV: 'csv',
        XLSX: 'xlsx',
        PDF: 'pdf',
        JSON: 'json',
      });
    });
  });

  describe('RETENTION_PERIODS', () => {
    it('should have all required retention periods', () => {
      expect(CONSTANTS.RETENTION_PERIODS).toHaveProperty('RAW_EVENTS');
      expect(CONSTANTS.RETENTION_PERIODS).toHaveProperty('AGGREGATED_METRICS');
      expect(CONSTANTS.RETENTION_PERIODS).toHaveProperty('CUSTOMER_PROFILES');
      expect(CONSTANTS.RETENTION_PERIODS).toHaveProperty('AUDIT_LOGS');
    });

    it('should have positive integer day values', () => {
      Object.values(CONSTANTS.RETENTION_PERIODS).forEach((days) => {
        expect(typeof days).toBe('number');
        expect(days).toBeGreaterThan(0);
        expect(Number.isInteger(days)).toBe(true);
      });
    });

    it('should have AUDIT_LOGS as longest retention (7 years)', () => {
      expect(CONSTANTS.RETENTION_PERIODS.AUDIT_LOGS).toBe(2555);
    });

    it('should have RAW_EVENTS as shortest retention', () => {
      expect(CONSTANTS.RETENTION_PERIODS.RAW_EVENTS).toBe(30);
    });
  });

  describe('RATE_LIMITS', () => {
    it('should have all required rate limits', () => {
      expect(CONSTANTS.RATE_LIMITS).toEqual({
        REAL_TIME: 100,
        EXPORTS: 10,
        MESSAGES: 50,
      });
    });

    it('should have positive values', () => {
      Object.values(CONSTANTS.RATE_LIMITS).forEach((limit) => {
        expect(limit).toBeGreaterThan(0);
      });
    });
  });

  describe('BATCH_SIZES', () => {
    it('should have all required batch sizes', () => {
      expect(CONSTANTS.BATCH_SIZES).toEqual({
        EVENT_PROCESSING: 100,
        AGGREGATION: 1000,
        EXPORT: 10000,
      });
    });

    it('should have increasing batch sizes', () => {
      expect(CONSTANTS.BATCH_SIZES.EVENT_PROCESSING).toBeLessThan(CONSTANTS.BATCH_SIZES.AGGREGATION);
      expect(CONSTANTS.BATCH_SIZES.AGGREGATION).toBeLessThan(CONSTANTS.BATCH_SIZES.EXPORT);
    });
  });

  describe('QUEUE_PRIORITIES', () => {
    it('should have all required queue priorities', () => {
      expect(CONSTANTS.QUEUE_PRIORITIES).toEqual({
        HIGH: 1,
        MEDIUM: 5,
        LOW: 10,
      });
    });

    it('should have HIGH as lowest number (highest priority)', () => {
      expect(CONSTANTS.QUEUE_PRIORITIES.HIGH).toBeLessThan(CONSTANTS.QUEUE_PRIORITIES.MEDIUM);
      expect(CONSTANTS.QUEUE_PRIORITIES.MEDIUM).toBeLessThan(CONSTANTS.QUEUE_PRIORITIES.LOW);
    });
  });
});
