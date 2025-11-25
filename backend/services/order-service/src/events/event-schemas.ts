import Joi from 'joi';
import { OrderEvents } from './event-types';

/**
 * Base schema for all order events
 */
const baseEventSchema = Joi.object({
  orderId: Joi.string().uuid().required(),
  userId: Joi.string().uuid().required(),
  eventId: Joi.string().uuid().required(),
  orderNumber: Joi.string().min(1).max(50).required(),
  status: Joi.string().valid(
    'PENDING',
    'RESERVED',
    'CONFIRMED',
    'COMPLETED',
    'CANCELLED',
    'EXPIRED',
    'REFUNDED'
  ).required(),
  totalCents: Joi.number().integer().min(0).max(100000000).required(), // Max $1M
  currency: Joi.string().length(3).uppercase().required(),
  items: Joi.array().items(
    Joi.object({
      ticketTypeId: Joi.string().uuid().required(),
      quantity: Joi.number().integer().min(1).max(100).required(),
      unitPriceCents: Joi.number().integer().min(0).required(),
    })
  ).min(1).max(50).required(),
  timestamp: Joi.date().required(),
  metadata: Joi.object().optional(),
});

/**
 * Order Created Event Schema
 */
export const OrderCreatedSchema = baseEventSchema;

/**
 * Order Reserved Event Schema
 */
export const OrderReservedSchema = baseEventSchema.keys({
  expiresAt: Joi.date().required(),
});

/**
 * Order Confirmed Event Schema
 */
export const OrderConfirmedSchema = baseEventSchema.keys({
  paymentIntentId: Joi.string().min(1).max(255).required(),
});

/**
 * Order Cancelled Event Schema
 */
export const OrderCancelledSchema = baseEventSchema.keys({
  reason: Joi.string().min(1).max(500).required(),
  refundAmountCents: Joi.number().integer().min(0).optional(),
});

/**
 * Order Expired Event Schema
 */
export const OrderExpiredSchema = baseEventSchema.keys({
  reason: Joi.string().min(1).max(500).required(),
});

/**
 * Order Refunded Event Schema
 */
export const OrderRefundedSchema = baseEventSchema.keys({
  refundAmountCents: Joi.number().integer().min(0).required(),
  reason: Joi.string().min(1).max(500).required(),
});

/**
 * Order Failed Event Schema
 */
export const OrderFailedSchema = baseEventSchema.keys({
  error: Joi.string().min(1).max(1000).required(),
});

/**
 * Map event types to their schemas
 */
export const EventSchemaMap: Record<OrderEvents, Joi.ObjectSchema> = {
  [OrderEvents.ORDER_CREATED]: OrderCreatedSchema,
  [OrderEvents.ORDER_RESERVED]: OrderReservedSchema,
  [OrderEvents.ORDER_CONFIRMED]: OrderConfirmedSchema,
  [OrderEvents.ORDER_CANCELLED]: OrderCancelledSchema,
  [OrderEvents.ORDER_EXPIRED]: OrderExpiredSchema,
  [OrderEvents.ORDER_REFUNDED]: OrderRefundedSchema,
  [OrderEvents.ORDER_FAILED]: OrderFailedSchema,
};
