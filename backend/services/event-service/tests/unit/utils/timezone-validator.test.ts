/**
 * Unit tests for src/utils/timezone-validator.ts
 * Tests timezone validation using Luxon and IANA timezone database
 */

import {
  validateTimezone,
  validateTimezoneOrThrow,
  getAllTimezones,
  getTimezoneInfo,
} from '../../../src/utils/timezone-validator';

describe('utils/timezone-validator', () => {
  describe('validateTimezone()', () => {
    describe('Valid timezones', () => {
      it('should return true for UTC', () => {
        expect(validateTimezone('UTC')).toBe(true);
      });

      it('should return true for America/New_York', () => {
        expect(validateTimezone('America/New_York')).toBe(true);
      });

      it('should return true for America/Los_Angeles', () => {
        expect(validateTimezone('America/Los_Angeles')).toBe(true);
      });

      it('should return true for America/Chicago', () => {
        expect(validateTimezone('America/Chicago')).toBe(true);
      });

      it('should return true for America/Denver', () => {
        expect(validateTimezone('America/Denver')).toBe(true);
      });

      it('should return true for Europe/London', () => {
        expect(validateTimezone('Europe/London')).toBe(true);
      });

      it('should return true for Europe/Paris', () => {
        expect(validateTimezone('Europe/Paris')).toBe(true);
      });

      it('should return true for Europe/Berlin', () => {
        expect(validateTimezone('Europe/Berlin')).toBe(true);
      });

      it('should return true for Asia/Tokyo', () => {
        expect(validateTimezone('Asia/Tokyo')).toBe(true);
      });

      it('should return true for Asia/Shanghai', () => {
        expect(validateTimezone('Asia/Shanghai')).toBe(true);
      });

      it('should return true for Asia/Hong_Kong', () => {
        expect(validateTimezone('Asia/Hong_Kong')).toBe(true);
      });

      it('should return true for Asia/Singapore', () => {
        expect(validateTimezone('Asia/Singapore')).toBe(true);
      });

      it('should return true for Australia/Sydney', () => {
        expect(validateTimezone('Australia/Sydney')).toBe(true);
      });

      it('should return true for Australia/Melbourne', () => {
        expect(validateTimezone('Australia/Melbourne')).toBe(true);
      });

      it('should return true for Pacific/Auckland', () => {
        expect(validateTimezone('Pacific/Auckland')).toBe(true);
      });

      it('should return true for Africa/Cairo', () => {
        expect(validateTimezone('Africa/Cairo')).toBe(true);
      });

      it('should return true for America/Sao_Paulo', () => {
        expect(validateTimezone('America/Sao_Paulo')).toBe(true);
      });
    });

    describe('Invalid timezones', () => {
      it('should return false for empty string', () => {
        expect(validateTimezone('')).toBe(false);
      });

      it('should return false for null', () => {
        expect(validateTimezone(null)).toBe(false);
      });

      it('should return false for undefined', () => {
        expect(validateTimezone(undefined)).toBe(false);
      });

      it('should return false for whitespace only', () => {
        expect(validateTimezone('   ')).toBe(false);
      });

      it('should return false for INVALID_TIMEZONE', () => {
        expect(validateTimezone('INVALID_TIMEZONE')).toBe(false);
      });

      it('should return false for New York (no region)', () => {
        expect(validateTimezone('New York')).toBe(false);
      });

      it('should return false for EST (abbreviation only)', () => {
        expect(validateTimezone('EST')).toBe(false);
      });

      it('should return false for PST (abbreviation only)', () => {
        expect(validateTimezone('PST')).toBe(false);
      });

      it('should return false for GMT+5', () => {
        expect(validateTimezone('GMT+5')).toBe(false);
      });

      it('should return false for +05:00 (offset only)', () => {
        expect(validateTimezone('+05:00')).toBe(false);
      });

      it('should return false for random string', () => {
        expect(validateTimezone('not_a_timezone')).toBe(false);
      });

      it('should return false for number passed as string', () => {
        expect(validateTimezone('12345')).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('should handle case-sensitive timezone names', () => {
        // IANA timezones are case-sensitive
        expect(validateTimezone('america/new_york')).toBe(false);
        expect(validateTimezone('AMERICA/NEW_YORK')).toBe(false);
      });

      it('should return true for Etc/UTC', () => {
        expect(validateTimezone('Etc/UTC')).toBe(true);
      });

      it('should return true for Etc/GMT', () => {
        expect(validateTimezone('Etc/GMT')).toBe(true);
      });
    });
  });

  describe('validateTimezoneOrThrow()', () => {
    describe('Valid inputs', () => {
      it('should not throw for valid timezone', () => {
        expect(() => validateTimezoneOrThrow('America/New_York')).not.toThrow();
      });

      it('should not throw for UTC', () => {
        expect(() => validateTimezoneOrThrow('UTC')).not.toThrow();
      });

      it('should not throw for null (allows default)', () => {
        expect(() => validateTimezoneOrThrow(null)).not.toThrow();
      });

      it('should not throw for undefined (allows default)', () => {
        expect(() => validateTimezoneOrThrow(undefined)).not.toThrow();
      });
    });

    describe('Invalid inputs', () => {
      it('should throw for invalid timezone string', () => {
        expect(() => validateTimezoneOrThrow('INVALID')).toThrow('Invalid timezone');
      });

      it('should throw for empty string', () => {
        expect(() => validateTimezoneOrThrow('')).toThrow('Invalid timezone');
      });

      it('should include the invalid timezone in error message', () => {
        expect(() => validateTimezoneOrThrow('BAD_TZ')).toThrow('"BAD_TZ"');
      });

      it('should include example timezones in error message', () => {
        expect(() => validateTimezoneOrThrow('INVALID')).toThrow('America/New_York');
      });

      it('should throw for abbreviations', () => {
        expect(() => validateTimezoneOrThrow('EST')).toThrow('Invalid timezone');
      });
    });
  });

  describe('getAllTimezones()', () => {
    it('should return an array', () => {
      const timezones = getAllTimezones();
      expect(Array.isArray(timezones)).toBe(true);
    });

    it('should include UTC', () => {
      const timezones = getAllTimezones();
      expect(timezones).toContain('UTC');
    });

    it('should include major US timezones', () => {
      const timezones = getAllTimezones();
      expect(timezones).toContain('America/New_York');
      expect(timezones).toContain('America/Los_Angeles');
      expect(timezones).toContain('America/Chicago');
      expect(timezones).toContain('America/Denver');
    });

    it('should include major European timezones', () => {
      const timezones = getAllTimezones();
      expect(timezones).toContain('Europe/London');
      expect(timezones).toContain('Europe/Paris');
      expect(timezones).toContain('Europe/Berlin');
    });

    it('should include major Asian timezones', () => {
      const timezones = getAllTimezones();
      expect(timezones).toContain('Asia/Tokyo');
      expect(timezones).toContain('Asia/Shanghai');
      expect(timezones).toContain('Asia/Singapore');
    });

    it('should include Australian timezones', () => {
      const timezones = getAllTimezones();
      expect(timezones).toContain('Australia/Sydney');
      expect(timezones).toContain('Australia/Melbourne');
    });

    it('should return at least 10 timezones', () => {
      const timezones = getAllTimezones();
      expect(timezones.length).toBeGreaterThanOrEqual(10);
    });

    it('should return all valid timezones', () => {
      const timezones = getAllTimezones();
      timezones.forEach(tz => {
        expect(validateTimezone(tz)).toBe(true);
      });
    });
  });

  describe('getTimezoneInfo()', () => {
    describe('Valid timezones', () => {
      it('should return info for UTC', () => {
        const info = getTimezoneInfo('UTC');
        expect(info).not.toBeNull();
        expect(info?.name).toBe('UTC');
        expect(info?.offset).toBe('+00:00');
        expect(info?.isValid).toBe(true);
      });

      it('should return info for America/New_York', () => {
        const info = getTimezoneInfo('America/New_York');
        expect(info).not.toBeNull();
        expect(info?.name).toBe('America/New_York');
        expect(info?.isValid).toBe(true);
        // Offset varies by DST, but should be present
        expect(info?.offset).toBeDefined();
      });

      it('should return info for Europe/London', () => {
        const info = getTimezoneInfo('Europe/London');
        expect(info).not.toBeNull();
        expect(info?.name).toBe('Europe/London');
        expect(info?.isValid).toBe(true);
      });

      it('should return info for Asia/Tokyo', () => {
        const info = getTimezoneInfo('Asia/Tokyo');
        expect(info).not.toBeNull();
        expect(info?.name).toBe('Asia/Tokyo');
        expect(info?.offset).toBe('+09:00');
        expect(info?.isValid).toBe(true);
      });

      it('should return info for Australia/Sydney', () => {
        const info = getTimezoneInfo('Australia/Sydney');
        expect(info).not.toBeNull();
        expect(info?.name).toBe('Australia/Sydney');
        expect(info?.isValid).toBe(true);
        // Offset varies by DST (AEDT +11:00 or AEST +10:00)
        expect(info?.offset).toMatch(/\+1[01]:00/);
      });
    });

    describe('Invalid timezones', () => {
      it('should return null for invalid timezone', () => {
        const info = getTimezoneInfo('INVALID');
        expect(info).toBeNull();
      });

      it('should return null for empty string', () => {
        const info = getTimezoneInfo('');
        expect(info).toBeNull();
      });

      it('should return null for abbreviation', () => {
        const info = getTimezoneInfo('PST');
        expect(info).toBeNull();
      });
    });

    describe('Offset format', () => {
      it('should return offset in ZZ format (+HH:MM)', () => {
        const info = getTimezoneInfo('UTC');
        expect(info?.offset).toMatch(/^[+-]\d{2}:\d{2}$/);
      });

      it('should return positive offset for timezones east of UTC', () => {
        const info = getTimezoneInfo('Asia/Tokyo');
        expect(info?.offset?.startsWith('+')).toBe(true);
      });

      it('should return negative offset for timezones west of UTC', () => {
        const info = getTimezoneInfo('America/Los_Angeles');
        expect(info?.offset?.startsWith('-')).toBe(true);
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should validate all timezones from getAllTimezones()', () => {
      const timezones = getAllTimezones();
      
      timezones.forEach(tz => {
        expect(validateTimezone(tz)).toBe(true);
        expect(() => validateTimezoneOrThrow(tz)).not.toThrow();
        
        const info = getTimezoneInfo(tz);
        expect(info).not.toBeNull();
        expect(info?.isValid).toBe(true);
      });
    });

    it('should handle timezone validation for event creation', () => {
      // Simulate event creation with timezone
      const eventData = {
        name: 'Concert',
        timezone: 'America/New_York',
        starts_at: '2026-03-15T19:00:00',
      };

      expect(validateTimezone(eventData.timezone)).toBe(true);
      
      const tzInfo = getTimezoneInfo(eventData.timezone);
      expect(tzInfo).not.toBeNull();
    });

    it('should reject invalid timezone in event creation', () => {
      const eventData = {
        name: 'Concert',
        timezone: 'Invalid/Timezone',
        starts_at: '2026-03-15T19:00:00',
      };

      expect(validateTimezone(eventData.timezone)).toBe(false);
      expect(() => validateTimezoneOrThrow(eventData.timezone)).toThrow();
    });
  });
});
