import { validateTimezone, validateTimezoneOrThrow, getTimezoneInfo } from '../../src/utils/timezone-validator';

describe('Timezone Validator', () => {
  describe('validateTimezone', () => {
    it('should accept valid IANA timezone names', () => {
      expect(validateTimezone('America/New_York')).toBe(true);
      expect(validateTimezone('Europe/London')).toBe(true);
      expect(validateTimezone('Asia/Tokyo')).toBe(true);
      expect(validateTimezone('UTC')).toBe(true);
      expect(validateTimezone('America/Los_Angeles')).toBe(true);
      expect(validateTimezone('Australia/Sydney')).toBe(true);
    });

    it('should reject invalid timezone names', () => {
      expect(validateTimezone('INVALID_TIMEZONE')).toBe(false);
      expect(validateTimezone('Not/A/Timezone')).toBe(false);
      expect(validateTimezone('EST')).toBe(false);
      expect(validateTimezone('CST')).toBe(false);
      expect(validateTimezone('Random String')).toBe(false);
    });

    it('should reject empty or null values', () => {
      expect(validateTimezone('')).toBe(false);
      expect(validateTimezone(null)).toBe(false);
      expect(validateTimezone(undefined)).toBe(false);
      expect(validateTimezone('   ')).toBe(false);
    });

    it('should reject non-string values', () => {
      expect(validateTimezone(123 as any)).toBe(false);
      expect(validateTimezone({} as any)).toBe(false);
      expect(validateTimezone([] as any)).toBe(false);
    });
  });

  describe('validateTimezoneOrThrow', () => {
    it('should not throw for valid timezones', () => {
      expect(() => validateTimezoneOrThrow('America/New_York')).not.toThrow();
      expect(() => validateTimezoneOrThrow('Europe/London')).not.toThrow();
      expect(() => validateTimezoneOrThrow('UTC')).not.toThrow();
    });

    it('should not throw for undefined/null (allows default)', () => {
      expect(() => validateTimezoneOrThrow(undefined)).not.toThrow();
      expect(() => validateTimezoneOrThrow(null)).not.toThrow();
    });

    it('should throw for invalid timezones with clear error message', () => {
      expect(() => validateTimezoneOrThrow('INVALID_TIMEZONE')).toThrow(/Invalid timezone/);
      expect(() => validateTimezoneOrThrow('INVALID_TIMEZONE')).toThrow(/INVALID_TIMEZONE/);
      expect(() => validateTimezoneOrThrow('INVALID_TIMEZONE')).toThrow(/IANA timezone/);
      expect(() => validateTimezoneOrThrow('BAD_ZONE')).toThrow(/BAD_ZONE/);
    });

    it('should include helpful examples in error message', () => {
      try {
        validateTimezoneOrThrow('INVALID');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message).toContain('America/New_York');
        expect(message).toContain('Europe/London');
        expect(message).toContain('UTC');
      }
    });
  });

  describe('getTimezoneInfo', () => {
    it('should return timezone info for valid timezones', () => {
      const nyInfo = getTimezoneInfo('America/New_York');
      expect(nyInfo).not.toBeNull();
      expect(nyInfo?.name).toBe('America/New_York');
      expect(nyInfo?.isValid).toBe(true);
      expect(nyInfo?.offset).toMatch(/^[+-]\d{2}:\d{2}$/);

      const utcInfo = getTimezoneInfo('UTC');
      expect(utcInfo).not.toBeNull();
      expect(utcInfo?.name).toBe('UTC');
      expect(utcInfo?.isValid).toBe(true);
      expect(utcInfo?.offset).toBe('+00:00');
    });

    it('should return null for invalid timezones', () => {
      expect(getTimezoneInfo('INVALID')).toBeNull();
      expect(getTimezoneInfo('Not/Real')).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should handle timezone aliases correctly', () => {
      // Some timezones have aliases, ensure they work
      expect(validateTimezone('UTC')).toBe(true);
      expect(validateTimezone('GMT')).toBe(true);
    });

    it('should be case-sensitive for timezone names', () => {
      expect(validateTimezone('America/New_York')).toBe(true);
      expect(validateTimezone('america/new_york')).toBe(false); // Wrong case
      expect(validateTimezone('AMERICA/NEW_YORK')).toBe(false); // Wrong case
    });

    it('should reject partial timezone identifiers', () => {
      expect(validateTimezone('America')).toBe(false);
      expect(validateTimezone('New_York')).toBe(false);
    });
  });
});
