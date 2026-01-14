import { validate } from '../../../src/middleware/validation.middleware';
import Joi from 'joi';
import { ValidationError } from '../../../src/errors';

describe('Validation Middleware', () => {
  it('should validate and pass valid data', async () => {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(8).required(),
    });

    const request: any = {
      body: {
        email: 'test@example.com',
        password: 'password123',
      },
    };
    const reply: any = {};

    const middleware = validate(schema);
    await expect(middleware(request, reply)).resolves.not.toThrow();

    expect(request.body).toEqual({
      email: 'test@example.com',
      password: 'password123',
    });
  });

  it('should throw ValidationError for invalid data', async () => {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(8).required(),
    });

    const request: any = {
      body: {
        email: 'invalid-email',
        password: '123',
      },
    };
    const reply: any = {};

    const middleware = validate(schema);

    await expect(middleware(request, reply)).rejects.toThrow(ValidationError);
  });

  it('should strip unknown fields', async () => {
    const schema = Joi.object({
      email: Joi.string().email().required(),
    });

    const request: any = {
      body: {
        email: 'test@example.com',
        unknownField: 'should be stripped',
      },
    };
    const reply: any = {};

    const middleware = validate(schema);
    await middleware(request, reply);

    expect(request.body).toEqual({
      email: 'test@example.com',
    });
    expect(request.body.unknownField).toBeUndefined();
  });

  it('should include all validation errors', async () => {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(8).required(),
      age: Joi.number().min(18).required(),
    });

    const request: any = {
      body: {
        email: 'invalid',
        password: 'short',
        age: 10,
      },
    };
    const reply: any = {};

    const middleware = validate(schema);

    try {
      await middleware(request, reply);
      fail('Should have thrown ValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validationError = error as ValidationError;
      expect(validationError.errors.length).toBeGreaterThan(0);
      expect(validationError.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: expect.any(String) }),
        ])
      );
    }
  });

  it('should format validation errors correctly', async () => {
    const schema = Joi.object({
      email: Joi.string().email().required(),
    });

    const request: any = {
      body: {
        email: 'not-an-email',
      },
    };
    const reply: any = {};

    const middleware = validate(schema);

    try {
      await middleware(request, reply);
      fail('Should have thrown ValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validationError = error as ValidationError;
      expect(validationError.errors[0]).toHaveProperty('field');
      expect(validationError.errors[0]).toHaveProperty('message');
    }
  });

  it('should propagate non-Joi errors', async () => {
    const schema = Joi.object({
      email: Joi.string().required(),
    });

    // Mock validateAsync to throw a non-Joi error
    const originalValidate = schema.validateAsync;
    schema.validateAsync = jest.fn().mockRejectedValue(new Error('Database error'));

    const request: any = {
      body: { email: 'test@example.com' },
    };
    const reply: any = {};

    const middleware = validate(schema);

    await expect(middleware(request, reply)).rejects.toThrow('Database error');

    schema.validateAsync = originalValidate;
  });
});
