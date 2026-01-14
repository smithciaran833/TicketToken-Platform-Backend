import Joi from 'joi';
import { validate } from '../../../src/middleware/validation.middleware';

// Mock Fastify request and reply
const createMockRequest = (overrides: any = {}) => ({
  body: {},
  query: {},
  params: {},
  ...overrides,
});

const createMockReply = () => ({
  status: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis(),
});

describe('validation.middleware', () => {
  describe('validate function', () => {
    const testSchema = Joi.object({
      email: Joi.string().email().required(),
      name: Joi.string().max(50).optional(),
    });

    describe('body validation (default)', () => {
      it('passes valid body', async () => {
        const req = createMockRequest({ body: { email: 'test@example.com' } });
        const reply = createMockReply();

        await validate(testSchema)(req as any, reply as any);

        expect(req.body).toEqual({ email: 'test@example.com' });
      });

      it('replaces body with validated data', async () => {
        const req = createMockRequest({ body: { email: 'test@example.com', name: 'John' } });
        const reply = createMockReply();

        await validate(testSchema)(req as any, reply as any);

        expect(req.body).toEqual({ email: 'test@example.com', name: 'John' });
      });

      it('strips unknown fields', async () => {
        const req = createMockRequest({ body: { email: 'test@example.com', unknown: 'field' } });
        const reply = createMockReply();

        await validate(testSchema)(req as any, reply as any);

        expect(req.body).toEqual({ email: 'test@example.com' });
        expect((req.body as any).unknown).toBeUndefined();
      });

      it('throws 400 with errors array on invalid body', async () => {
        const req = createMockRequest({ body: { email: 'invalid' } });
        const reply = createMockReply();

        await expect(validate(testSchema)(req as any, reply as any)).rejects.toMatchObject({
          statusCode: 400,
          errors: expect.arrayContaining([
            expect.objectContaining({
              field: 'email',
              message: expect.stringContaining('email'),
            }),
          ]),
        });
      });

      it('includes field paths in errors', async () => {
        const nestedSchema = Joi.object({
          user: Joi.object({
            email: Joi.string().email().required(),
          }),
        });

        const req = createMockRequest({ body: { user: { email: 'invalid' } } });
        const reply = createMockReply();

        await expect(validate(nestedSchema)(req as any, reply as any)).rejects.toMatchObject({
          errors: expect.arrayContaining([
            expect.objectContaining({
              field: 'user.email',
            }),
          ]),
        });
      });

      it('collects multiple errors (abortEarly: false)', async () => {
        const multiFieldSchema = Joi.object({
          email: Joi.string().email().required(),
          password: Joi.string().min(8).required(),
        });

        const req = createMockRequest({ body: {} });
        const reply = createMockReply();

        try {
          await validate(multiFieldSchema)(req as any, reply as any);
          fail('Should have thrown');
        } catch (error: any) {
          expect(error.errors.length).toBeGreaterThanOrEqual(2);
        }
      });
    });

    describe('query validation', () => {
      const querySchema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
      });

      it('validates query params', async () => {
        const req = createMockRequest({ query: { page: '2', limit: '50' } });
        const reply = createMockReply();

        await validate(querySchema, 'query')(req as any, reply as any);

        expect(req.query).toEqual({ page: 2, limit: 50 });
      });

      it('applies defaults to query', async () => {
        const req = createMockRequest({ query: {} });
        const reply = createMockReply();

        await validate(querySchema, 'query')(req as any, reply as any);

        expect(req.query).toEqual({ page: 1, limit: 20 });
      });

      it('throws on invalid query', async () => {
        const req = createMockRequest({ query: { page: '-1' } });
        const reply = createMockReply();

        await expect(validate(querySchema, 'query')(req as any, reply as any)).rejects.toMatchObject({
          statusCode: 400,
        });
      });
    });

    describe('params validation', () => {
      const paramsSchema = Joi.object({
        id: Joi.string().uuid().required(),
      });

      it('validates route params', async () => {
        const validUUID = '123e4567-e89b-12d3-a456-426614174000';
        const req = createMockRequest({ params: { id: validUUID } });
        const reply = createMockReply();

        await validate(paramsSchema, 'params')(req as any, reply as any);

        expect(req.params).toEqual({ id: validUUID });
      });

      it('throws on invalid params', async () => {
        const req = createMockRequest({ params: { id: 'not-a-uuid' } });
        const reply = createMockReply();

        await expect(validate(paramsSchema, 'params')(req as any, reply as any)).rejects.toMatchObject({
          statusCode: 400,
        });
      });
    });

    describe('error handling', () => {
      it('re-throws non-Joi errors', async () => {
        const badSchema = {
          validateAsync: jest.fn().mockRejectedValue(new Error('Unexpected error')),
        };

        const req = createMockRequest({ body: {} });
        const reply = createMockReply();

        await expect(validate(badSchema as any)(req as any, reply as any)).rejects.toThrow('Unexpected error');
      });
    });
  });
});
