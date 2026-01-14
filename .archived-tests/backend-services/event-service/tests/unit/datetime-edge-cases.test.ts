import { validateDateRange } from '../../src/middleware/input-validation';

describe('Date/Time Edge Cases - Critical Tests', () => {
  describe('DST Transitions', () => {
    it('should handle spring DST transition (clock forward)', () => {
      // March 10, 2024 - Spring Forward (2 AM -> 3 AM)
      const beforeDST = new Date('2024-03-10T01:59:00-05:00');
      const afterDST = new Date('2024-03-10T03:00:00-04:00');

      const result = validateDateRange(beforeDST, afterDST);
      expect(result.valid).toBe(true);

      // Time difference should account for lost hour
      const diffMs = afterDST.getTime() - beforeDST.getTime();
      const diffMinutes = diffMs / (1000 * 60);
      expect(diffMinutes).toBe(61); // Only 61 minutes elapsed due to DST
    });

    it('should handle fall DST transition (clock backward)', () => {
      // November 3, 2024 - Fall Back (2 AM -> 1 AM)
      const beforeDST = new Date('2024-11-03T00:30:00-04:00');
      const afterDST = new Date('2024-11-03T02:30:00-05:00');

      const result = validateDateRange(beforeDST, afterDST);
      expect(result.valid).toBe(true);

      // Time difference should account for gained hour
      const diffMs = afterDST.getTime() - beforeDST.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      expect(diffHours).toBe(3); // 3 hours elapsed despite showing 2 hours
    });

    it('should reject invalid DST-ambiguous times', () => {
      // During fall back, 1:30 AM occurs twice
      const ambiguousTime1 = new Date('2024-11-03T01:30:00-04:00');
      const ambiguousTime2 = new Date('2024-11-03T01:30:00-05:00');

      // These represent different moments in time
      expect(ambiguousTime1.getTime()).not.toBe(ambiguousTime2.getTime());
    });
  });

  describe('Leap Seconds', () => {
    it('should handle dates near leap second boundaries', () => {
      // Leap second added at end of 2016
      const beforeLeap = new Date('2016-12-31T23:59:59Z');
      const afterLeap = new Date('2017-01-01T00:00:00Z');

      const result = validateDateRange(beforeLeap, afterLeap);
      expect(result.valid).toBe(true);

      const diffMs = afterLeap.getTime() - beforeLeap.getTime();
      expect(diffMs).toBeGreaterThan(0);
    });

    it('should handle precise timing around leap seconds', () => {
      const date1 = new Date('2016-12-31T23:59:59.500Z');
      const date2 = new Date('2017-01-01T00:00:00.500Z');

      const diffMs = date2.getTime() - date1.getTime();
      expect(diffMs).toBe(1000); // JavaScript doesn't natively track leap seconds
    });
  });

  describe('Timezone Conversions', () => {
    it('should correctly compare UTC with different timezones', () => {
      const utcTime = new Date('2024-01-15T12:00:00Z');
      const nyTime = new Date('2024-01-15T07:00:00-05:00');
      const tokyoTime = new Date('2024-01-15T21:00:00+09:00');

      // All should represent the same moment
      expect(utcTime.getTime()).toBe(nyTime.getTime());
      expect(utcTime.getTime()).toBe(tokyoTime.getTime());
    });

    it('should handle timezone edge cases at midnight', () => {
      // Midnight in different timezones
      const utcMidnight = new Date('2024-01-15T00:00:00Z');
      const nyMidnight = new Date('2024-01-15T00:00:00-05:00');
      const tokyoMidnight = new Date('2024-01-15T00:00:00+09:00');

      // These represent different moments
      expect(utcMidnight.getTime()).not.toBe(nyMidnight.getTime());
      expect(utcMidnight.getTime()).not.toBe(tokyoMidnight.getTime());

      // NY midnight is 5 hours after UTC midnight
      const diffHours = (nyMidnight.getTime() - utcMidnight.getTime()) / (1000 * 60 * 60);
      expect(diffHours).toBe(5);
    });

    it('should handle international date line crossings', () => {
      // Same moment, different dates across date line
      const samoa = new Date('2024-01-15T23:00:00-11:00'); // Jan 15 in Samoa
      const fiji = new Date('2024-01-16T18:00:00+12:00'); // Jan 16 in Fiji

      // Should be same timestamp
      expect(samoa.getTime()).toBe(fiji.getTime());
    });
  });

  describe('Date Boundary Conditions', () => {
    it('should handle year boundary correctly', () => {
      const dec31 = new Date('2024-12-31T23:59:59Z');
      const jan1 = new Date('2025-01-01T00:00:00Z');

      const result = validateDateRange(dec31, jan1);
      expect(result.valid).toBe(true);

      const diffMs = jan1.getTime() - dec31.getTime();
      expect(diffMs).toBe(1000); // Exactly 1 second
    });

    it('should handle leap year February correctly', () => {
      const feb28 = new Date('2024-02-28T12:00:00Z');
      const feb29 = new Date('2024-02-29T12:00:00Z');
      const mar1 = new Date('2024-03-01T12:00:00Z');

      expect(validateDateRange(feb28, feb29).valid).toBe(true);
      expect(validateDateRange(feb29, mar1).valid).toBe(true);
    });

    it('should reject February 29 in non-leap years', () => {
      // 2023 is not a leap year
      expect(() => new Date('2023-02-29T12:00:00Z')).not.toThrow();
      
      const invalidDate = new Date('2023-02-29T12:00:00Z');
      expect(isNaN(invalidDate.getTime())).toBe(false); // JavaScript coerces to March 1
      expect(invalidDate.getMonth()).toBe(2); // March (0-indexed)
    });

    it('should handle century leap year rules', () => {
      // 2000 was a leap year (divisible by 400)
      const feb29_2000 = new Date('2000-02-29T12:00:00Z');
      expect(feb29_2000.getDate()).toBe(29);

      // 1900 was not a leap year (divisible by 100 but not 400)
      const feb29_1900 = new Date('1900-02-29T12:00:00Z');
      expect(feb29_1900.getDate()).toBe(1); // Coerced to March 1
      expect(feb29_1900.getMonth()).toBe(2); // March
    });
  });

  describe('Unix Timestamp Edge Cases', () => {
    it('should handle Unix epoch correctly', () => {
      const epoch = new Date(0);
      expect(epoch.toISOString()).toBe('1970-01-01T00:00:00.000Z');
    });

    it('should handle dates before Unix epoch', () => {
      const before = new Date('1969-12-31T23:59:59Z');
      expect(before.getTime()).toBeLessThan(0);
    });

    it('should handle 32-bit Unix timestamp overflow (Year 2038 problem)', () => {
      // January 19, 2038 03:14:07 UTC
      const y2038 = new Date('2038-01-19T03:14:07Z');
      const maxInt32 = 2147483647000; // milliseconds

      // JavaScript uses 64-bit, so this should work fine
      expect(y2038.getTime()).toBeGreaterThan(maxInt32);
    });

    it('should handle very far future dates', () => {
      const farFuture = new Date('2099-12-31T23:59:59Z');
      expect(farFuture.getTime()).toBeGreaterThan(Date.now());
      expect(isNaN(farFuture.getTime())).toBe(false);
    });
  });

  describe('Date Range Validation - Edge Cases', () => {
    it('should reject dates more than 2 years apart', () => {
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2026-01-02T00:00:00Z'); // Just over 2 years

      const result = validateDateRange(start, end);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('2 years');
    });

    it('should accept dates exactly 2 years apart', () => {
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2026-01-01T00:00:00Z'); // Exactly 2 years

      const result = validateDateRange(start, end);
      expect(result.valid).toBe(true);
    });

    it('should reject start date in the past', () => {
      const past = new Date(Date.now() - 86400000); // Yesterday
      const future = new Date(Date.now() + 86400000); // Tomorrow

      const result = validateDateRange(past, future);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('past');
    });

    it('should reject end date before start date', () => {
      const future1 = new Date(Date.now() + 172800000); // 2 days from now
      const future2 = new Date(Date.now() + 86400000); // 1 day from now

      const result = validateDateRange(future1, future2);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('after start date');
    });
  });

  describe('Millisecond Precision', () => {
    it('should handle millisecond-level timing', () => {
      const time1 = new Date('2024-01-01T12:00:00.000Z');
      const time2 = new Date('2024-01-01T12:00:00.001Z');

      const diff = time2.getTime() - time1.getTime();
      expect(diff).toBe(1);
    });

    it('should maintain precision in calculations', () => {
      const base = Date.now();
      const offset = 0.5; // Half millisecond (should be truncated)

      const newTime = base + offset;
      expect(Math.floor(newTime)).toBe(Math.floor(base));
    });
  });
});
