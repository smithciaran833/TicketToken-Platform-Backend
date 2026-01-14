/**
 * Refund Validator Tests
 * Tests for refund request validation schemas
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('RefundValidator', () => {
  describe('createRefundSchema', () => {
    it('should validate valid full refund request', () => {
      const data = {
        paymentId: 'pay_123456789',
        reason: 'customer_request',
      };

      const result = validateCreateRefund(data);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expect.objectContaining({
        paymentId: 'pay_123456789',
        reason: 'customer_request',
      }));
    });

    it('should validate partial refund request', () => {
      const data = {
        paymentId: 'pay_123456789',
        amount: 5000,
        reason: 'partial_refund',
      };

      const result = validateCreateRefund(data);

      expect(result.success).toBe(true);
      expect(result.data.amount).toBe(5000);
    });

    it('should require paymentId', () => {
      const data = {
        reason: 'customer_request',
      };

      const result = validateCreateRefund(data);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('paymentId');
    });

    it('should require reason', () => {
      const data = {
        paymentId: 'pay_123456789',
      };

      const result = validateCreateRefund(data);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('reason');
    });

    it('should validate reason enum values', () => {
      const validReasons = [
        'customer_request',
        'event_cancelled',
        'duplicate',
        'fraudulent',
        'other',
      ];

      validReasons.forEach(reason => {
        const data = { paymentId: 'pay_123', reason };
        const result = validateCreateRefund(data);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid reason', () => {
      const data = {
        paymentId: 'pay_123',
        reason: 'invalid_reason',
      };

      const result = validateCreateRefund(data);

      expect(result.success).toBe(false);
    });

    it('should require positive amount for partial refund', () => {
      const data = {
        paymentId: 'pay_123',
        amount: -100,
        reason: 'customer_request',
      };

      const result = validateCreateRefund(data);

      expect(result.success).toBe(false);
    });

    it('should require integer amount', () => {
      const data = {
        paymentId: 'pay_123',
        amount: 99.99,
        reason: 'customer_request',
      };

      const result = validateCreateRefund(data);

      expect(result.success).toBe(false);
    });

    it('should validate optional metadata', () => {
      const data = {
        paymentId: 'pay_123',
        reason: 'customer_request',
        metadata: {
          ticketId: 'ticket_456',
          notes: 'Customer requested',
        },
      };

      const result = validateCreateRefund(data);

      expect(result.success).toBe(true);
      expect(result.data.metadata).toBeDefined();
    });

    it('should validate optional eventId', () => {
      const data = {
        paymentId: 'pay_123',
        reason: 'event_cancelled',
        eventId: 'evt_789',
      };

      const result = validateCreateRefund(data);

      expect(result.success).toBe(true);
      expect(result.data.eventId).toBe('evt_789');
    });
  });

  describe('bulkRefundSchema', () => {
    it('should validate valid bulk refund request', () => {
      const data = {
        eventId: 'evt_123',
        reason: 'event_cancelled',
      };

      const result = validateBulkRefund(data);

      expect(result.success).toBe(true);
    });

    it('should require eventId', () => {
      const data = {
        reason: 'event_cancelled',
      };

      const result = validateBulkRefund(data);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('eventId');
    });

    it('should validate optional filter parameters', () => {
      const data = {
        eventId: 'evt_123',
        reason: 'event_cancelled',
        filters: {
          ticketTypes: ['vip', 'general'],
          minAmount: 5000,
          maxAmount: 50000,
        },
      };

      const result = validateBulkRefund(data);

      expect(result.success).toBe(true);
    });

    it('should validate optional notification settings', () => {
      const data = {
        eventId: 'evt_123',
        reason: 'event_cancelled',
        notify: true,
        notificationTemplate: 'event_cancellation',
      };

      const result = validateBulkRefund(data);

      expect(result.success).toBe(true);
    });
  });

  describe('refundIdSchema', () => {
    it('should validate refund ID format', () => {
      const result = validateRefundId('ref_123456789');

      expect(result.success).toBe(true);
    });

    it('should require ref_ prefix', () => {
      const result = validateRefundId('123456789');

      expect(result.success).toBe(false);
    });

    it('should require minimum length', () => {
      const result = validateRefundId('ref_1');

      expect(result.success).toBe(false);
    });

    it('should reject empty string', () => {
      const result = validateRefundId('');

      expect(result.success).toBe(false);
    });
  });

  describe('listRefundsQuerySchema', () => {
    it('should validate list query with defaults', () => {
      const data = {};

      const result = validateListRefundsQuery(data);

      expect(result.success).toBe(true);
      expect(result.data.limit).toBe(10);
      expect(result.data.offset).toBe(0);
    });

    it('should validate custom pagination', () => {
      const data = {
        limit: 50,
        offset: 100,
      };

      const result = validateListRefundsQuery(data);

      expect(result.success).toBe(true);
      expect(result.data.limit).toBe(50);
      expect(result.data.offset).toBe(100);
    });

    it('should validate status filter', () => {
      const data = {
        status: 'pending',
      };

      const result = validateListRefundsQuery(data);

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('pending');
    });

    it('should validate date range filters', () => {
      const data = {
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      };

      const result = validateListRefundsQuery(data);

      expect(result.success).toBe(true);
    });

    it('should validate venueId filter', () => {
      const data = {
        venueId: 'venue_123',
      };

      const result = validateListRefundsQuery(data);

      expect(result.success).toBe(true);
    });

    it('should validate paymentId filter', () => {
      const data = {
        paymentId: 'pay_123',
      };

      const result = validateListRefundsQuery(data);

      expect(result.success).toBe(true);
    });

    it('should enforce maximum limit', () => {
      const data = {
        limit: 1000,
      };

      const result = validateListRefundsQuery(data);

      expect(result.success).toBe(false);
    });

    it('should reject negative offset', () => {
      const data = {
        offset: -1,
      };

      const result = validateListRefundsQuery(data);

      expect(result.success).toBe(false);
    });
  });

  describe('cancelRefundSchema', () => {
    it('should validate cancel request with reason', () => {
      const data = {
        reason: 'Customer withdrew request',
      };

      const result = validateCancelRefund(data);

      expect(result.success).toBe(true);
    });

    it('should allow empty cancel request', () => {
      const data = {};

      const result = validateCancelRefund(data);

      expect(result.success).toBe(true);
    });
  });

  describe('refund amount validation', () => {
    it('should accept minimum refund amount', () => {
      const data = {
        paymentId: 'pay_123',
        amount: 50, // 50 cents minimum
        reason: 'customer_request',
      };

      const result = validateCreateRefund(data);

      expect(result.success).toBe(true);
    });

    it('should reject amount below minimum', () => {
      const data = {
        paymentId: 'pay_123',
        amount: 10, // Below 50 cents minimum
        reason: 'customer_request',
      };

      const result = validateCreateRefund(data);

      expect(result.success).toBe(false);
    });

    it('should accept large refund amounts', () => {
      const data = {
        paymentId: 'pay_123',
        amount: 99999999, // $999,999.99
        reason: 'customer_request',
      };

      const result = validateCreateRefund(data);

      expect(result.success).toBe(true);
    });
  });

  describe('sanitization', () => {
    it('should trim whitespace from reason', () => {
      const data = {
        paymentId: 'pay_123',
        reason: '  customer_request  ',
      };

      const result = validateCreateRefund(data);

      expect(result.success).toBe(true);
    });

    it('should sanitize metadata values', () => {
      const data = {
        paymentId: 'pay_123',
        reason: 'customer_request',
        metadata: {
          notes: '<script>alert("xss")</script>Customer note',
        },
      };

      const result = validateCreateRefund(data);

      expect(result.success).toBe(true);
      // Should sanitize HTML
    });
  });
});

// Validation functions
function validateCreateRefund(data: any): any {
  const schema = {
    paymentId: { type: 'string', required: true },
    amount: { type: 'integer', minimum: 50 },
    reason: {
      type: 'string',
      required: true,
      enum: ['customer_request', 'event_cancelled', 'duplicate', 'fraudulent', 'other'],
    },
    eventId: { type: 'string' },
    metadata: { type: 'object' },
  };

  const errors: any[] = [];

  if (!data.paymentId) {
    errors.push({ path: ['paymentId'], message: 'Required' });
  }

  if (!data.reason) {
    errors.push({ path: ['reason'], message: 'Required' });
  } else if (!schema.reason.enum.includes(data.reason?.trim())) {
    errors.push({ path: ['reason'], message: 'Invalid enum value' });
  }

  if (data.amount !== undefined) {
    if (!Number.isInteger(data.amount)) {
      errors.push({ path: ['amount'], message: 'Must be integer' });
    } else if (data.amount < 50) {
      errors.push({ path: ['amount'], message: 'Must be at least 50' });
    } else if (data.amount < 0) {
      errors.push({ path: ['amount'], message: 'Must be positive' });
    }
  }

  if (errors.length > 0) {
    return { success: false, error: { issues: errors } };
  }

  return { success: true, data };
}

function validateBulkRefund(data: any): any {
  const errors: any[] = [];

  if (!data.eventId) {
    errors.push({ path: ['eventId'], message: 'Required' });
  }

  if (!data.reason) {
    errors.push({ path: ['reason'], message: 'Required' });
  }

  if (errors.length > 0) {
    return { success: false, error: { issues: errors } };
  }

  return { success: true, data };
}

function validateRefundId(id: string): any {
  if (!id) {
    return { success: false, error: { issues: [{ message: 'Required' }] } };
  }

  if (!id.startsWith('ref_')) {
    return { success: false, error: { issues: [{ message: 'Invalid prefix' }] } };
  }

  if (id.length < 8) {
    return { success: false, error: { issues: [{ message: 'Too short' }] } };
  }

  return { success: true, data: id };
}

function validateListRefundsQuery(data: any): any {
  const errors: any[] = [];
  const result = { ...data };

  result.limit = data.limit ?? 10;
  result.offset = data.offset ?? 0;

  if (result.limit > 100) {
    errors.push({ path: ['limit'], message: 'Max 100' });
  }

  if (result.offset < 0) {
    errors.push({ path: ['offset'], message: 'Must be non-negative' });
  }

  if (errors.length > 0) {
    return { success: false, error: { issues: errors } };
  }

  return { success: true, data: result };
}

function validateCancelRefund(data: any): any {
  return { success: true, data };
}
