import * as Joi from 'joi';

/**
 * SECURITY FIX (RD3): UUID format validation for route params
 * All :venueId, :integrationId, etc. params should be validated
 */

// UUID v4 regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Venue ID param schema
 * SECURITY FIX (RD6): Added .unknown(false) to reject unknown properties
 */
export const venueIdParamsSchema = {
  params: Joi.object({
    venueId: Joi.string()
      .pattern(UUID_REGEX)
      .required()
      .messages({
        'string.pattern.base': 'venueId must be a valid UUID',
        'any.required': 'venueId is required',
      }),
  }).unknown(false),  // RD6: Reject unknown properties
};

/**
 * Integration ID param schema (includes venueId)
 * SECURITY FIX (RD6): Added .unknown(false) to reject unknown properties
 */
export const integrationIdParamsSchema = {
  params: Joi.object({
    venueId: Joi.string()
      .pattern(UUID_REGEX)
      .required()
      .messages({
        'string.pattern.base': 'venueId must be a valid UUID',
        'any.required': 'venueId is required',
      }),
    integrationId: Joi.string()
      .pattern(UUID_REGEX)
      .required()
      .messages({
        'string.pattern.base': 'integrationId must be a valid UUID',
        'any.required': 'integrationId is required',
      }),
  }).unknown(false),  // RD6: Reject unknown properties
};

/**
 * Content ID param schema (includes venueId)
 */
export const contentIdParamsSchema = {
  params: Joi.object({
    venueId: Joi.string()
      .pattern(UUID_REGEX)
      .required()
      .messages({
        'string.pattern.base': 'venueId must be a valid UUID',
        'any.required': 'venueId is required',
      }),
    contentId: Joi.string()
      .pattern(UUID_REGEX)
      .required()
      .messages({
        'string.pattern.base': 'contentId must be a valid UUID',
        'any.required': 'contentId is required',
      }),
  }),
};

/**
 * Review ID param schema (includes venueId)
 */
export const reviewIdParamsSchema = {
  params: Joi.object({
    venueId: Joi.string()
      .pattern(UUID_REGEX)
      .required()
      .messages({
        'string.pattern.base': 'venueId must be a valid UUID',
        'any.required': 'venueId is required',
      }),
    reviewId: Joi.string()
      .pattern(UUID_REGEX)
      .required()
      .messages({
        'string.pattern.base': 'reviewId must be a valid UUID',
        'any.required': 'reviewId is required',
      }),
  }),
};

/**
 * Generic UUID param validator factory
 */
export function createUuidParamSchema(paramName: string) {
  return {
    params: Joi.object({
      [paramName]: Joi.string()
        .pattern(UUID_REGEX)
        .required()
        .messages({
          'string.pattern.base': `${paramName} must be a valid UUID`,
          'any.required': `${paramName} is required`,
        }),
    }),
  };
}

/**
 * Combined UUID params validator factory
 */
export function createMultipleUuidParamsSchema(paramNames: string[]) {
  const schema: Record<string, Joi.Schema> = {};
  
  for (const paramName of paramNames) {
    schema[paramName] = Joi.string()
      .pattern(UUID_REGEX)
      .required()
      .messages({
        'string.pattern.base': `${paramName} must be a valid UUID`,
        'any.required': `${paramName} is required`,
      });
  }

  return {
    params: Joi.object(schema),
  };
}

/**
 * TypeBox schema for Fastify native validation (alternative)
 * Can be used with Fastify's built-in type provider
 * SECURITY FIX (RD6): Added additionalProperties: false
 */
export const venueIdParamsSchemaTypebox = {
  type: 'object',
  properties: {
    venueId: {
      type: 'string',
      format: 'uuid',
    },
  },
  required: ['venueId'],
  additionalProperties: false,  // RD6: Reject unknown properties
};

export const integrationIdParamsSchemaTypebox = {
  type: 'object',
  properties: {
    venueId: {
      type: 'string',
      format: 'uuid',
    },
    integrationId: {
      type: 'string',
      format: 'uuid',
    },
  },
  required: ['venueId', 'integrationId'],
  additionalProperties: false,  // RD6: Reject unknown properties
};
