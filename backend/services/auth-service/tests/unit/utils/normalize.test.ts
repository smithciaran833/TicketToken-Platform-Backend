import {
  normalizeEmail,
  normalizeUsername,
  normalizeText,
  normalizePhone,
  normalizedEquals,
} from '../../../src/utils/normalize';

describe('normalize utils', () => {
  describe('normalizeEmail', () => {
    it('lowercases email', () => {
      expect(normalizeEmail('John@Example.COM')).toBe('john@example.com');
      expect(normalizeEmail('TEST@TEST.COM')).toBe('test@test.com');
    });

    it('trims whitespace', () => {
      expect(normalizeEmail('  test@test.com  ')).toBe('test@test.com');
      expect(normalizeEmail('\ttest@test.com\n')).toBe('test@test.com');
    });

    it('applies Unicode NFC normalization', () => {
      // café can be represented as single char (é) or e + combining accent
      const composed = 'caf\u00e9@test.com'; // é as single char
      const decomposed = 'cafe\u0301@test.com'; // e + combining acute accent
      expect(normalizeEmail(composed)).toBe(normalizeEmail(decomposed));
    });

    it('returns empty string for empty input', () => {
      expect(normalizeEmail('')).toBe('');
    });

    it('returns empty string for null', () => {
      expect(normalizeEmail(null as any)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(normalizeEmail(undefined as any)).toBe('');
    });
  });

  describe('normalizeUsername', () => {
    it('lowercases by default', () => {
      expect(normalizeUsername('JohnDoe')).toBe('johndoe');
      expect(normalizeUsername('UPPERCASE')).toBe('uppercase');
    });

    it('preserves case when lowercase=false', () => {
      expect(normalizeUsername('JohnDoe', false)).toBe('JohnDoe');
      expect(normalizeUsername('MixedCase', false)).toBe('MixedCase');
    });

    it('trims whitespace', () => {
      expect(normalizeUsername('  spaced  ')).toBe('spaced');
      expect(normalizeUsername('\tusername\n')).toBe('username');
    });

    it('applies Unicode NFC normalization', () => {
      const composed = 'caf\u00e9'; // é as single char
      const decomposed = 'cafe\u0301'; // e + combining acute accent
      expect(normalizeUsername(composed)).toBe(normalizeUsername(decomposed));
    });

    it('returns empty string for empty input', () => {
      expect(normalizeUsername('')).toBe('');
    });

    it('returns empty string for null', () => {
      expect(normalizeUsername(null as any)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(normalizeUsername(undefined as any)).toBe('');
    });
  });

  describe('normalizeText', () => {
    it('preserves case', () => {
      expect(normalizeText('Hello World')).toBe('Hello World');
      expect(normalizeText('MixedCASE')).toBe('MixedCASE');
    });

    it('trims whitespace', () => {
      expect(normalizeText('  spaced  ')).toBe('spaced');
      expect(normalizeText('\ttext\n')).toBe('text');
    });

    it('applies Unicode NFC normalization', () => {
      const composed = 'caf\u00e9'; // é as single char
      const decomposed = 'cafe\u0301'; // e + combining acute accent
      expect(normalizeText(composed)).toBe(normalizeText(decomposed));
    });

    it('returns empty string for empty input', () => {
      expect(normalizeText('')).toBe('');
    });

    it('returns empty string for null', () => {
      expect(normalizeText(null as any)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(normalizeText(undefined as any)).toBe('');
    });
  });

  describe('normalizePhone', () => {
    it('returns valid E.164 number unchanged', () => {
      expect(normalizePhone('+14155551234')).toBe('+14155551234');
      expect(normalizePhone('+442071234567')).toBe('+442071234567');
    });

    it('adds leading + if missing', () => {
      expect(normalizePhone('14155551234')).toBe('+14155551234');
    });

    it('strips parentheses and spaces', () => {
      expect(normalizePhone('+1 (415) 555 1234')).toBe('+14155551234');
    });

    it('strips dashes', () => {
      expect(normalizePhone('+1-415-555-1234')).toBe('+14155551234');
    });

    it('handles mixed formatting', () => {
      expect(normalizePhone('+1 (415) 555-1234')).toBe('+14155551234');
      expect(normalizePhone('1.415.555.1234')).toBe('+14155551234');
    });

    it('returns null for empty input', () => {
      expect(normalizePhone('')).toBe(null);
    });

    it('returns null for null input', () => {
      expect(normalizePhone(null as any)).toBe(null);
    });

    it('returns null for undefined input', () => {
      expect(normalizePhone(undefined as any)).toBe(null);
    });

    it('returns null for too short number', () => {
      expect(normalizePhone('123')).toBe(null);
      expect(normalizePhone('+123456')).toBe(null); // 6 digits, need 8+
    });

    it('returns null for too long number', () => {
      expect(normalizePhone('+1234567890123456')).toBe(null); // 16 digits, max 15
    });

    it('returns null for number starting with 0 after country code', () => {
      expect(normalizePhone('+0123456789')).toBe(null);
    });
  });

  describe('normalizedEquals', () => {
    it('returns true for identical strings', () => {
      expect(normalizedEquals('hello', 'hello')).toBe(true);
      expect(normalizedEquals('test', 'test')).toBe(true);
    });

    it('returns true ignoring leading/trailing whitespace', () => {
      expect(normalizedEquals('  hello  ', 'hello')).toBe(true);
      expect(normalizedEquals('hello', '  hello  ')).toBe(true);
      expect(normalizedEquals('  hello  ', '  hello  ')).toBe(true);
    });

    it('returns false for different case (case-sensitive)', () => {
      expect(normalizedEquals('Hello', 'hello')).toBe(false);
      expect(normalizedEquals('TEST', 'test')).toBe(false);
    });

    it('returns true for Unicode normalized equivalents', () => {
      const composed = 'caf\u00e9'; // é as single char
      const decomposed = 'cafe\u0301'; // e + combining acute accent
      expect(normalizedEquals(composed, decomposed)).toBe(true);
    });

    it('returns true for both empty', () => {
      expect(normalizedEquals('', '')).toBe(true);
    });

    it('returns false for different strings', () => {
      expect(normalizedEquals('hello', 'world')).toBe(false);
      expect(normalizedEquals('abc', 'xyz')).toBe(false);
    });
  });
});
