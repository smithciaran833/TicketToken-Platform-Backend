export enum OrderStatus {
  PENDING = 'PENDING',
  RESERVED = 'RESERVED',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  REFUNDED = 'REFUNDED',
}

export enum RefundStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum OrderEventType {
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_UPDATED = 'ORDER_UPDATED',
  TICKETS_RESERVED = 'TICKETS_RESERVED',
  PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED',
  ORDER_CONFIRMED = 'ORDER_CONFIRMED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  RESERVATION_EXPIRED = 'RESERVATION_EXPIRED',
  REFUND_REQUESTED = 'REFUND_REQUESTED',
  REFUND_ISSUED = 'REFUND_ISSUED',
}

export interface Order {
  id: string;
  tenantId: string;
  userId: string;
  eventId: string;
  orderNumber: string;
  status: OrderStatus;
  subtotalCents: number;
  platformFeeCents: number;
  processingFeeCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
  paymentIntentId?: string;
  idempotencyKey?: string;
  expiresAt?: Date | null;
  confirmedAt?: Date | null;
  cancelledAt?: Date | null;
  refundedAt?: Date | null;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: string;
  tenantId: string;
  orderId: string;
  ticketTypeId: string;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  createdAt: Date;
}

export interface OrderEvent {
  id: string;
  tenantId: string;
  orderId: string;
  eventType: OrderEventType;
  userId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface OrderRefund {
  id: string;
  tenantId: string;
  refundId: string;
  orderId: string;
  refundAmountCents: number;
  refundReason: string;
  refundStatus: RefundStatus;
  stripeRefundId?: string;
  initiatedBy?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderRequest {
  userId: string;
  eventId: string;
  items: Array<{
    ticketTypeId: string;
    quantity: number;
    unitPriceCents: number;
  }>;
  currency?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

export interface ReserveOrderRequest {
  orderId: string;
  userId: string;
}

export interface ConfirmOrderRequest {
  orderId: string;
  paymentIntentId: string;
}

export interface CancelOrderRequest {
  orderId: string;
  userId: string;
  reason: string;
}

export interface RefundOrderRequest {
  orderId: string;
  amountCents: number;
  reason: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export type OrderUpdateData = Partial<{
  status: OrderStatus;
  paymentIntentId: string;
  expiresAt: Date | null;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  refundedAt: Date | null;
  metadata: Record<string, any>;
}>;
