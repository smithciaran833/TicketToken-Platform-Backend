/**
 * Domain-specific error types for order service
 * Provides type-safe error handling with structured error codes
 */

export class DomainError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class OrderNotFoundError extends DomainError {
  constructor(orderId: string) {
    super(`Order ${orderId} not found`, 'ORDER_NOT_FOUND', 404);
  }
}

export class InvalidStatusTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(
      `Invalid order status transition from ${from} to ${to}`,
      'INVALID_STATUS_TRANSITION',
      400
    );
  }
}

export class InsufficientTicketsError extends DomainError {
  constructor(ticketTypeId: string, requested: number, available: number) {
    super(
      `Insufficient tickets for type ${ticketTypeId}. Requested: ${requested}, Available: ${available}`,
      'INSUFFICIENT_TICKETS',
      409
    );
  }
}

export class PriceManipulationError extends DomainError {
  constructor(ticketTypeId: string, provided: number, actual: number) {
    super(
      `Price manipulation detected for ticket ${ticketTypeId}. Provided: ${provided}, Actual: ${actual}`,
      'PRICE_MANIPULATION',
      400
    );
  }
}

export class DuplicateOrderError extends DomainError {
  constructor(idempotencyKey: string) {
    super(
      `Order with idempotency key ${idempotencyKey} already exists`,
      'DUPLICATE_ORDER',
      409
    );
  }
}

export class OrderExpiredError extends DomainError {
  constructor(orderId: string) {
    super(`Order ${orderId} has expired`, 'ORDER_EXPIRED', 410);
  }
}

export class InvalidOrderStatusError extends DomainError {
  constructor(orderId: string, currentStatus: string, expectedStatus: string) {
    super(
      `Order ${orderId} is in ${currentStatus} status, expected ${expectedStatus}`,
      'INVALID_ORDER_STATUS',
      400
    );
  }
}

export class PaymentIntentNotFoundError extends DomainError {
  constructor(orderId: string) {
    super(
      `No payment intent found for order ${orderId}`,
      'PAYMENT_INTENT_NOT_FOUND',
      400
    );
  }
}

export class ServiceUnavailableError extends DomainError {
  constructor(serviceName: string, originalError?: any) {
    super(
      `Service ${serviceName} is currently unavailable`,
      'SERVICE_UNAVAILABLE',
      503
    );
    if (originalError) {
      this.stack = originalError.stack;
    }
  }
}

export class EventNotFoundError extends DomainError {
  constructor(eventId: string) {
    super(`Event ${eventId} not found`, 'EVENT_NOT_FOUND', 404);
  }
}

export class TenantIsolationError extends DomainError {
  constructor(resource: string) {
    super(
      `Tenant isolation violation: Cannot access ${resource}`,
      'TENANT_ISOLATION_VIOLATION',
      403
    );
  }
}

export class RefundAmountExceedsOrderTotalError extends DomainError {
  constructor(refundAmount: number, orderTotal: number) {
    super(
      `Refund amount ${refundAmount} exceeds order total ${orderTotal}`,
      'REFUND_AMOUNT_EXCEEDS_TOTAL',
      400
    );
  }
}
