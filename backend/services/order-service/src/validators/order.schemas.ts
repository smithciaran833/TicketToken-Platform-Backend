import Joi from 'joi';

// ============================================================================
// ORDER VALIDATION SCHEMAS
// ============================================================================

/**
 * Create Order Request Schema
 * Validates the complete order creation payload
 */
export const createOrderSchema = Joi.object({
  eventId: Joi.string()
    .uuid({ version: 'uuidv4' })
    .required()
    .messages({
      'string.guid': 'Event ID must be a valid UUID',
      'any.required': 'Event ID is required',
    }),

  items: Joi.array()
    .items(
      Joi.object({
        ticketTypeId: Joi.string()
          .uuid({ version: 'uuidv4' })
          .required()
          .messages({
            'string.guid': 'Ticket Type ID must be a valid UUID',
            'any.required': 'Ticket Type ID is required',
          }),

        quantity: Joi.number()
          .integer()
          .min(1)
          .max(20) // Maximum 20 tickets per type
          .required()
          .messages({
            'number.min': 'Quantity must be at least 1',
            'number.max': 'Maximum 20 tickets allowed per ticket type',
            'any.required': 'Quantity is required',
          }),

        unitPriceCents: Joi.number()
          .integer()
          .min(0)
          .max(1000000000) // $10 million max per ticket
          .required()
          .messages({
            'number.min': 'Unit price cannot be negative',
            'number.max': 'Unit price exceeds maximum allowed',
            'any.required': 'Unit price is required',
          }),
      })
    )
    .min(1)
    .max(50) // Maximum 50 total items in order
    .required()
    .messages({
      'array.min': 'At least one item is required',
      'array.max': 'Maximum 50 items allowed per order',
      'any.required': 'Items are required',
    }),

  currency: Joi.string()
    .uppercase()
    .length(3)
    .valid('USD', 'EUR', 'GBP', 'CAD', 'AUD')
    .default('USD')
    .messages({
      'any.only': 'Currency must be one of: USD, EUR, GBP, CAD, AUD',
    }),

  idempotencyKey: Joi.string()
    .min(16)
    .max(255)
    .optional()
    .messages({
      'string.min': 'Idempotency key must be at least 16 characters',
      'string.max': 'Idempotency key cannot exceed 255 characters',
    }),

  metadata: Joi.object()
    .optional()
    .max(10) // Maximum 10 metadata fields
    .messages({
      'object.max': 'Maximum 10 metadata fields allowed',
    }),
}).custom((value, helpers) => {
  // Custom validation: Check total order value doesn't exceed limit
  const totalItems = value.items.reduce((sum: number, item: any) => sum + item.quantity, 0);
  if (totalItems > 100) {
    return helpers.error('any.custom', {
      message: 'Total quantity across all items cannot exceed 100 tickets',
    });
  }

  // Check total order value
  const totalValue = value.items.reduce(
    (sum: number, item: any) => sum + item.quantity * item.unitPriceCents,
    0
  );
  if (totalValue > 10000000000) {
    // $100 million max order
    return helpers.error('any.custom', {
      message: 'Total order value exceeds maximum allowed ($100,000,000)',
    });
  }

  return value;
});

/**
 * Reserve Order Request Schema
 */
export const reserveOrderSchema = Joi.object({
  orderId: Joi.string()
    .uuid({ version: 'uuidv4' })
    .required()
    .messages({
      'string.guid': 'Order ID must be a valid UUID',
      'any.required': 'Order ID is required',
    }),
});

/**
 * Cancel Order Request Schema
 */
export const cancelOrderSchema = Joi.object({
  reason: Joi.string()
    .min(1)
    .max(500)
    .required()
    .messages({
      'string.min': 'Cancellation reason is required',
      'string.max': 'Cancellation reason cannot exceed 500 characters',
      'any.required': 'Cancellation reason is required',
    }),
});

/**
 * Refund Order Request Schema
 */
export const refundOrderSchema = Joi.object({
  amountCents: Joi.number()
    .integer()
    .min(1)
    .required()
    .messages({
      'number.min': 'Refund amount must be greater than 0',
      'any.required': 'Refund amount is required',
    }),

  reason: Joi.string()
    .min(1)
    .max(500)
    .required()
    .messages({
      'string.min': 'Refund reason is required',
      'string.max': 'Refund reason cannot exceed 500 characters',
      'any.required': 'Refund reason is required',
    }),

  metadata: Joi.object().optional(),
});

/**
 * Get Orders Query Parameters Schema
 */
export const getOrdersQuerySchema = Joi.object({
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(50)
    .messages({
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit cannot exceed 100',
    }),

  offset: Joi.number()
    .integer()
    .min(0)
    .default(0)
    .messages({
      'number.min': 'Offset cannot be negative',
    }),

  status: Joi.string()
    .valid('PENDING', 'RESERVED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'REFUNDED')
    .optional()
    .messages({
      'any.only':
        'Status must be one of: PENDING, RESERVED, CONFIRMED, COMPLETED, CANCELLED, EXPIRED, REFUNDED',
    }),
});

/**
 * UUID Parameter Schema (for path parameters)
 */
export const uuidParamSchema = Joi.object({
  orderId: Joi.string()
    .uuid({ version: 'uuidv4' })
    .required()
    .messages({
      'string.guid': 'Order ID must be a valid UUID',
      'any.required': 'Order ID is required',
    }),
});
