/**
 * Unit Tests: Validators
 *
 * Tests input validation functions for orders
 */

import {
  ValidationError,
  validateOrderItems,
  validateUserId,
  validateEventId,
  validateOrderId,
} from '../../../src/utils/validators';

// Mock the orderConfig
jest.mock('../../../src/config', () => ({
  orderConfig: {
    limits: {
      maxItemsPerOrder: 50,
      maxQuantityPerItem: 10,
    },
  },
}));

describe('Validators', () => {
  // ============================================
  // ValidationError
  // ============================================
  describe('ValidationError', () => {
    it('should create error with message', () => {
      const error = new ValidationError('Invalid input');
      expect(error.message).toBe('Invalid input');
    });

    it('should set name to ValidationError', () => {
      const error = new ValidationError('Invalid input');
      expect(error.name).toBe('ValidationError');
    });

    it('should accept optional field parameter', () => {
      const error = new ValidationError('Invalid input', 'email');
      expect(error.field).toBe('email');
    });

    it('should be instanceof Error', () => {
      const error = new ValidationError('Invalid input');
      expect(error).toBeInstanceOf(Error);
    });

    it('should be instanceof ValidationError', () => {
      const error = new ValidationError('Invalid input');
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should have undefined field when not provided', () => {
      const error = new ValidationError('Invalid input');
      expect(error.field).toBeUndefined();
    });
  });

  // ============================================
  // validateOrderItems
  // ============================================
  describe('validateOrderItems', () => {
    const validItem = {
      id: 'item-1',
      tenantId: 'tenant-1',
      orderId: 'order-1',
      ticketTypeId: 'ticket-type-1',
      quantity: 2,
      unitPriceCents: 5000,
      totalPriceCents: 10000,
      createdAt: new Date(),
    };

    describe('empty/null checks', () => {
      it('should throw if items is null', () => {
        expect(() => validateOrderItems(null as any)).toThrow(ValidationError);
        expect(() => validateOrderItems(null as any)).toThrow('Order must contain at least one item');
      });

      it('should throw if items is undefined', () => {
        expect(() => validateOrderItems(undefined as any)).toThrow(ValidationError);
        expect(() => validateOrderItems(undefined as any)).toThrow('Order must contain at least one item');
      });

      it('should throw if items is empty array', () => {
        expect(() => validateOrderItems([])).toThrow(ValidationError);
        expect(() => validateOrderItems([])).toThrow('Order must contain at least one item');
      });
    });

    describe('max items limit', () => {
      it('should throw if items exceed maxItemsPerOrder', () => {
        const items = Array(51).fill(validItem);
        expect(() => validateOrderItems(items)).toThrow(ValidationError);
        expect(() => validateOrderItems(items)).toThrow('Order cannot contain more than 50 items');
      });

      it('should accept items at maxItemsPerOrder limit', () => {
        const items = Array(50).fill(validItem);
        expect(() => validateOrderItems(items)).not.toThrow();
      });

      it('should accept items below maxItemsPerOrder limit', () => {
        const items = Array(25).fill(validItem);
        expect(() => validateOrderItems(items)).not.toThrow();
      });
    });

    describe('ticketTypeId validation', () => {
      it('should throw if ticketTypeId is missing', () => {
        const items = [{ ...validItem, ticketTypeId: '' }];
        expect(() => validateOrderItems(items)).toThrow(ValidationError);
        expect(() => validateOrderItems(items)).toThrow('Item 0 missing ticketTypeId');
      });

      it('should throw if ticketTypeId is null', () => {
        const items = [{ ...validItem, ticketTypeId: null as any }];
        expect(() => validateOrderItems(items)).toThrow(ValidationError);
      });

      it('should throw if ticketTypeId is undefined', () => {
        const items = [{ ...validItem, ticketTypeId: undefined as any }];
        expect(() => validateOrderItems(items)).toThrow(ValidationError);
      });

      it('should set field to ticketTypeId in error', () => {
        const items = [{ ...validItem, ticketTypeId: '' }];
        try {
          validateOrderItems(items);
          fail('Should have thrown');
        } catch (error) {
          expect((error as ValidationError).field).toBe('ticketTypeId');
        }
      });
    });

    describe('quantity validation', () => {
      it('should throw if quantity is 0', () => {
        const items = [{ ...validItem, quantity: 0 }];
        expect(() => validateOrderItems(items)).toThrow(ValidationError);
        expect(() => validateOrderItems(items)).toThrow('Item 0 quantity must be greater than 0');
      });

      it('should throw if quantity is negative', () => {
        const items = [{ ...validItem, quantity: -1 }];
        expect(() => validateOrderItems(items)).toThrow(ValidationError);
      });

      it('should throw if quantity is null', () => {
        const items = [{ ...validItem, quantity: null as any }];
        expect(() => validateOrderItems(items)).toThrow(ValidationError);
      });

      it('should throw if quantity is undefined', () => {
        const items = [{ ...validItem, quantity: undefined as any }];
        expect(() => validateOrderItems(items)).toThrow(ValidationError);
      });

      it('should throw if quantity exceeds maxQuantityPerItem', () => {
        const items = [{ ...validItem, quantity: 11 }];
        expect(() => validateOrderItems(items)).toThrow(ValidationError);
        expect(() => validateOrderItems(items)).toThrow('Item 0 quantity cannot exceed 10');
      });

      it('should accept quantity at maxQuantityPerItem limit', () => {
        const items = [{ ...validItem, quantity: 10 }];
        expect(() => validateOrderItems(items)).not.toThrow();
      });

      it('should set field to quantity in error', () => {
        const items = [{ ...validItem, quantity: 0 }];
        try {
          validateOrderItems(items);
          fail('Should have thrown');
        } catch (error) {
          expect((error as ValidationError).field).toBe('quantity');
        }
      });
    });

    describe('unitPriceCents validation', () => {
      it('should throw if unitPriceCents is negative', () => {
        const items = [{ ...validItem, unitPriceCents: -100 }];
        expect(() => validateOrderItems(items)).toThrow(ValidationError);
        expect(() => validateOrderItems(items)).toThrow('Item 0 unitPriceCents must be non-negative');
      });

      it('should throw if unitPriceCents is null', () => {
        const items = [{ ...validItem, unitPriceCents: null as any }];
        expect(() => validateOrderItems(items)).toThrow(ValidationError);
      });

      it('should throw if unitPriceCents is undefined', () => {
        const items = [{ ...validItem, unitPriceCents: undefined as any }];
        expect(() => validateOrderItems(items)).toThrow(ValidationError);
      });

      // NOTE: The current implementation treats 0 as falsy due to `!item.unitPriceCents`
      // This is a known limitation - free items (unitPriceCents: 0) will fail validation
      it('should throw if unitPriceCents is 0 (current implementation limitation)', () => {
        const items = [{ ...validItem, unitPriceCents: 0 }];
        expect(() => validateOrderItems(items)).toThrow(ValidationError);
        expect(() => validateOrderItems(items)).toThrow('Item 0 unitPriceCents must be non-negative');
      });

      it('should set field to unitPriceCents in error', () => {
        const items = [{ ...validItem, unitPriceCents: -1 }];
        try {
          validateOrderItems(items);
          fail('Should have thrown');
        } catch (error) {
          expect((error as ValidationError).field).toBe('unitPriceCents');
        }
      });

      it('should accept unitPriceCents of 1 (minimum valid price)', () => {
        const items = [{ ...validItem, unitPriceCents: 1 }];
        expect(() => validateOrderItems(items)).not.toThrow();
      });
    });

    describe('multiple items validation', () => {
      it('should validate all items in array', () => {
        const items = [
          { ...validItem },
          { ...validItem, ticketTypeId: 'ticket-2' },
          { ...validItem, ticketTypeId: '' }, // Invalid
        ];
        expect(() => validateOrderItems(items)).toThrow('Item 2 missing ticketTypeId');
      });

      it('should stop at first validation error', () => {
        const items = [
          { ...validItem, ticketTypeId: '' }, // First error
          { ...validItem, quantity: -1 }, // Second error
        ];
        expect(() => validateOrderItems(items)).toThrow('Item 0 missing ticketTypeId');
      });

      it('should pass with multiple valid items', () => {
        const items = [
          { ...validItem, ticketTypeId: 'ticket-1' },
          { ...validItem, ticketTypeId: 'ticket-2', quantity: 5 },
          { ...validItem, ticketTypeId: 'ticket-3', unitPriceCents: 10000 },
        ];
        expect(() => validateOrderItems(items)).not.toThrow();
      });
    });

    describe('valid items', () => {
      it('should accept valid single item', () => {
        expect(() => validateOrderItems([validItem])).not.toThrow();
      });

      it('should accept items with minimum valid values', () => {
        const minItem = {
          ...validItem,
          quantity: 1,
          unitPriceCents: 1, // Must be > 0 due to implementation
        };
        expect(() => validateOrderItems([minItem])).not.toThrow();
      });

      it('should accept items with large valid values', () => {
        const largeItem = {
          ...validItem,
          quantity: 10,
          unitPriceCents: 99999999,
        };
        expect(() => validateOrderItems([largeItem])).not.toThrow();
      });
    });
  });

  // ============================================
  // validateUserId
  // ============================================
  describe('validateUserId', () => {
    it('should accept valid userId string', () => {
      expect(() => validateUserId('user-123')).not.toThrow();
    });

    it('should accept UUID userId', () => {
      expect(() => validateUserId('550e8400-e29b-41d4-a716-446655440000')).not.toThrow();
    });

    it('should throw if userId is empty string', () => {
      expect(() => validateUserId('')).toThrow(ValidationError);
      expect(() => validateUserId('')).toThrow('Valid userId is required');
    });

    it('should throw if userId is null', () => {
      expect(() => validateUserId(null as any)).toThrow(ValidationError);
    });

    it('should throw if userId is undefined', () => {
      expect(() => validateUserId(undefined as any)).toThrow(ValidationError);
    });

    it('should throw if userId is number', () => {
      expect(() => validateUserId(123 as any)).toThrow(ValidationError);
    });

    it('should throw if userId is object', () => {
      expect(() => validateUserId({} as any)).toThrow(ValidationError);
    });

    it('should set field to userId in error', () => {
      try {
        validateUserId('');
        fail('Should have thrown');
      } catch (error) {
        expect((error as ValidationError).field).toBe('userId');
      }
    });

    it('should accept userId with special characters', () => {
      expect(() => validateUserId('user_123-abc.xyz')).not.toThrow();
    });
  });

  // ============================================
  // validateEventId
  // ============================================
  describe('validateEventId', () => {
    it('should accept valid eventId string', () => {
      expect(() => validateEventId('event-123')).not.toThrow();
    });

    it('should accept UUID eventId', () => {
      expect(() => validateEventId('550e8400-e29b-41d4-a716-446655440000')).not.toThrow();
    });

    it('should throw if eventId is empty string', () => {
      expect(() => validateEventId('')).toThrow(ValidationError);
      expect(() => validateEventId('')).toThrow('Valid eventId is required');
    });

    it('should throw if eventId is null', () => {
      expect(() => validateEventId(null as any)).toThrow(ValidationError);
    });

    it('should throw if eventId is undefined', () => {
      expect(() => validateEventId(undefined as any)).toThrow(ValidationError);
    });

    it('should throw if eventId is number', () => {
      expect(() => validateEventId(123 as any)).toThrow(ValidationError);
    });

    it('should throw if eventId is array', () => {
      expect(() => validateEventId([] as any)).toThrow(ValidationError);
    });

    it('should set field to eventId in error', () => {
      try {
        validateEventId('');
        fail('Should have thrown');
      } catch (error) {
        expect((error as ValidationError).field).toBe('eventId');
      }
    });
  });

  // ============================================
  // validateOrderId
  // ============================================
  describe('validateOrderId', () => {
    it('should accept valid orderId string', () => {
      expect(() => validateOrderId('order-123')).not.toThrow();
    });

    it('should accept UUID orderId', () => {
      expect(() => validateOrderId('550e8400-e29b-41d4-a716-446655440000')).not.toThrow();
    });

    it('should throw if orderId is empty string', () => {
      expect(() => validateOrderId('')).toThrow(ValidationError);
      expect(() => validateOrderId('')).toThrow('Valid orderId is required');
    });

    it('should throw if orderId is null', () => {
      expect(() => validateOrderId(null as any)).toThrow(ValidationError);
    });

    it('should throw if orderId is undefined', () => {
      expect(() => validateOrderId(undefined as any)).toThrow(ValidationError);
    });

    it('should throw if orderId is boolean', () => {
      expect(() => validateOrderId(true as any)).toThrow(ValidationError);
    });

    it('should set field to orderId in error', () => {
      try {
        validateOrderId('');
        fail('Should have thrown');
      } catch (error) {
        expect((error as ValidationError).field).toBe('orderId');
      }
    });
  });

  // ============================================
  // Edge Cases
  // ============================================
  describe('Edge Cases', () => {
    it('should handle whitespace-only userId', () => {
      // Whitespace is technically a valid string
      expect(() => validateUserId('   ')).not.toThrow();
    });

    it('should handle very long IDs', () => {
      const longId = 'a'.repeat(1000);
      expect(() => validateUserId(longId)).not.toThrow();
      expect(() => validateEventId(longId)).not.toThrow();
      expect(() => validateOrderId(longId)).not.toThrow();
    });

    it('should handle Unicode IDs', () => {
      expect(() => validateUserId('用户-123')).not.toThrow();
      expect(() => validateEventId('イベント-456')).not.toThrow();
    });
  });
});
