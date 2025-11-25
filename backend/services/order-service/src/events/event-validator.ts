import Joi from 'joi';
import { OrderEvents } from './event-types';
import { EventSchemaMap } from './event-schemas';
import { logger } from '../utils/logger';

export class EventValidationError extends Error {
  constructor(
    public eventType: OrderEvents,
    public validationErrors: Joi.ValidationError
  ) {
    super(`Event validation failed for ${eventType}: ${validationErrors.message}`);
    this.name = 'EventValidationError';
  }
}

/**
 * Validate event payload against its schema
 */
export function validateEventPayload<T = any>(
  eventType: OrderEvents,
  payload: T
): { valid: true; value: T } | { valid: false; error: Joi.ValidationError } {
  const schema = EventSchemaMap[eventType];
  
  if (!schema) {
    logger.warn('No schema found for event type', { eventType });
    return { valid: true, value: payload };
  }

  const result = schema.validate(payload, {
    abortEarly: false, // Return all errors, not just the first
    stripUnknown: true, // Remove unknown fields
    convert: true, // Convert types where possible
  });

  if (result.error) {
    logger.error('Event validation failed', {
      eventType,
      errors: result.error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message,
        type: d.type,
      })),
    });
    return { valid: false, error: result.error };
  }

  return { valid: true, value: result.value };
}

/**
 * Validate and throw on error
 */
export function validateEventPayloadOrThrow<T = any>(
  eventType: OrderEvents,
  payload: T
): T {
  const result = validateEventPayload(eventType, payload);
  
  if (!result.valid) {
    throw new EventValidationError(eventType, result.error);
  }
  
  return result.value;
}
