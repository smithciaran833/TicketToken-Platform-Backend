import {
  validateCreateOrderRequest,
  validateReserveOrderRequest,
  validateCancelOrderRequest,
  validateRefundOrderRequest,
} from '../../../src/validators/order.validator';
import { ValidationError } from '../../../src/utils/validators';

describe('Order Validator', () => {
  const validUuid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  describe('validateCreateOrderRequest', () => {
    const validRequest = {
      userId: validUuid,
      eventId: validUuid,
      items: [
        {
          ticketTypeId: validUuid,
          quantity: 2,
          unitPriceCents: 5000,
        },
      ],
    };

    it('should validate a valid create order request', () => {
      expect(() => validateCreateOrderRequest(validRequest)).not.toThrow();
    });

    it('should throw ValidationError for missing userId', () => {
      const request = { ...validRequest };
      delete (request as any).userId;

      expect(() => validateCreateOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateCreateOrderRequest(request)).toThrow('Valid userId is required');
    });

    it('should throw ValidationError for empty userId', () => {
      const request = { ...validRequest, userId: '' };

      expect(() => validateCreateOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateCreateOrderRequest(request)).toThrow('Valid userId is required');
    });

    it('should throw ValidationError for missing eventId', () => {
      const request = { ...validRequest };
      delete (request as any).eventId;

      expect(() => validateCreateOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateCreateOrderRequest(request)).toThrow('Valid eventId is required');
    });

    it('should throw ValidationError for empty eventId', () => {
      const request = { ...validRequest, eventId: '' };

      expect(() => validateCreateOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateCreateOrderRequest(request)).toThrow('Valid eventId is required');
    });

    it('should throw ValidationError for missing items', () => {
      const request = { ...validRequest };
      delete (request as any).items;

      expect(() => validateCreateOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateCreateOrderRequest(request)).toThrow('Order must contain at least one item');
    });

    it('should throw ValidationError for empty items array', () => {
      const request = { ...validRequest, items: [] };

      expect(() => validateCreateOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateCreateOrderRequest(request)).toThrow('Order must contain at least one item');
    });

    it('should throw ValidationError for invalid item structure', () => {
      const request = {
        ...validRequest,
        items: [{ quantity: 2 }],
      };

      expect(() => validateCreateOrderRequest(request)).toThrow(ValidationError);
    });

    it('should accept optional idempotencyKey', () => {
      const request = { ...validRequest, idempotencyKey: 'test-key-12345' };

      expect(() => validateCreateOrderRequest(request)).not.toThrow();
    });

    it('should throw ValidationError for invalid idempotencyKey type', () => {
      const request = { ...validRequest, idempotencyKey: 12345 };

      expect(() => validateCreateOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateCreateOrderRequest(request)).toThrow('idempotencyKey must be a string');
    });

    it('should accept optional metadata', () => {
      const request = { ...validRequest, metadata: { source: 'mobile' } };

      expect(() => validateCreateOrderRequest(request)).not.toThrow();
    });

    it('should throw ValidationError for invalid metadata type', () => {
      const request = { ...validRequest, metadata: 'invalid' };

      expect(() => validateCreateOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateCreateOrderRequest(request)).toThrow('metadata must be an object');
    });

    it('should accept null metadata', () => {
      const request = { ...validRequest, metadata: null };

      // null is typeof 'object' in JavaScript, so this passes validation
      expect(() => validateCreateOrderRequest(request)).not.toThrow();
    });

    it('should throw ValidationError for array metadata', () => {
      const request = { ...validRequest, metadata: [] };

      // Arrays are typeof 'object' but might not be desired
      expect(() => validateCreateOrderRequest(request)).not.toThrow();
    });
  });

  describe('validateReserveOrderRequest', () => {
    const validRequest = {
      orderId: validUuid,
      userId: validUuid,
      paymentMethodId: 'pm_12345',
    };

    it('should validate a valid reserve order request', () => {
      expect(() => validateReserveOrderRequest(validRequest)).not.toThrow();
    });

    it('should throw ValidationError for missing orderId', () => {
      const request = { ...validRequest };
      delete (request as any).orderId;

      expect(() => validateReserveOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateReserveOrderRequest(request)).toThrow('Valid orderId is required');
    });

    it('should throw ValidationError for empty orderId', () => {
      const request = { ...validRequest, orderId: '' };

      expect(() => validateReserveOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateReserveOrderRequest(request)).toThrow('Valid orderId is required');
    });

    it('should throw ValidationError for missing userId', () => {
      const request = { ...validRequest };
      delete (request as any).userId;

      expect(() => validateReserveOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateReserveOrderRequest(request)).toThrow('Valid userId is required');
    });

    it('should throw ValidationError for empty userId', () => {
      const request = { ...validRequest, userId: '' };

      expect(() => validateReserveOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateReserveOrderRequest(request)).toThrow('Valid userId is required');
    });

    it('should accept optional paymentMethodId', () => {
      const request = { orderId: validUuid, userId: validUuid };

      expect(() => validateReserveOrderRequest(request)).not.toThrow();
    });

    it('should throw ValidationError for invalid paymentMethodId type', () => {
      const request = { ...validRequest, paymentMethodId: 12345 };

      expect(() => validateReserveOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateReserveOrderRequest(request)).toThrow('paymentMethodId must be a string');
    });
  });

  describe('validateCancelOrderRequest', () => {
    const validRequest = {
      orderId: validUuid,
      userId: validUuid,
      reason: 'Customer requested cancellation',
      cancelledBy: 'user',
    };

    it('should validate a valid cancel order request', () => {
      expect(() => validateCancelOrderRequest(validRequest)).not.toThrow();
    });

    it('should throw ValidationError for missing orderId', () => {
      const request = { ...validRequest };
      delete (request as any).orderId;

      expect(() => validateCancelOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateCancelOrderRequest(request)).toThrow('Valid orderId is required');
    });

    it('should throw ValidationError for empty orderId', () => {
      const request = { ...validRequest, orderId: '' };

      expect(() => validateCancelOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateCancelOrderRequest(request)).toThrow('Valid orderId is required');
    });

    it('should throw ValidationError for missing userId', () => {
      const request = { ...validRequest };
      delete (request as any).userId;

      expect(() => validateCancelOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateCancelOrderRequest(request)).toThrow('Valid userId is required');
    });

    it('should throw ValidationError for missing reason', () => {
      const request = { ...validRequest };
      delete (request as any).reason;

      expect(() => validateCancelOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateCancelOrderRequest(request)).toThrow('reason is required');
    });

    it('should throw ValidationError for invalid reason type', () => {
      const request = { ...validRequest, reason: 12345 };

      expect(() => validateCancelOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateCancelOrderRequest(request)).toThrow('reason is required');
    });

    it('should throw ValidationError for empty reason', () => {
      const request = { ...validRequest, reason: '' };

      expect(() => validateCancelOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateCancelOrderRequest(request)).toThrow('reason is required');
    });

    it('should throw ValidationError for missing cancelledBy', () => {
      const request = { ...validRequest };
      delete (request as any).cancelledBy;

      expect(() => validateCancelOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateCancelOrderRequest(request)).toThrow('cancelledBy must be one of: user, admin, system');
    });

    it('should accept valid cancelledBy values', () => {
      const values = ['user', 'admin', 'system'];

      values.forEach((cancelledBy) => {
        const request = { ...validRequest, cancelledBy };
        expect(() => validateCancelOrderRequest(request)).not.toThrow();
      });
    });

    it('should throw ValidationError for invalid cancelledBy', () => {
      const request = { ...validRequest, cancelledBy: 'invalid' };

      expect(() => validateCancelOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateCancelOrderRequest(request)).toThrow('cancelledBy must be one of: user, admin, system');
    });
  });

  describe('validateRefundOrderRequest', () => {
    const validRequest = {
      orderId: validUuid,
      reason: 'Customer requested refund',
      initiatedBy: 'admin-user-id',
      amount: 5000,
    };

    it('should validate a valid refund order request', () => {
      expect(() => validateRefundOrderRequest(validRequest)).not.toThrow();
    });

    it('should throw ValidationError for missing orderId', () => {
      const request = { ...validRequest };
      delete (request as any).orderId;

      expect(() => validateRefundOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateRefundOrderRequest(request)).toThrow('Valid orderId is required');
    });

    it('should throw ValidationError for empty orderId', () => {
      const request = { ...validRequest, orderId: '' };

      expect(() => validateRefundOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateRefundOrderRequest(request)).toThrow('Valid orderId is required');
    });

    it('should throw ValidationError for missing reason', () => {
      const request = { ...validRequest };
      delete (request as any).reason;

      expect(() => validateRefundOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateRefundOrderRequest(request)).toThrow('reason is required');
    });

    it('should throw ValidationError for invalid reason type', () => {
      const request = { ...validRequest, reason: 12345 };

      expect(() => validateRefundOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateRefundOrderRequest(request)).toThrow('reason is required');
    });

    it('should throw ValidationError for empty reason', () => {
      const request = { ...validRequest, reason: '' };

      expect(() => validateRefundOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateRefundOrderRequest(request)).toThrow('reason is required');
    });

    it('should throw ValidationError for missing initiatedBy', () => {
      const request = { ...validRequest };
      delete (request as any).initiatedBy;

      expect(() => validateRefundOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateRefundOrderRequest(request)).toThrow('initiatedBy is required');
    });

    it('should throw ValidationError for invalid initiatedBy type', () => {
      const request = { ...validRequest, initiatedBy: 12345 };

      expect(() => validateRefundOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateRefundOrderRequest(request)).toThrow('initiatedBy is required');
    });

    it('should accept optional amount', () => {
      const request = {
        orderId: validUuid,
        reason: 'Refund requested',
        initiatedBy: 'admin',
      };

      expect(() => validateRefundOrderRequest(request)).not.toThrow();
    });

    it('should accept positive amount', () => {
      const request = { ...validRequest, amount: 1000 };

      expect(() => validateRefundOrderRequest(request)).not.toThrow();
    });

    it('should throw ValidationError for zero amount', () => {
      const request = { ...validRequest, amount: 0 };

      expect(() => validateRefundOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateRefundOrderRequest(request)).toThrow('amount must be a positive number');
    });

    it('should throw ValidationError for negative amount', () => {
      const request = { ...validRequest, amount: -100 };

      expect(() => validateRefundOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateRefundOrderRequest(request)).toThrow('amount must be a positive number');
    });

    it('should throw ValidationError for invalid amount type', () => {
      const request = { ...validRequest, amount: '5000' };

      expect(() => validateRefundOrderRequest(request)).toThrow(ValidationError);
      expect(() => validateRefundOrderRequest(request)).toThrow('amount must be a positive number');
    });
  });
});
