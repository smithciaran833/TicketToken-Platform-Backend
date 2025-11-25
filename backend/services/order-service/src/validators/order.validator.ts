import { CreateOrderRequest, ReserveOrderRequest, CancelOrderRequest, RefundOrderRequest } from '../types';
import { validateOrderItems, validateUserId, validateEventId, validateOrderId, ValidationError } from '../utils/validators';

export function validateCreateOrderRequest(data: any): asserts data is CreateOrderRequest {
  validateUserId(data.userId);
  validateEventId(data.eventId);
  validateOrderItems(data.items);

  if (data.idempotencyKey && typeof data.idempotencyKey !== 'string') {
    throw new ValidationError('idempotencyKey must be a string', 'idempotencyKey');
  }

  if (data.metadata && typeof data.metadata !== 'object') {
    throw new ValidationError('metadata must be an object', 'metadata');
  }
}

export function validateReserveOrderRequest(data: any): asserts data is ReserveOrderRequest {
  validateOrderId(data.orderId);
  validateUserId(data.userId);

  if (data.paymentMethodId && typeof data.paymentMethodId !== 'string') {
    throw new ValidationError('paymentMethodId must be a string', 'paymentMethodId');
  }
}

export function validateCancelOrderRequest(data: any): asserts data is CancelOrderRequest {
  validateOrderId(data.orderId);
  validateUserId(data.userId);

  if (!data.reason || typeof data.reason !== 'string') {
    throw new ValidationError('reason is required', 'reason');
  }

  if (!data.cancelledBy || !['user', 'admin', 'system'].includes(data.cancelledBy)) {
    throw new ValidationError('cancelledBy must be one of: user, admin, system', 'cancelledBy');
  }
}

export function validateRefundOrderRequest(data: any): asserts data is RefundOrderRequest {
  validateOrderId(data.orderId);

  if (!data.reason || typeof data.reason !== 'string') {
    throw new ValidationError('reason is required', 'reason');
  }

  if (!data.initiatedBy || typeof data.initiatedBy !== 'string') {
    throw new ValidationError('initiatedBy is required', 'initiatedBy');
  }

  if (data.amount !== undefined) {
    if (typeof data.amount !== 'number' || data.amount <= 0) {
      throw new ValidationError('amount must be a positive number', 'amount');
    }
  }
}
