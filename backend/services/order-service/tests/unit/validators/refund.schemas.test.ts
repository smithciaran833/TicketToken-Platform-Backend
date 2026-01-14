import { partialRefundSchema, refundIdSchema } from '../../../src/validators/refund.schemas';

describe('Refund Schemas', () => {
  describe('partialRefundSchema', () => {
    const validRefund = {
      items: [
        {
          orderItemId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          quantity: 2,
          amountCents: 5000,
        },
      ],
      reason: 'Customer requested partial refund',
      notes: 'Processing partial refund for damaged items',
    };

    it('should validate a valid partial refund', () => {
      const { error } = partialRefundSchema.validate(validRefund);

      expect(error).toBeUndefined();
    });

    it('should require items array', () => {
      const refundWithoutItems = { ...validRefund };
      delete (refundWithoutItems as any).items;

      const { error } = partialRefundSchema.validate(refundWithoutItems);

      expect(error).toBeDefined();
      expect(error?.message).toContain('"items" is required');
    });

    it('should require at least one item', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        items: [],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('must contain at least 1 items');
    });

    it('should validate orderItemId as UUID', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        items: [
          {
            orderItemId: 'not-a-uuid',
            quantity: 1,
            amountCents: 5000,
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('must be a valid GUID');
    });

    it('should require orderItemId', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        items: [
          {
            quantity: 1,
            amountCents: 5000,
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('orderItemId');
      expect(error?.message).toContain('is required');
    });

    it('should require quantity', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        items: [
          {
            orderItemId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            amountCents: 5000,
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('quantity');
      expect(error?.message).toContain('is required');
    });

    it('should enforce minimum quantity of 1', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        items: [
          {
            orderItemId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            quantity: 0,
            amountCents: 5000,
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('must be greater than or equal to 1');
    });

    it('should require quantity to be an integer', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        items: [
          {
            orderItemId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            quantity: 1.5,
            amountCents: 5000,
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('must be an integer');
    });

    it('should require amountCents', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        items: [
          {
            orderItemId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            quantity: 1,
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('amountCents');
      expect(error?.message).toContain('is required');
    });

    it('should enforce minimum amountCents of 50', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        items: [
          {
            orderItemId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            quantity: 1,
            amountCents: 49,
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('must be greater than or equal to 50');
    });

    it('should accept amountCents of exactly 50', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        items: [
          {
            orderItemId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            quantity: 1,
            amountCents: 50,
          },
        ],
      });

      expect(error).toBeUndefined();
    });

    it('should require amountCents to be an integer', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        items: [
          {
            orderItemId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            quantity: 1,
            amountCents: 100.5,
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('must be an integer');
    });

    it('should require reason', () => {
      const refundWithoutReason = { ...validRefund };
      delete (refundWithoutReason as any).reason;

      const { error } = partialRefundSchema.validate(refundWithoutReason);

      expect(error).toBeDefined();
      expect(error?.message).toContain('"reason" is required');
    });

    it('should enforce minimum reason length of 10', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        reason: 'short',
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('length must be at least 10 characters');
    });

    it('should accept reason at minimum length', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        reason: 'a'.repeat(10),
      });

      expect(error).toBeUndefined();
    });

    it('should enforce maximum reason length of 500', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        reason: 'a'.repeat(501),
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('length must be less than or equal to 500');
    });

    it('should accept reason at maximum length', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        reason: 'a'.repeat(500),
      });

      expect(error).toBeUndefined();
    });

    it('should accept optional notes', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        notes: 'Additional information about the refund',
      });

      expect(error).toBeUndefined();
    });

    it('should accept refund without notes', () => {
      const refundWithoutNotes = { ...validRefund };
      delete (refundWithoutNotes as any).notes;

      const { error } = partialRefundSchema.validate(refundWithoutNotes);

      expect(error).toBeUndefined();
    });

    it('should enforce maximum notes length of 1000', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        notes: 'a'.repeat(1001),
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('length must be less than or equal to 1000');
    });

    it('should accept notes at maximum length', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        notes: 'a'.repeat(1000),
      });

      expect(error).toBeUndefined();
    });

    it('should accept multiple items', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        items: [
          {
            orderItemId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            quantity: 2,
            amountCents: 5000,
          },
          {
            orderItemId: 'b1ffcd99-9c0b-4ef8-bb6d-6bb9bd380a22',
            quantity: 1,
            amountCents: 3000,
          },
        ],
      });

      expect(error).toBeUndefined();
    });

    it('should validate all items in array', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        items: [
          {
            orderItemId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            quantity: 2,
            amountCents: 5000,
          },
          {
            orderItemId: 'invalid-uuid',
            quantity: 1,
            amountCents: 3000,
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('must be a valid GUID');
    });

    it('should reject empty notes string', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        notes: '',
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('is not allowed to be empty');
    });

    it('should reject negative quantity', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        items: [
          {
            orderItemId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            quantity: -1,
            amountCents: 5000,
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('must be greater than or equal to 1');
    });

    it('should reject negative amountCents', () => {
      const { error } = partialRefundSchema.validate({
        ...validRefund,
        items: [
          {
            orderItemId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            quantity: 1,
            amountCents: -100,
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('must be greater than or equal to 50');
    });
  });

  describe('refundIdSchema', () => {
    it('should validate valid refund ID', () => {
      const { error } = refundIdSchema.validate({
        refundId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      });

      expect(error).toBeUndefined();
    });

    it('should require refundId', () => {
      const { error } = refundIdSchema.validate({});

      expect(error).toBeDefined();
      expect(error?.message).toContain('"refundId" is required');
    });

    it('should validate refundId as UUID', () => {
      const { error } = refundIdSchema.validate({ refundId: 'not-a-uuid' });

      expect(error).toBeDefined();
      expect(error?.message).toContain('must be a valid GUID');
    });

    it('should reject empty refundId', () => {
      const { error } = refundIdSchema.validate({ refundId: '' });

      expect(error).toBeDefined();
      expect(error?.message).toMatch(/must be a valid GUID|is not allowed to be empty/);
    });

    it('should reject null refundId', () => {
      const { error } = refundIdSchema.validate({ refundId: null });

      expect(error).toBeDefined();
      expect(error?.message).toContain('must be a string');
    });
  });
});
