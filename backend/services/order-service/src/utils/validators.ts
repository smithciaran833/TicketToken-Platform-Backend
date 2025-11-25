import { OrderItem } from '../types';
import { orderConfig } from '../config';

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateOrderItems(items: OrderItem[]): void {
  if (!items || items.length === 0) {
    throw new ValidationError('Order must contain at least one item');
  }

  if (items.length > orderConfig.limits.maxItemsPerOrder) {
    throw new ValidationError(`Order cannot contain more than ${orderConfig.limits.maxItemsPerOrder} items`);
  }

  items.forEach((item, index) => {
    if (!item.ticketTypeId) {
      throw new ValidationError(`Item ${index} missing ticketTypeId`, 'ticketTypeId');
    }

    if (!item.quantity || item.quantity <= 0) {
      throw new ValidationError(`Item ${index} quantity must be greater than 0`, 'quantity');
    }

    if (item.quantity > orderConfig.limits.maxQuantityPerItem) {
      throw new ValidationError(
        `Item ${index} quantity cannot exceed ${orderConfig.limits.maxQuantityPerItem}`,
        'quantity'
      );
    }

    if (!item.unitPriceCents || item.unitPriceCents < 0) {
      throw new ValidationError(`Item ${index} unitPriceCents must be non-negative`, 'unitPriceCents');
    }
  });
}

export function validateUserId(userId: string): void {
  if (!userId || typeof userId !== 'string') {
    throw new ValidationError('Valid userId is required', 'userId');
  }
}

export function validateEventId(eventId: string): void {
  if (!eventId || typeof eventId !== 'string') {
    throw new ValidationError('Valid eventId is required', 'eventId');
  }
}

export function validateOrderId(orderId: string): void {
  if (!orderId || typeof orderId !== 'string') {
    throw new ValidationError('Valid orderId is required', 'orderId');
  }
}
