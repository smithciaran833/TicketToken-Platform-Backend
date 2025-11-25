export enum OrderEvents {
  ORDER_CREATED = 'order.created',
  ORDER_RESERVED = 'order.reserved',
  ORDER_CONFIRMED = 'order.confirmed',
  ORDER_CANCELLED = 'order.cancelled',
  ORDER_EXPIRED = 'order.expired',
  ORDER_REFUNDED = 'order.refunded',
  ORDER_FAILED = 'order.failed',
}

export interface OrderEventPayload {
  orderId: string;
  userId: string;
  eventId: string;
  orderNumber: string;
  status: string;
  totalCents: number;
  currency: string;
  items: Array<{
    ticketTypeId: string;
    quantity: number;
    unitPriceCents: number;
  }>;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface OrderEvent<T = any> {
  version: string; // Semantic versioning (e.g., "1.0.0")
  type: OrderEvents;
  idempotencyKey: string; // Unique key for deduplication
  sequenceNumber: number; // Per-order sequence for ordering
  aggregateId: string; // orderId for grouping
  payload: T;
  timestamp: Date;
  metadata?: Record<string, any>;
}
