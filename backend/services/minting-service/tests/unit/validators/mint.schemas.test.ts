/**
 * Unit Tests for validators/mint.schemas.ts
 * 
 * Tests the internalMintSchema Zod validation schema.
 * Priority: 🟡 Medium (10+ tests)
 */

import { internalMintSchema, InternalMintRequest } from '../../../src/validators/mint.schemas';

// =============================================================================
// Test Data
// =============================================================================

const validUUID = '123e4567-e89b-12d3-a456-426614174000';
const validUUID2 = '123e4567-e89b-12d3-a456-426614174001';
const validUUID3 = '123e4567-e89b-12d3-a456-426614174002';

// =============================================================================
// internalMintSchema Tests
// =============================================================================

describe('internalMintSchema', () => {
  describe('ticketIds validation', () => {
    it('should require ticketIds array', () => {
      const missing = internalMintSchema.safeParse({
        eventId: validUUID,
        userId: validUUID,
        tenantId: validUUID
      });
      expect(missing.success).toBe(false);
    });

    it('should validate ticketIds as UUIDs', () => {
      const valid = internalMintSchema.safeParse({
        ticketIds: [validUUID, validUUID2],
        eventId: validUUID,
        userId: validUUID,
        tenantId: validUUID
      });
      expect(valid.success).toBe(true);

      const invalid = internalMintSchema.safeParse({
        ticketIds: ['not-a-uuid', validUUID],
        eventId: validUUID,
        userId: validUUID,
        tenantId: validUUID
      });
      expect(invalid.success).toBe(false);
    });

    it('should enforce min 1 ticketId', () => {
      const empty = internalMintSchema.safeParse({
        ticketIds: [],
        eventId: validUUID,
        userId: validUUID,
        tenantId: validUUID
      });
      expect(empty.success).toBe(false);
    });

    it('should enforce max 100 ticketIds', () => {
      const ticketIds = Array(101).fill(validUUID);
      
      const tooMany = internalMintSchema.safeParse({
        ticketIds,
        eventId: validUUID,
        userId: validUUID,
        tenantId: validUUID
      });
      expect(tooMany.success).toBe(false);

      const atLimit = internalMintSchema.safeParse({
        ticketIds: ticketIds.slice(0, 100),
        eventId: validUUID,
        userId: validUUID,
        tenantId: validUUID
      });
      expect(atLimit.success).toBe(true);
    });
  });

  describe('required fields validation', () => {
    it('should require eventId as UUID', () => {
      const valid = internalMintSchema.safeParse({
        ticketIds: [validUUID],
        eventId: validUUID,
        userId: validUUID,
        tenantId: validUUID
      });
      expect(valid.success).toBe(true);

      const invalid = internalMintSchema.safeParse({
        ticketIds: [validUUID],
        eventId: 'not-a-uuid',
        userId: validUUID,
        tenantId: validUUID
      });
      expect(invalid.success).toBe(false);

      const missing = internalMintSchema.safeParse({
        ticketIds: [validUUID],
        userId: validUUID,
        tenantId: validUUID
      });
      expect(missing.success).toBe(false);
    });

    it('should require userId as UUID', () => {
      const valid = internalMintSchema.safeParse({
        ticketIds: [validUUID],
        eventId: validUUID,
        userId: validUUID,
        tenantId: validUUID
      });
      expect(valid.success).toBe(true);

      const invalid = internalMintSchema.safeParse({
        ticketIds: [validUUID],
        eventId: validUUID,
        userId: 'not-a-uuid',
        tenantId: validUUID
      });
      expect(invalid.success).toBe(false);

      const missing = internalMintSchema.safeParse({
        ticketIds: [validUUID],
        eventId: validUUID,
        tenantId: validUUID
      });
      expect(missing.success).toBe(false);
    });

    it('should require tenantId as UUID', () => {
      const valid = internalMintSchema.safeParse({
        ticketIds: [validUUID],
        eventId: validUUID,
        userId: validUUID,
        tenantId: validUUID
      });
      expect(valid.success).toBe(true);

      const invalid = internalMintSchema.safeParse({
        ticketIds: [validUUID],
        eventId: validUUID,
        userId: validUUID,
        tenantId: 'not-a-uuid'
      });
      expect(invalid.success).toBe(false);

      const missing = internalMintSchema.safeParse({
        ticketIds: [validUUID],
        eventId: validUUID,
        userId: validUUID
      });
      expect(missing.success).toBe(false);
    });
  });

  describe('optional fields validation', () => {
    it('should accept optional queue boolean', () => {
      const withQueue = internalMintSchema.safeParse({
        ticketIds: [validUUID],
        eventId: validUUID,
        userId: validUUID,
        tenantId: validUUID,
        queue: true
      });
      expect(withQueue.success).toBe(true);
      if (withQueue.success) {
        expect(withQueue.data.queue).toBe(true);
      }

      const withQueueFalse = internalMintSchema.safeParse({
        ticketIds: [validUUID],
        eventId: validUUID,
        userId: validUUID,
        tenantId: validUUID,
        queue: false
      });
      expect(withQueueFalse.success).toBe(true);

      const withoutQueue = internalMintSchema.safeParse({
        ticketIds: [validUUID],
        eventId: validUUID,
        userId: validUUID,
        tenantId: validUUID
      });
      expect(withoutQueue.success).toBe(true);
      if (withoutQueue.success) {
        expect(withoutQueue.data.queue).toBeUndefined();
      }
    });

    it('should accept optional orderId as UUID', () => {
      const withOrderId = internalMintSchema.safeParse({
        ticketIds: [validUUID],
        eventId: validUUID,
        userId: validUUID,
        tenantId: validUUID,
        orderId: validUUID2
      });
      expect(withOrderId.success).toBe(true);
      if (withOrderId.success) {
        expect(withOrderId.data.orderId).toBe(validUUID2);
      }

      const withoutOrderId = internalMintSchema.safeParse({
        ticketIds: [validUUID],
        eventId: validUUID,
        userId: validUUID,
        tenantId: validUUID
      });
      expect(withoutOrderId.success).toBe(true);

      const invalidOrderId = internalMintSchema.safeParse({
        ticketIds: [validUUID],
        eventId: validUUID,
        userId: validUUID,
        tenantId: validUUID,
        orderId: 'not-a-uuid'
      });
      expect(invalidOrderId.success).toBe(false);
    });
  });

  describe('complete request validation', () => {
    it('should accept valid complete request', () => {
      const completeRequest = internalMintSchema.safeParse({
        ticketIds: [validUUID, validUUID2, validUUID3],
        eventId: validUUID,
        userId: validUUID,
        tenantId: validUUID,
        queue: true,
        orderId: validUUID2
      });
      
      expect(completeRequest.success).toBe(true);
      if (completeRequest.success) {
        expect(completeRequest.data.ticketIds).toHaveLength(3);
        expect(completeRequest.data.eventId).toBe(validUUID);
        expect(completeRequest.data.userId).toBe(validUUID);
        expect(completeRequest.data.tenantId).toBe(validUUID);
        expect(completeRequest.data.queue).toBe(true);
        expect(completeRequest.data.orderId).toBe(validUUID2);
      }
    });

    it('should reject null values', () => {
      const nullRequest = internalMintSchema.safeParse(null);
      expect(nullRequest.success).toBe(false);
    });

    it('should reject empty object', () => {
      const emptyRequest = internalMintSchema.safeParse({});
      expect(emptyRequest.success).toBe(false);
    });
  });

  describe('type inference', () => {
    it('should correctly infer InternalMintRequest type', () => {
      const validRequest: InternalMintRequest = {
        ticketIds: [validUUID],
        eventId: validUUID,
        userId: validUUID,
        tenantId: validUUID
      };

      const parsed = internalMintSchema.parse(validRequest);
      expect(parsed).toEqual(validRequest);
    });
  });
});
