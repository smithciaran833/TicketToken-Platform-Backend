import { validate } from '../../src/middleware/validation.middleware';
import Joi from 'joi';

/**
 * INTEGRATION TESTS FOR VALIDATION MIDDLEWARE
 * 
 * These tests use REAL Joi validation:
 * - Real Joi schemas
 * - Real validation errors
 * - Tests actual data transformation
 * - No mocks
 */

describe('Validation Middleware Integration Tests', () => {
  const userSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    age: Joi.number().optional()
  });

  const querySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  });

  const paramsSchema = Joi.object({
    id: Joi.string().uuid().required()
  });

  describe('validate() - body source', () => {
    it('should validate request.body by default', async () => {
      const request: any = {
        body: {
          email: 'test@example.com',
          password: 'password123'
        }
      };
      const reply: any = {};

      const middleware = validate(userSchema);
      await middleware(request, reply);

      expect(request.body).toEqual({
        email: 'test@example.com',
        password: 'password123'
      });
    });

    it('should validate and replace request.body with validated data', async () => {
      const request: any = {
        body: {
          email: 'test@example.com',
          password: 'password123',
          extraField: 'should be stripped'
        }
      };
      const reply: any = {};

      const middleware = validate(userSchema);
      await middleware(request, reply);

      expect(request.body).toEqual({
        email: 'test@example.com',
        password: 'password123'
      });
      expect(request.body).not.toHaveProperty('extraField');
    });

    it('should strip unknown fields (stripUnknown: true)', async () => {
      const request: any = {
        body: {
          email: 'test@example.com',
          password: 'password123',
          hack: 'attempt',
          admin: true
        }
      };
      const reply: any = {};

      const middleware = validate(userSchema);
      await middleware(request, reply);

      expect(request.body).toEqual({
        email: 'test@example.com',
        password: 'password123'
      });
    });

    it('should throw error with statusCode 400 for Joi validation error', async () => {
      const request: any = {
        body: {
          email: 'invalid-email',
          password: 'short'
        }
      };
      const reply: any = {};

      const middleware = validate(userSchema);

      try {
        await middleware(request, reply);
        fail('Should have thrown validation error');
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
        expect(error.errors).toBeDefined();
        expect(Array.isArray(error.errors)).toBe(true);
      }
    });

    it('should collect all errors (abortEarly: false)', async () => {
      const request: any = {
        body: {
          email: 'invalid-email',
          password: 'short'
        }
      };
      const reply: any = {};

      const middleware = validate(userSchema);

      try {
        await middleware(request, reply);
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.errors.length).toBeGreaterThanOrEqual(2);
        expect(error.errors.some((e: any) => e.field === 'email')).toBe(true);
        expect(error.errors.some((e: any) => e.field === 'password')).toBe(true);
      }
    });

    it('should include field names and messages in errors array', async () => {
      const request: any = {
        body: {
          email: '',
          password: 'abc'
        }
      };
      const reply: any = {};

      const middleware = validate(userSchema);

      try {
        await middleware(request, reply);
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.errors[0]).toHaveProperty('field');
        expect(error.errors[0]).toHaveProperty('message');
        expect(typeof error.errors[0].field).toBe('string');
        expect(typeof error.errors[0].message).toBe('string');
      }
    });
  });

  describe('validate() - query source', () => {
    it('should validate request.query when source="query"', async () => {
      const request: any = {
        query: {
          page: '2',
          limit: '50'
        }
      };
      const reply: any = {};

      const middleware = validate(querySchema, 'query');
      await middleware(request, reply);

      expect(request.query.page).toBe(2);
      expect(request.query.limit).toBe(50);
    });

    it('should replace request.query with validated data', async () => {
      const request: any = {
        query: {
          page: '3',
          limit: '25',
          extra: 'remove'
        }
      };
      const reply: any = {};

      const middleware = validate(querySchema, 'query');
      await middleware(request, reply);

      expect(request.query).toEqual({
        page: 3,
        limit: 25
      });
    });

    it('should apply default values from schema', async () => {
      const request: any = {
        query: {}
      };
      const reply: any = {};

      const middleware = validate(querySchema, 'query');
      await middleware(request, reply);

      expect(request.query.page).toBe(1);
      expect(request.query.limit).toBe(20);
    });
  });

  describe('validate() - params source', () => {
    it('should validate request.params when source="params"', async () => {
      const request: any = {
        params: {
          id: '550e8400-e29b-41d4-a716-446655440000'
        }
      };
      const reply: any = {};

      const middleware = validate(paramsSchema, 'params');
      await middleware(request, reply);

      expect(request.params.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should replace request.params with validated data', async () => {
      const request: any = {
        params: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          extra: 'field'
        }
      };
      const reply: any = {};

      const middleware = validate(paramsSchema, 'params');
      await middleware(request, reply);

      expect(request.params).toEqual({
        id: '550e8400-e29b-41d4-a716-446655440000'
      });
    });

    it('should throw validation error for invalid UUID', async () => {
      const request: any = {
        params: {
          id: 'not-a-uuid'
        }
      };
      const reply: any = {};

      const middleware = validate(paramsSchema, 'params');

      await expect(middleware(request, reply)).rejects.toThrow();
    });
  });

  describe('Error handling', () => {
    it('should propagate non-Joi errors unchanged', async () => {
      const throwingSchema = Joi.object().external(async () => {
        throw new Error('Database connection failed');
      });

      const request: any = {
        body: {}
      };
      const reply: any = {};

      const middleware = validate(throwingSchema);

      try {
        await middleware(request, reply);
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toBe('Database connection failed');
        expect(error.statusCode).toBeUndefined();
        expect(error.errors).toBeUndefined();
      }
    });

    it('should format Joi.ValidationError with proper structure', async () => {
      const request: any = {
        body: {
          email: 'bad',
          password: '123'
        }
      };
      const reply: any = {};

      const middleware = validate(userSchema);

      try {
        await middleware(request, reply);
        fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(Error);
        expect(error.statusCode).toBe(400);
        expect(Array.isArray(error.errors)).toBe(true);
        expect(error.message).toBeDefined();
      }
    });
  });

  describe('Data transformation', () => {
    it('should convert string numbers to integers', async () => {
      const request: any = {
        query: {
          page: '5',
          limit: '30'
        }
      };
      const reply: any = {};

      const middleware = validate(querySchema, 'query');
      await middleware(request, reply);

      expect(typeof request.query.page).toBe('number');
      expect(typeof request.query.limit).toBe('number');
      expect(request.query.page).toBe(5);
      expect(request.query.limit).toBe(30);
    });

    it('should handle optional fields correctly', async () => {
      const request: any = {
        body: {
          email: 'test@example.com',
          password: 'password123',
          age: 25
        }
      };
      const reply: any = {};

      const middleware = validate(userSchema);
      await middleware(request, reply);

      expect(request.body.age).toBe(25);
    });

    it('should allow omitting optional fields', async () => {
      const request: any = {
        body: {
          email: 'test@example.com',
          password: 'password123'
        }
      };
      const reply: any = {};

      const middleware = validate(userSchema);
      await middleware(request, reply);

      expect(request.body).not.toHaveProperty('age');
    });
  });

  describe('Complex validation scenarios', () => {
    it('should validate nested objects', async () => {
      const nestedSchema = Joi.object({
        user: Joi.object({
          name: Joi.string().required(),
          email: Joi.string().email().required()
        }).required()
      });

      const request: any = {
        body: {
          user: {
            name: 'John Doe',
            email: 'john@example.com'
          }
        }
      };
      const reply: any = {};

      const middleware = validate(nestedSchema);
      await middleware(request, reply);

      expect(request.body.user.name).toBe('John Doe');
      expect(request.body.user.email).toBe('john@example.com');
    });

    it('should validate arrays', async () => {
      const arraySchema = Joi.object({
        tags: Joi.array().items(Joi.string()).required()
      });

      const request: any = {
        body: {
          tags: ['tag1', 'tag2', 'tag3']
        }
      };
      const reply: any = {};

      const middleware = validate(arraySchema);
      await middleware(request, reply);

      expect(Array.isArray(request.body.tags)).toBe(true);
      expect(request.body.tags).toHaveLength(3);
    });

    it('should handle conditional validation', async () => {
      const conditionalSchema = Joi.object({
        type: Joi.string().valid('email', 'sms').required(),
        email: Joi.string().email().when('type', {
          is: 'email',
          then: Joi.required()
        }),
        phone: Joi.string().when('type', {
          is: 'sms',
          then: Joi.required()
        })
      });

      const request: any = {
        body: {
          type: 'email',
          email: 'test@example.com'
        }
      };
      const reply: any = {};

      const middleware = validate(conditionalSchema);
      await middleware(request, reply);

      expect(request.body.type).toBe('email');
      expect(request.body.email).toBe('test@example.com');
    });
  });
});
