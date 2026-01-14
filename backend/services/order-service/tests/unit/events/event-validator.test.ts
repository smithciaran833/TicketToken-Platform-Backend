import Joi from 'joi';
import {
  validateEventPayload,
  validateEventPayloadOrThrow,
  EventValidationError,
} from '../../../src/events/event-validator';
import { OrderEvents } from '../../../src/events/event-types';
import { EventSchemaMap } from '../../../src/events/event-schemas';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../src/events/event-schemas', () => ({
  EventSchemaMap: {
    'order.created': Joi.object({
      orderId: Joi.string().uuid().required(),
      userId: Joi.string().uuid().required(),
      totalCents: Joi.number().integer().min(0).required(),
      status: Joi.string().required(),
    }),
    'order.confirmed': Joi.object({
      orderId: Joi.string().uuid().required(),
      userId: Joi.string().uuid().required(),
      totalCents: Joi.number().integer().min(0).required(),
      status: Joi.string().required(),
      paymentIntentId: Joi.string().required(),
    }),
  },
}));

describe('EventValidator', () => {
  const mockLoggerWarn = logger.warn as jest.MockedFunction<typeof logger.warn>;
  const mockLoggerError = logger.error as jest.MockedFunction<typeof logger.error>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateEventPayload', () => {
    describe('when schema exists', () => {
      it('should return valid result for correct payload', () => {
        const payload = {
          orderId: '123e4567-e89b-12d3-a456-426614174000',
          userId: '987e6543-e21b-12d3-a456-426614174001',
          totalCents: 10000,
          status: 'PENDING',
        };

        const result = validateEventPayload(OrderEvents.ORDER_CREATED, payload);

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.value).toEqual(payload);
        }
        expect(mockLoggerError).not.toHaveBeenCalled();
      });

      it('should strip unknown fields from payload', () => {
        const payload = {
          orderId: '123e4567-e89b-12d3-a456-426614174000',
          userId: '987e6543-e21b-12d3-a456-426614174001',
          totalCents: 10000,
          status: 'PENDING',
          unknownField: 'should be removed',
          anotherUnknown: 123,
        };

        const result = validateEventPayload(OrderEvents.ORDER_CREATED, payload);

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.value).not.toHaveProperty('unknownField');
          expect(result.value).not.toHaveProperty('anotherUnknown');
          expect(result.value).toEqual({
            orderId: '123e4567-e89b-12d3-a456-426614174000',
            userId: '987e6543-e21b-12d3-a456-426614174001',
            totalCents: 10000,
            status: 'PENDING',
          });
        }
      });

      it('should convert types where possible', () => {
        const payload = {
          orderId: '123e4567-e89b-12d3-a456-426614174000',
          userId: '987e6543-e21b-12d3-a456-426614174001',
          totalCents: '10000', // String that can be converted to number
          status: 'PENDING',
        };

        const result = validateEventPayload(OrderEvents.ORDER_CREATED, payload);

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.value.totalCents).toBe(10000);
          expect(typeof result.value.totalCents).toBe('number');
        }
      });

      it('should return invalid result for missing required fields', () => {
        const payload = {
          orderId: '123e4567-e89b-12d3-a456-426614174000',
          // Missing userId, totalCents, status
        };

        const result = validateEventPayload(OrderEvents.ORDER_CREATED, payload);

        expect(result.valid).toBe(false);
        if (result.valid === false) {
          expect(result.error).toBeInstanceOf(Joi.ValidationError);
          expect(result.error.details).toHaveLength(3); // userId, totalCents, status
        }

        expect(mockLoggerError).toHaveBeenCalledWith(
          'Event validation failed',
          expect.objectContaining({
            eventType: OrderEvents.ORDER_CREATED,
            errors: expect.arrayContaining([
              expect.objectContaining({
                field: 'userId',
                message: expect.stringContaining('required'),
              }),
              expect.objectContaining({
                field: 'totalCents',
                message: expect.stringContaining('required'),
              }),
              expect.objectContaining({
                field: 'status',
                message: expect.stringContaining('required'),
              }),
            ]),
          })
        );
      });

      it('should return invalid result for incorrect field types', () => {
        const payload = {
          orderId: 'not-a-uuid',
          userId: '987e6543-e21b-12d3-a456-426614174001',
          totalCents: 'not-a-number',
          status: 'PENDING',
        };

        const result = validateEventPayload(OrderEvents.ORDER_CREATED, payload);

        expect(result.valid).toBe(false);
        if (result.valid === false) {
          expect(result.error).toBeInstanceOf(Joi.ValidationError);
          expect(result.error.details.length).toBeGreaterThan(0);
        }
      });

      it('should return invalid result for negative totalCents', () => {
        const payload = {
          orderId: '123e4567-e89b-12d3-a456-426614174000',
          userId: '987e6543-e21b-12d3-a456-426614174001',
          totalCents: -100,
          status: 'PENDING',
        };

        const result = validateEventPayload(OrderEvents.ORDER_CREATED, payload);

        expect(result.valid).toBe(false);
        if (result.valid === false) {
          expect(result.error.details[0].message).toContain('must be greater than or equal to 0');
        }
      });

      it('should return all validation errors with abortEarly: false', () => {
        const payload = {
          orderId: 'not-a-uuid',
          userId: 'not-a-uuid',
          totalCents: -100,
          // Missing status
        };

        const result = validateEventPayload(OrderEvents.ORDER_CREATED, payload);

        expect(result.valid).toBe(false);
        if (result.valid === false) {
          expect(result.error.details.length).toBeGreaterThanOrEqual(3);
        }
      });

      it('should log detailed error information', () => {
        const payload = {
          orderId: '123e4567-e89b-12d3-a456-426614174000',
          // Missing required fields
        };

        validateEventPayload(OrderEvents.ORDER_CREATED, payload);

        expect(mockLoggerError).toHaveBeenCalledWith(
          'Event validation failed',
          expect.objectContaining({
            eventType: OrderEvents.ORDER_CREATED,
            errors: expect.arrayContaining([
              expect.objectContaining({
                field: expect.any(String),
                message: expect.any(String),
                type: expect.any(String),
              }),
            ]),
          })
        );
      });
    });

    describe('when schema does not exist', () => {
      it('should return valid result and log warning', () => {
        const payload = { anyField: 'anyValue' };
        const unknownEventType = 'unknown.event' as OrderEvents;

        const result = validateEventPayload(unknownEventType, payload);

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.value).toEqual(payload);
        }

        expect(mockLoggerWarn).toHaveBeenCalledWith(
          'No schema found for event type',
          { eventType: unknownEventType }
        );
      });

      it('should not modify payload when no schema exists', () => {
        const payload = {
          field1: 'value1',
          field2: 123,
          nested: { data: 'test' },
        };
        const unknownEventType = 'unknown.event' as OrderEvents;

        const result = validateEventPayload(unknownEventType, payload);

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.value).toEqual(payload);
        }
      });
    });

    describe('complex validation scenarios', () => {
      it('should validate nested fields correctly', () => {
        const payload = {
          orderId: '123e4567-e89b-12d3-a456-426614174000',
          userId: '987e6543-e21b-12d3-a456-426614174001',
          totalCents: 10000,
          status: 'CONFIRMED',
          paymentIntentId: 'pi_123456789',
        };

        const result = validateEventPayload(OrderEvents.ORDER_CONFIRMED, payload);

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.value.paymentIntentId).toBe('pi_123456789');
        }
      });

      it('should reject empty string values for required fields', () => {
        const payload = {
          orderId: '123e4567-e89b-12d3-a456-426614174000',
          userId: '987e6543-e21b-12d3-a456-426614174001',
          totalCents: 10000,
          status: '', // Empty string should fail validation
        };

        const result = validateEventPayload(OrderEvents.ORDER_CREATED, payload);

        expect(result.valid).toBe(false);
        if (result.valid === false) {
          expect(result.error).toBeInstanceOf(Joi.ValidationError);
        }
      });
    });
  });

  describe('validateEventPayloadOrThrow', () => {
    it('should return validated payload for valid input', () => {
      const payload = {
        orderId: '123e4567-e89b-12d3-a456-426614174000',
        userId: '987e6543-e21b-12d3-a456-426614174001',
        totalCents: 10000,
        status: 'PENDING',
      };

      const result = validateEventPayloadOrThrow(OrderEvents.ORDER_CREATED, payload);

      expect(result).toEqual(payload);
    });

    it('should strip unknown fields and return clean payload', () => {
      const payload = {
        orderId: '123e4567-e89b-12d3-a456-426614174000',
        userId: '987e6543-e21b-12d3-a456-426614174001',
        totalCents: 10000,
        status: 'PENDING',
        unknownField: 'should be removed',
      };

      const result = validateEventPayloadOrThrow(OrderEvents.ORDER_CREATED, payload);

      expect(result).not.toHaveProperty('unknownField');
      expect(result).toEqual({
        orderId: '123e4567-e89b-12d3-a456-426614174000',
        userId: '987e6543-e21b-12d3-a456-426614174001',
        totalCents: 10000,
        status: 'PENDING',
      });
    });

    it('should throw EventValidationError for invalid payload', () => {
      const payload = {
        orderId: '123e4567-e89b-12d3-a456-426614174000',
        // Missing required fields
      };

      expect(() => {
        validateEventPayloadOrThrow(OrderEvents.ORDER_CREATED, payload);
      }).toThrow(EventValidationError);
    });

    it('should include event type in thrown error', () => {
      const payload = {
        orderId: '123e4567-e89b-12d3-a456-426614174000',
      };

      try {
        validateEventPayloadOrThrow(OrderEvents.ORDER_CREATED, payload);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(EventValidationError);
        if (error instanceof EventValidationError) {
          expect(error.eventType).toBe(OrderEvents.ORDER_CREATED);
        }
      }
    });

    it('should include validation errors in thrown error', () => {
      const payload = {
        orderId: '123e4567-e89b-12d3-a456-426614174000',
      };

      try {
        validateEventPayloadOrThrow(OrderEvents.ORDER_CREATED, payload);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(EventValidationError);
        if (error instanceof EventValidationError) {
          expect(error.validationErrors).toBeInstanceOf(Joi.ValidationError);
          expect(error.validationErrors.details.length).toBeGreaterThan(0);
        }
      }
    });

    it('should have descriptive error message', () => {
      const payload = {
        orderId: '123e4567-e89b-12d3-a456-426614174000',
      };

      try {
        validateEventPayloadOrThrow(OrderEvents.ORDER_CREATED, payload);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(EventValidationError);
        if (error instanceof EventValidationError) {
          expect(error.message).toContain('Event validation failed');
          expect(error.message).toContain(OrderEvents.ORDER_CREATED);
        }
      }
    });

    it('should not throw for payload without schema', () => {
      const payload = { anyField: 'anyValue' };
      const unknownEventType = 'unknown.event' as OrderEvents;

      const result = validateEventPayloadOrThrow(unknownEventType, payload);

      expect(result).toEqual(payload);
      expect(mockLoggerWarn).toHaveBeenCalled();
    });
  });

  describe('EventValidationError', () => {
    it('should be an instance of Error', () => {
      const joiError = new Joi.ValidationError(
        'validation failed',
        [{ message: 'test error', path: ['field'], type: 'any.required' }],
        null
      );
      const error = new EventValidationError(OrderEvents.ORDER_CREATED, joiError);

      expect(error).toBeInstanceOf(Error);
    });

    it('should have correct name property', () => {
      const joiError = new Joi.ValidationError(
        'validation failed',
        [{ message: 'test error', path: ['field'], type: 'any.required' }],
        null
      );
      const error = new EventValidationError(OrderEvents.ORDER_CREATED, joiError);

      expect(error.name).toBe('EventValidationError');
    });

    it('should store eventType', () => {
      const joiError = new Joi.ValidationError(
        'validation failed',
        [{ message: 'test error', path: ['field'], type: 'any.required' }],
        null
      );
      const error = new EventValidationError(OrderEvents.ORDER_CREATED, joiError);

      expect(error.eventType).toBe(OrderEvents.ORDER_CREATED);
    });

    it('should store validationErrors', () => {
      const joiError = new Joi.ValidationError(
        'validation failed',
        [{ message: 'test error', path: ['field'], type: 'any.required' }],
        null
      );
      const error = new EventValidationError(OrderEvents.ORDER_CREATED, joiError);

      expect(error.validationErrors).toBe(joiError);
    });

    it('should have message that includes event type and validation error', () => {
      const joiError = new Joi.ValidationError(
        'userId is required',
        [{ message: 'userId is required', path: ['userId'], type: 'any.required' }],
        null
      );
      const error = new EventValidationError(OrderEvents.ORDER_CREATED, joiError);

      expect(error.message).toContain('Event validation failed');
      expect(error.message).toContain(OrderEvents.ORDER_CREATED);
      expect(error.message).toContain('userId is required');
    });
  });
});
