/**
 * Unit Tests for Validation Middleware
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { z, ZodError } from 'zod';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Validation Middleware', () => {
  let formatZodError: any;
  let validateBody: any;
  let validateQuery: any;
  let validateParams: any;
  let validate: any;
  let safeValidateBody: any;
  let sanitizeString: any;
  let validateFileUpload: any;
  let setupValidationErrorHandler: any;
  let logger: any;

  let mockRequest: any;
  let mockReply: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const loggerModule = await import('../../../src/utils/logger');
    logger = loggerModule.logger;

    const module = await import('../../../src/middleware/validation.middleware');
    formatZodError = module.formatZodError;
    validateBody = module.validateBody;
    validateQuery = module.validateQuery;
    validateParams = module.validateParams;
    validate = module.validate;
    safeValidateBody = module.safeValidateBody;
    sanitizeString = module.sanitizeString;
    validateFileUpload = module.validateFileUpload;
    setupValidationErrorHandler = module.setupValidationErrorHandler;

    mockRequest = {
      method: 'POST',
      url: '/api/test',
      body: {},
      query: {},
      params: {}
    };

    mockReply = {
      code: jest.fn<(code: number) => any>().mockReturnThis(),
      send: jest.fn<(body: any) => any>().mockReturnThis()
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('formatZodError', () => {
    it('should format ZodError into user-friendly format', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number()
      });

      const result = schema.safeParse({ name: 123, age: 'invalid' });
      const formatted = formatZodError(result.error as ZodError);

      expect(formatted.statusCode).toBe(400);
      expect(formatted.error).toBe('Validation Error');
      expect(formatted.message).toBe('Request validation failed');
      expect(formatted.details).toBeInstanceOf(Array);
      expect(formatted.details.length).toBeGreaterThan(0);
    });

    it('should include field path in error details', () => {
      const schema = z.object({
        user: z.object({
          email: z.string().email()
        })
      });

      const result = schema.safeParse({ user: { email: 'invalid' } });
      const formatted = formatZodError(result.error as ZodError);

      expect(formatted.details[0].field).toBe('user.email');
    });

    it('should include error code in details', () => {
      const schema = z.object({
        count: z.number().min(1)
      });

      const result = schema.safeParse({ count: 0 });
      const formatted = formatZodError(result.error as ZodError);

      expect(formatted.details[0]).toHaveProperty('code');
    });
  });

  describe('validateBody', () => {
    const testSchema = z.object({
      name: z.string().min(1),
      email: z.string().email()
    });

    it('should pass validation with valid body', async () => {
      mockRequest.body = { name: 'John', email: 'john@example.com' };

      const middleware = validateBody(testSchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockRequest.body).toEqual({ name: 'John', email: 'john@example.com' });
    });

    it('should return 400 for invalid body', async () => {
      mockRequest.body = { name: '', email: 'invalid-email' };

      const middleware = validateBody(testSchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          error: 'Validation Error'
        })
      );
    });

    it('should strip unknown fields', async () => {
      const strictSchema = z.object({
        name: z.string()
      }).strict();

      mockRequest.body = { name: 'John', unknown: 'field' };

      const middleware = validateBody(strictSchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should log warning on validation failure', async () => {
      mockRequest.body = { name: '', email: 'bad' };

      const middleware = validateBody(testSchema);
      await middleware(mockRequest, mockReply);

      expect(logger.warn).toHaveBeenCalled();
    });

    it('should throw non-Zod errors', async () => {
      const badSchema = {
        parse: () => { throw new Error('Unexpected error'); }
      };

      const middleware = validateBody(badSchema as any);

      await expect(middleware(mockRequest, mockReply)).rejects.toThrow('Unexpected error');
    });
  });

  describe('validateQuery', () => {
    const querySchema = z.object({
      page: z.string().transform(Number),
      limit: z.string().transform(Number).optional()
    });

    it('should validate query parameters', async () => {
      mockRequest.query = { page: '1', limit: '10' };

      const middleware = validateQuery(querySchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockRequest.query).toEqual({ page: 1, limit: 10 });
    });

    it('should return 400 for invalid query', async () => {
      mockRequest.query = {};  // Missing required field

      const middleware = validateQuery(querySchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should handle missing optional fields', async () => {
      mockRequest.query = { page: '1' };

      const middleware = validateQuery(querySchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockRequest.query.limit).toBeUndefined();
    });
  });

  describe('validateParams', () => {
    const paramsSchema = z.object({
      id: z.string().uuid()
    });

    it('should validate URL parameters', async () => {
      mockRequest.params = { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' };

      const middleware = validateParams(paramsSchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid params', async () => {
      mockRequest.params = { id: 'not-a-uuid' };

      const middleware = validateParams(paramsSchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });
  });

  describe('validate (combined)', () => {
    const schemas = {
      body: z.object({ name: z.string() }),
      query: z.object({ sort: z.string().optional() }),
      params: z.object({ id: z.string() })
    };

    it('should validate all parts of request', async () => {
      mockRequest.body = { name: 'Test' };
      mockRequest.query = { sort: 'asc' };
      mockRequest.params = { id: '123' };

      const middleware = validate(schemas);
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should fail if body is invalid', async () => {
      mockRequest.body = { name: 123 };
      mockRequest.query = { sort: 'asc' };
      mockRequest.params = { id: '123' };

      const middleware = validate(schemas);
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should work with partial schemas', async () => {
      mockRequest.body = { name: 'Test' };

      const middleware = validate({ body: schemas.body });
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should work with no schemas', async () => {
      const middleware = validate({});
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });
  });

  describe('safeValidateBody', () => {
    const schema = z.object({
      value: z.number()
    });

    it('should set validationResult on success', async () => {
      mockRequest.body = { value: 42 };

      const middleware = safeValidateBody(schema);
      await middleware(mockRequest, mockReply);

      expect((mockRequest as any).validationResult).toEqual({
        success: true,
        data: { value: 42 }
      });
    });

    it('should set validationResult on failure', async () => {
      mockRequest.body = { value: 'not-a-number' };

      const middleware = safeValidateBody(schema);
      await middleware(mockRequest, mockReply);

      expect((mockRequest as any).validationResult.success).toBe(false);
      expect((mockRequest as any).validationResult.error).toBeDefined();
    });

    it('should still return 400 on failure', async () => {
      mockRequest.body = { value: 'invalid' };

      const middleware = safeValidateBody(schema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });
  });

  describe('sanitizeString', () => {
    it('should remove script tags', () => {
      const input = 'Hello <script>alert("xss")</script> World';
      const result = sanitizeString(input);

      expect(result).not.toContain('<script>');
      expect(result).not.toContain('</script>');
    });

    it('should remove HTML tags', () => {
      const input = '<div><p>Hello</p></div>';
      const result = sanitizeString(input);

      expect(result).not.toContain('<div>');
      expect(result).not.toContain('<p>');
    });

    it('should preserve allowed characters', () => {
      const input = 'john.doe@example.com';
      const result = sanitizeString(input);

      expect(result).toBe('john.doe@example.com');
    });

    it('should trim whitespace', () => {
      const input = '  hello world  ';
      const result = sanitizeString(input);

      expect(result).toBe('hello world');
    });

    it('should handle empty string', () => {
      const result = sanitizeString('');
      expect(result).toBe('');
    });

    it('should remove special characters', () => {
      const input = 'Hello! @World# $Test%';
      const result = sanitizeString(input);

      expect(result).not.toContain('!');
      expect(result).not.toContain('#');
      expect(result).not.toContain('$');
      expect(result).not.toContain('%');
    });
  });

  describe('validateFileUpload', () => {
    it('should return 400 when required file is missing', async () => {
      mockRequest.file = jest.fn<() => Promise<null>>().mockResolvedValue(null);

      const middleware = validateFileUpload({ required: true });
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'File Required'
        })
      );
    });

    it('should pass when optional file is missing', async () => {
      mockRequest.file = jest.fn<() => Promise<null>>().mockResolvedValue(null);

      const middleware = validateFileUpload({ required: false });
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should reject file exceeding max size', async () => {
      const largeBuffer = Buffer.alloc(1024 * 1024); // 1MB
      mockRequest.file = jest.fn<() => Promise<any>>().mockResolvedValue({
        toBuffer: () => Promise.resolve(largeBuffer),
        mimetype: 'application/pdf'
      });

      const middleware = validateFileUpload({ maxSize: 1024 }); // 1KB limit
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'File Too Large'
        })
      );
    });

    it('should reject invalid mime type', async () => {
      mockRequest.file = jest.fn<() => Promise<any>>().mockResolvedValue({
        toBuffer: () => Promise.resolve(Buffer.from('test')),
        mimetype: 'application/exe'
      });

      const middleware = validateFileUpload({
        allowedMimeTypes: ['application/pdf', 'image/png']
      });
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid File Type'
        })
      );
    });

    it('should accept valid file', async () => {
      mockRequest.file = jest.fn<() => Promise<any>>().mockResolvedValue({
        toBuffer: () => Promise.resolve(Buffer.from('test')),
        mimetype: 'application/pdf'
      });

      const middleware = validateFileUpload({
        maxSize: 1024,
        allowedMimeTypes: ['application/pdf']
      });
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });
  });

  describe('setupValidationErrorHandler', () => {
    it('should set error handler on fastify instance', () => {
      const mockFastify = {
        setErrorHandler: jest.fn<(handler: any) => void>()
      };

      setupValidationErrorHandler(mockFastify);

      expect(mockFastify.setErrorHandler).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should handle ZodError and return 400', () => {
      const mockFastify = {
        setErrorHandler: jest.fn<(handler: any) => void>()
      };

      setupValidationErrorHandler(mockFastify);

      const errorHandler = mockFastify.setErrorHandler.mock.calls[0][0];
      const zodError = new ZodError([{
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['field'],
        message: 'Expected string'
      }]);

      errorHandler(zodError, mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should rethrow non-Zod errors', () => {
      const mockFastify = {
        setErrorHandler: jest.fn<(handler: any) => void>()
      };

      setupValidationErrorHandler(mockFastify);

      const errorHandler = mockFastify.setErrorHandler.mock.calls[0][0];
      const genericError = new Error('Something else');

      expect(() => errorHandler(genericError, mockRequest, mockReply)).toThrow('Something else');
    });
  });
});
