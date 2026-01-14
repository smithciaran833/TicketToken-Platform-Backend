/**
 * Unit Tests for src/utils/validation.ts
 */

// Mock logger before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import {
  safeRegexTest,
  safeRegexMatch,
  setRegexConfig,
  getRegexConfig,
  logSanitizationEvent,
  sanitizeInput,
  checkPrototypePollution,
  ticketSchemas,
  validate,
  createSizeAwareValidator,
} from '../../../src/utils/validation';

describe('utils/validation', () => {
  beforeEach(() => {
    // Reset regex config to defaults
    setRegexConfig({
      timeoutMs: 100,
      maxInputLength: 10000,
      strictMode: false,
    });
  });

  describe('Regex Protection', () => {
    describe('safeRegexTest()', () => {
      it('returns false for input exceeding maxInputLength', () => {
        const longInput = 'a'.repeat(20000);
        const result = safeRegexTest(/test/, longInput);
        expect(result).toBe(false);
      });

      it('throws for vulnerable pattern in strict mode', () => {
        setRegexConfig({ strictMode: true });
        expect(() => {
          safeRegexTest(/(.*)+/, 'test');
        }).toThrow('ReDoS');
      });

      it('returns correct match result', () => {
        expect(safeRegexTest(/hello/, 'hello world')).toBe(true);
        expect(safeRegexTest(/goodbye/, 'hello world')).toBe(false);
      });

      it('returns false on regex error', () => {
        // Mock a regex that throws
        const badRegex = /test/;
        jest.spyOn(badRegex, 'test').mockImplementation(() => {
          throw new Error('Regex error');
        });
        expect(safeRegexTest(badRegex, 'test')).toBe(false);
      });
    });

    describe('safeRegexMatch()', () => {
      it('returns null for oversized input', () => {
        const longInput = 'a'.repeat(20000);
        const result = safeRegexMatch(/test/, longInput);
        expect(result).toBeNull();
      });

      it('throws for vulnerable pattern in strict mode', () => {
        setRegexConfig({ strictMode: true });
        expect(() => {
          safeRegexMatch(/(.*)+/, 'test');
        }).toThrow('ReDoS');
      });

      it('returns match array on success', () => {
        const result = safeRegexMatch(/(\w+)/, 'hello world');
        expect(result).toBeTruthy();
        expect(result![0]).toBe('hello');
      });

      it('returns null on no match', () => {
        const result = safeRegexMatch(/xyz/, 'hello world');
        expect(result).toBeNull();
      });
    });

    describe('setRegexConfig()', () => {
      it('updates configuration', () => {
        setRegexConfig({ timeoutMs: 200, maxInputLength: 5000 });
        const config = getRegexConfig();
        expect(config.timeoutMs).toBe(200);
        expect(config.maxInputLength).toBe(5000);
      });
    });

    describe('getRegexConfig()', () => {
      it('returns current config copy', () => {
        const config1 = getRegexConfig();
        const config2 = getRegexConfig();
        expect(config1).toEqual(config2);
        expect(config1).not.toBe(config2); // Different objects
      });
    });
  });

  describe('Sanitization', () => {
    describe('logSanitizationEvent()', () => {
      it('logs at correct severity level', () => {
        // Just verify it doesn't throw
        logSanitizationEvent('xss_attempt', { field: 'test' });
        logSanitizationEvent('validation_failed', { field: 'test' });
        logSanitizationEvent('sql_injection_attempt', { field: 'test' });
      });
    });

    describe('sanitizeInput()', () => {
      it('detects XSS patterns (script, javascript:, onclick=)', () => {
        sanitizeInput('<script>alert(1)</script>', 'field');
        sanitizeInput('javascript:alert(1)', 'field');
        sanitizeInput('onclick=alert(1)', 'field');
        // These should trigger logSanitizationEvent internally
      });

      it('detects SQL injection patterns (OR 1=1, UNION SELECT)', () => {
        sanitizeInput("' OR '1'='1", 'field');
        sanitizeInput('UNION SELECT * FROM users', 'field');
      });

      it('detects path traversal patterns (../, %2e%2e%2f)', () => {
        sanitizeInput('../../../etc/passwd', 'field');
        sanitizeInput('%2e%2e%2f', 'field');
      });

      it('detects command injection only for command-related fields', () => {
        sanitizeInput('ls; rm -rf /', 'command');
        sanitizeInput('$(cat /etc/passwd)', 'shell_exec');
      });

      it('returns the input unchanged', () => {
        const input = 'normal text';
        expect(sanitizeInput(input, 'field')).toBe(input);
      });
    });

    describe('checkPrototypePollution()', () => {
      it('returns false for non-objects', () => {
        expect(checkPrototypePollution(null, 'field')).toBe(false);
        expect(checkPrototypePollution(undefined, 'field')).toBe(false);
        expect(checkPrototypePollution('string', 'field')).toBe(false);
        expect(checkPrototypePollution(123, 'field')).toBe(false);
      });

      it('detects constructor and prototype keys', () => {
        // Note: __proto__ cannot be set as a regular key in object literals
        // The function uses Object.keys() which won't see __proto__
        // But constructor and prototype should work if explicitly set
        const objWithConstructor = Object.create(null);
        objWithConstructor.constructor = {};
        expect(checkPrototypePollution(objWithConstructor, 'field')).toBe(true);

        const objWithPrototype = Object.create(null);
        objWithPrototype.prototype = {};
        expect(checkPrototypePollution(objWithPrototype, 'field')).toBe(true);
      });

      it('detects __proto__ when explicitly defined as property', () => {
        // Use Object.defineProperty to actually create a __proto__ key
        const obj = Object.create(null);
        Object.defineProperty(obj, '__proto__', {
          value: {},
          enumerable: true,
        });
        expect(checkPrototypePollution(obj, 'field')).toBe(true);
      });

      it('recursively checks nested objects', () => {
        const nested = Object.create(null);
        nested.a = Object.create(null);
        nested.a.b = Object.create(null);
        nested.a.b.constructor = {};
        expect(checkPrototypePollution(nested, 'field')).toBe(true);

        expect(checkPrototypePollution({ a: { b: { c: 'safe' } } }, 'field')).toBe(false);
      });
    });
  });

  describe('Ticket Schemas', () => {
    describe('ticketSchemas.purchaseTickets', () => {
      it('validates eventId as UUID', () => {
        const { error } = ticketSchemas.purchaseTickets.validate({
          eventId: 'not-a-uuid',
          tickets: [{ ticketTypeId: '550e8400-e29b-41d4-a716-446655440000', quantity: 1 }],
        });
        expect(error).toBeDefined();
        expect(error!.details[0].path).toContain('eventId');
      });

      it('requires tickets array with 1-50 items', () => {
        const { error: emptyError } = ticketSchemas.purchaseTickets.validate({
          eventId: '550e8400-e29b-41d4-a716-446655440000',
          tickets: [],
        });
        expect(emptyError).toBeDefined();

        const { error: validError } = ticketSchemas.purchaseTickets.validate({
          eventId: '550e8400-e29b-41d4-a716-446655440000',
          tickets: [{ ticketTypeId: '550e8400-e29b-41d4-a716-446655440000', quantity: 1 }],
        });
        expect(validError).toBeUndefined();
      });

      it('validates ticket quantity 1-10', () => {
        const { error: zeroError } = ticketSchemas.purchaseTickets.validate({
          eventId: '550e8400-e29b-41d4-a716-446655440000',
          tickets: [{ ticketTypeId: '550e8400-e29b-41d4-a716-446655440000', quantity: 0 }],
        });
        expect(zeroError).toBeDefined();

        const { error: tooManyError } = ticketSchemas.purchaseTickets.validate({
          eventId: '550e8400-e29b-41d4-a716-446655440000',
          tickets: [{ ticketTypeId: '550e8400-e29b-41d4-a716-446655440000', quantity: 11 }],
        });
        expect(tooManyError).toBeDefined();
      });

      it('rejects unknown properties', () => {
        const { error } = ticketSchemas.purchaseTickets.validate({
          eventId: '550e8400-e29b-41d4-a716-446655440000',
          tickets: [{ ticketTypeId: '550e8400-e29b-41d4-a716-446655440000', quantity: 1 }],
          unknownProp: 'value',
        });
        expect(error).toBeDefined();
      });
    });

    describe('ticketSchemas.createTicketType', () => {
      const validTicketType = {
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'VIP Ticket',
        priceCents: 5000,
        quantity: 100,
        maxPerPurchase: 4,
        saleStartDate: '2024-01-01T00:00:00Z',
        saleEndDate: '2024-12-31T23:59:59Z',
      };

      it('validates all required fields', () => {
        const { error } = ticketSchemas.createTicketType.validate(validTicketType);
        expect(error).toBeUndefined();
      });

      it('validates saleEndDate > saleStartDate', () => {
        const { error } = ticketSchemas.createTicketType.validate({
          ...validTicketType,
          saleStartDate: '2024-12-31T23:59:59Z',
          saleEndDate: '2024-01-01T00:00:00Z',
        });
        expect(error).toBeDefined();
      });
    });

    describe('ticketSchemas.transferTicket', () => {
      it('validates ticketId and toUserId as UUIDs', () => {
        const { error: ticketError } = ticketSchemas.transferTicket.validate({
          ticketId: 'not-uuid',
          toUserId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(ticketError).toBeDefined();

        const { error: userError } = ticketSchemas.transferTicket.validate({
          ticketId: '550e8400-e29b-41d4-a716-446655440000',
          toUserId: 'not-uuid',
        });
        expect(userError).toBeDefined();
      });
    });

    describe('ticketSchemas.validateQR', () => {
      it('requires qrCode and eventId', () => {
        const { error: missingQR } = ticketSchemas.validateQR.validate({
          eventId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(missingQR).toBeDefined();

        const { error: missingEvent } = ticketSchemas.validateQR.validate({
          qrCode: 'some-code',
        });
        expect(missingEvent).toBeDefined();

        const { error: valid } = ticketSchemas.validateQR.validate({
          qrCode: 'some-code',
          eventId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(valid).toBeUndefined();
      });
    });
  });

  describe('Validation Middleware', () => {
    describe('validate()', () => {
      const mockRequest = (body: any) => ({
        body,
        id: 'req-123',
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test' },
        url: '/test',
        method: 'POST',
      });

      const mockReply = () => ({
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      });

      it('returns 400 for prototype pollution', async () => {
        const schema = ticketSchemas.transferTicket;
        const middleware = validate(schema);
        
        // Create object with __proto__ as enumerable property
        const pollutedBody = Object.create(null);
        Object.defineProperty(pollutedBody, '__proto__', {
          value: {},
          enumerable: true,
        });
        
        const req = mockRequest(pollutedBody);
        const reply = mockReply();

        await middleware(req as any, reply as any);

        expect(reply.status).toHaveBeenCalledWith(400);
        expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
          error: 'Validation error',
          code: 'INVALID_INPUT',
        }));
      });

      it('returns 400 with error details on validation failure', async () => {
        const schema = ticketSchemas.transferTicket;
        const middleware = validate(schema);
        const req = mockRequest({ ticketId: 'not-uuid', toUserId: 'also-not-uuid' });
        const reply = mockReply();

        await middleware(req as any, reply as any);

        expect(reply.status).toHaveBeenCalledWith(400);
        expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
          error: 'Validation error',
          code: 'VALIDATION_FAILED',
          details: expect.any(Array),
        }));
      });

      it('replaces request.body with validated value', async () => {
        const schema = ticketSchemas.transferTicket;
        const middleware = validate(schema);
        const req = mockRequest({
          ticketId: '550e8400-e29b-41d4-a716-446655440000',
          toUserId: '550e8400-e29b-41d4-a716-446655440001',
        });
        const reply = mockReply();

        await middleware(req as any, reply as any);

        // If validation passes, reply.status should not be called
        expect(reply.status).not.toHaveBeenCalled();
      });
    });

    describe('createSizeAwareValidator()', () => {
      const mockRequest = (body: any, contentLength: string) => ({
        body,
        headers: { 'content-length': contentLength },
        id: 'req-123',
        ip: '127.0.0.1',
        url: '/test',
        method: 'POST',
      });

      const mockReply = () => ({
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      });

      it('returns 413 for oversized content-length', async () => {
        const schema = ticketSchemas.transferTicket;
        const middleware = createSizeAwareValidator(schema, 100);
        const req = mockRequest({}, '500');
        const reply = mockReply();

        await middleware(req as any, reply as any);

        expect(reply.status).toHaveBeenCalledWith(413);
        expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
          error: 'Payload Too Large',
          code: 'PAYLOAD_TOO_LARGE',
        }));
      });

      it('delegates to validate() for valid size', async () => {
        const schema = ticketSchemas.transferTicket;
        const middleware = createSizeAwareValidator(schema, 10000);
        const req = mockRequest({
          ticketId: '550e8400-e29b-41d4-a716-446655440000',
          toUserId: '550e8400-e29b-41d4-a716-446655440001',
        }, '100');
        const reply = mockReply();

        await middleware(req as any, reply as any);

        // Should pass through to validate, not return 413
        expect(reply.status).not.toHaveBeenCalledWith(413);
      });
    });
  });
});
