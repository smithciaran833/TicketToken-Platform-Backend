/**
 * Timezone Validator Integration Tests
 */

import {
  validateTimezone,
  validateTimezoneOrThrow,
  getAllTimezones,
  getTimezoneInfo,
} from '../../src/utils/timezone-validator';

describe('Timezone Validator', () => {
  // ==========================================================================
  // validateTimezone
  // ==========================================================================
  describe('validateTimezone', () => {
    it('should return true for valid IANA timezones', () => {
      expect(validateTimezone('America/New_York')).toBe(true);
      expect(validateTimezone('Europe/London')).toBe(true);
      expect(validateTimezone('Asia/Tokyo')).toBe(true);
      expect(validateTimezone('Australia/Sydney')).toBe(true);
      expect(validateTimezone('Pacific/Auckland')).toBe(true);
    });

    it('should return true for UTC', () => {
      expect(validateTimezone('UTC')).toBe(true);
    });

    it('should return false for invalid timezones', () => {
      expect(validateTimezone('INVALID_TIMEZONE')).toBe(false);
      expect(validateTimezone('America/InvalidCity')).toBe(false);
      expect(validateTimezone('NotATimezone')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(validateTimezone('')).toBe(false);
    });

    it('should return false for whitespace only', () => {
      expect(validateTimezone('   ')).toBe(false);
    });

    it('should return false for null', () => {
      expect(validateTimezone(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(validateTimezone(undefined)).toBe(false);
    });

    it('should handle common US timezones', () => {
      expect(validateTimezone('America/New_York')).toBe(true);
      expect(validateTimezone('America/Chicago')).toBe(true);
      expect(validateTimezone('America/Denver')).toBe(true);
      expect(validateTimezone('America/Los_Angeles')).toBe(true);
    });

    it('should handle common European timezones', () => {
      expect(validateTimezone('Europe/London')).toBe(true);
      expect(validateTimezone('Europe/Paris')).toBe(true);
      expect(validateTimezone('Europe/Berlin')).toBe(true);
      expect(validateTimezone('Europe/Rome')).toBe(true);
    });

    it('should handle common Asian timezones', () => {
      expect(validateTimezone('Asia/Tokyo')).toBe(true);
      expect(validateTimezone('Asia/Shanghai')).toBe(true);
      expect(validateTimezone('Asia/Singapore')).toBe(true);
      expect(validateTimezone('Asia/Dubai')).toBe(true);
    });
  });

  // ==========================================================================
  // validateTimezoneOrThrow
  // ==========================================================================
  describe('validateTimezoneOrThrow', () => {
    it('should not throw for valid timezone', () => {
      expect(() => validateTimezoneOrThrow('America/New_York')).not.toThrow();
      expect(() => validateTimezoneOrThrow('UTC')).not.toThrow();
    });

    it('should not throw for null (allows default)', () => {
      expect(() => validateTimezoneOrThrow(null)).not.toThrow();
    });

    it('should not throw for undefined (allows default)', () => {
      expect(() => validateTimezoneOrThrow(undefined)).not.toThrow();
    });

    it('should throw for invalid timezone', () => {
      expect(() => validateTimezoneOrThrow('INVALID')).toThrow();
    });

    it('should throw with helpful error message', () => {
      expect(() => validateTimezoneOrThrow('BadTimezone')).toThrow(
        /Invalid timezone: "BadTimezone"/
      );
    });

    it('should include valid timezone examples in error', () => {
      try {
        validateTimezoneOrThrow('Invalid');
      } catch (e: any) {
        expect(e.message).toContain('America/New_York');
        expect(e.message).toContain('Europe/London');
        expect(e.message).toContain('Asia/Tokyo');
      }
    });
  });

  // ==========================================================================
  // getAllTimezones
  // ==========================================================================
  describe('getAllTimezones', () => {
    it('should return an array of timezones', () => {
      const timezones = getAllTimezones();

      expect(Array.isArray(timezones)).toBe(true);
      expect(timezones.length).toBeGreaterThan(0);
    });

    it('should include UTC', () => {
      const timezones = getAllTimezones();

      expect(timezones).toContain('UTC');
    });

    it('should include common timezones', () => {
      const timezones = getAllTimezones();

      expect(timezones).toContain('America/New_York');
      expect(timezones).toContain('Europe/London');
      expect(timezones).toContain('Asia/Tokyo');
      expect(timezones).toContain('Australia/Sydney');
    });

    it('should return valid IANA timezones', () => {
      const timezones = getAllTimezones();

      timezones.forEach(tz => {
        expect(validateTimezone(tz)).toBe(true);
      });
    });
  });

  // ==========================================================================
  // getTimezoneInfo
  // ==========================================================================
  describe('getTimezoneInfo', () => {
    it('should return info for valid timezone', () => {
      const info = getTimezoneInfo('America/New_York');

      expect(info).not.toBeNull();
      expect(info!.name).toBe('America/New_York');
      expect(info!.isValid).toBe(true);
      expect(info!.offset).toBeDefined();
    });

    it('should return null for invalid timezone', () => {
      const info = getTimezoneInfo('Invalid/Timezone');

      expect(info).toBeNull();
    });

    it('should return offset string', () => {
      const info = getTimezoneInfo('UTC');

      expect(info!.offset).toBe('+0000');
    });

    it('should return correct name in info', () => {
      const info = getTimezoneInfo('Europe/Paris');

      expect(info!.name).toBe('Europe/Paris');
    });

    it('should work with various valid timezones', () => {
      const timezones = ['UTC', 'America/Chicago', 'Asia/Singapore', 'Pacific/Auckland'];

      timezones.forEach(tz => {
        const info = getTimezoneInfo(tz);
        expect(info).not.toBeNull();
        expect(info!.name).toBe(tz);
        expect(info!.isValid).toBe(true);
      });
    });
  });
});
