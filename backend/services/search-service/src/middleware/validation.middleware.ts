/**
 * Validation Middleware
 * Validates request parameters using Joi schemas
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  validateSearchQuery,
  validateVenueSearch,
  validateEventSearch,
  validateSuggest
} from '../validators/search.schemas';

/**
 * Generic validation middleware factory
 */
function createValidator(validatorFn: (data: any) => { error?: any; value?: any }) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { error, value } = validatorFn(request.query);
    
    if (error) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid request parameters',
        details: error.details.map((d: any) => ({
          field: d.path.join('.'),
          message: d.message,
          type: d.type
        }))
      });
    }
    
    // Replace query with validated & sanitized values
    request.query = value;
  };
}

/**
 * Validates main search query
 */
export const validateSearch = createValidator(validateSearchQuery);

/**
 * Validates venue search query
 */
export const validateVenues = createValidator(validateVenueSearch);

/**
 * Validates event search query
 */
export const validateEvents = createValidator(validateEventSearch);

/**
 * Validates autocomplete/suggest query
 */
export const validateSuggestions = createValidator(validateSuggest);

/**
 * Error handler for validation errors
 */
export function handleValidationError(error: any, request: FastifyRequest, reply: FastifyReply) {
  if (error.isJoi) {
    return reply.status(400).send({
      error: 'Validation Error',
      message: 'Invalid request parameters',
      details: error.details.map((d: any) => ({
        field: d.path.join('.'),
        message: d.message
      }))
    });
  }
  
  // Re-throw other errors
  throw error;
}
