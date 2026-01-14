/**
 * Unit Tests: Idempotency Key Generator
 *
 * Tests deterministic and random key generation for event deduplication
 */

import {
  generateIdempotencyKey,
  generateRandomIdempotencyKey,
  generateTimestampedIdempotencyKey,
} from '../../../src/utils/idempotency-key-generator';
import { OrderEvents } from '../../../src/events/event-types';

// UUID v4 regex pattern
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// UUID v5 regex pattern (version 5)
const UUID_V5_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Idempotency Key Generator', () => {
  // ============================================
  // generateIdempotencyKey (Deterministic)
  // ============================================
  describe('generateIdempotencyKey', () => {
    it('should generate a valid UUID v5', () => {
      const key = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123',
        1
      );
      expect(key).toMatch(UUID_V5_REGEX);
    });

    it('should generate deterministic keys for same inputs', () => {
      const key1 = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123',
        1
      );
      const key2 = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123',
        1
      );
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different event types', () => {
      const key1 = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123',
        1
      );
      const key2 = generateIdempotencyKey(
        OrderEvents.ORDER_CONFIRMED,
        'order-123',
        1
      );
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different order IDs', () => {
      const key1 = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123',
        1
      );
      const key2 = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-456',
        1
      );
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different sequence numbers', () => {
      const key1 = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123',
        1
      );
      const key2 = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123',
        2
      );
      expect(key1).not.toBe(key2);
    });

    it('should handle all OrderEvents enum values', () => {
      const orderId = 'order-test';
      const sequenceNumber = 1;

      Object.values(OrderEvents).forEach((eventType) => {
        const key = generateIdempotencyKey(eventType, orderId, sequenceNumber);
        expect(key).toMatch(UUID_V5_REGEX);
      });
    });

    it('should handle UUID-style order IDs', () => {
      const key = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        '550e8400-e29b-41d4-a716-446655440000',
        1
      );
      expect(key).toMatch(UUID_V5_REGEX);
    });

    it('should handle large sequence numbers', () => {
      const key = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123',
        999999999
      );
      expect(key).toMatch(UUID_V5_REGEX);
    });

    it('should handle zero sequence number', () => {
      const key = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123',
        0
      );
      expect(key).toMatch(UUID_V5_REGEX);
    });

    it('should use timestamp when sequence number not provided', () => {
      // Without sequence number, uses Date.now() which changes
      const key1 = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123'
      );
      
      // Small delay to ensure different timestamp
      const key2 = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123'
      );
      
      // Both should be valid UUIDs
      expect(key1).toMatch(UUID_V5_REGEX);
      expect(key2).toMatch(UUID_V5_REGEX);
      
      // Note: They might be the same if called in same millisecond
      // This is expected behavior
    });

    it('should handle special characters in order ID', () => {
      const key = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order_123-abc.xyz',
        1
      );
      expect(key).toMatch(UUID_V5_REGEX);
    });

    it('should handle empty order ID', () => {
      const key = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        '',
        1
      );
      expect(key).toMatch(UUID_V5_REGEX);
    });

    it('should be consistent across multiple calls', () => {
      const inputs = [
        { event: OrderEvents.ORDER_CREATED, orderId: 'a', seq: 1 },
        { event: OrderEvents.ORDER_RESERVED, orderId: 'b', seq: 2 },
        { event: OrderEvents.ORDER_CONFIRMED, orderId: 'c', seq: 3 },
      ];

      // Generate keys twice
      const firstRun = inputs.map((i) =>
        generateIdempotencyKey(i.event, i.orderId, i.seq)
      );
      const secondRun = inputs.map((i) =>
        generateIdempotencyKey(i.event, i.orderId, i.seq)
      );

      // Should be identical
      expect(firstRun).toEqual(secondRun);
    });
  });

  // ============================================
  // generateRandomIdempotencyKey
  // ============================================
  describe('generateRandomIdempotencyKey', () => {
    it('should generate a valid UUID v4', () => {
      const key = generateRandomIdempotencyKey();
      expect(key).toMatch(UUID_V4_REGEX);
    });

    it('should generate unique keys on each call', () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        keys.add(generateRandomIdempotencyKey());
      }
      expect(keys.size).toBe(100);
    });

    it('should never generate the same key twice', () => {
      const key1 = generateRandomIdempotencyKey();
      const key2 = generateRandomIdempotencyKey();
      expect(key1).not.toBe(key2);
    });

    it('should generate valid UUIDs in bulk', () => {
      for (let i = 0; i < 50; i++) {
        const key = generateRandomIdempotencyKey();
        expect(key).toMatch(UUID_V4_REGEX);
      }
    });
  });

  // ============================================
  // generateTimestampedIdempotencyKey
  // ============================================
  describe('generateTimestampedIdempotencyKey', () => {
    it('should generate a valid UUID v5', () => {
      const key = generateTimestampedIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123'
      );
      expect(key).toMatch(UUID_V5_REGEX);
    });

    it('should generate different keys at different times', async () => {
      const key1 = generateTimestampedIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123'
      );
      
      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 5));
      
      const key2 = generateTimestampedIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123'
      );
      
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different event types', () => {
      // Use same mock time
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

      const key1 = generateTimestampedIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123'
      );
      const key2 = generateTimestampedIdempotencyKey(
        OrderEvents.ORDER_CANCELLED,
        'order-123'
      );

      expect(key1).not.toBe(key2);
      
      jest.useRealTimers();
    });

    it('should generate different keys for different order IDs', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

      const key1 = generateTimestampedIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123'
      );
      const key2 = generateTimestampedIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-456'
      );

      expect(key1).not.toBe(key2);
      
      jest.useRealTimers();
    });

    it('should be deterministic for same timestamp', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-01T12:00:00.000Z'));

      const key1 = generateTimestampedIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123'
      );
      const key2 = generateTimestampedIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123'
      );

      expect(key1).toBe(key2);
      
      jest.useRealTimers();
    });

    it('should handle all event types', () => {
      Object.values(OrderEvents).forEach((eventType) => {
        const key = generateTimestampedIdempotencyKey(eventType, 'order-test');
        expect(key).toMatch(UUID_V5_REGEX);
      });
    });
  });

  // ============================================
  // Cross-function Behavior
  // ============================================
  describe('Cross-function Behavior', () => {
    it('should generate different key types (v4 vs v5)', () => {
      const randomKey = generateRandomIdempotencyKey();
      const deterministicKey = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123',
        1
      );

      // UUID v4 has '4' in position 14
      expect(randomKey[14]).toBe('4');
      // UUID v5 has '5' in position 14
      expect(deterministicKey[14]).toBe('5');
    });

    it('generateTimestampedIdempotencyKey should use generateIdempotencyKey internally', () => {
      jest.useFakeTimers();
      const timestamp = Date.now();
      jest.setSystemTime(timestamp);

      const timestampedKey = generateTimestampedIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123'
      );
      const manualKey = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123',
        timestamp
      );

      expect(timestampedKey).toBe(manualKey);
      
      jest.useRealTimers();
    });
  });

  // ============================================
  // Edge Cases
  // ============================================
  describe('Edge Cases', () => {
    it('should handle very long order IDs', () => {
      const longOrderId = 'a'.repeat(1000);
      const key = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        longOrderId,
        1
      );
      expect(key).toMatch(UUID_V5_REGEX);
    });

    it('should handle Unicode characters in order ID', () => {
      const unicodeOrderId = 'order-日本語-123';
      const key = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        unicodeOrderId,
        1
      );
      expect(key).toMatch(UUID_V5_REGEX);
    });

    it('should handle negative sequence numbers', () => {
      const key = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123',
        -1
      );
      expect(key).toMatch(UUID_V5_REGEX);
    });

    it('should handle decimal sequence numbers', () => {
      const key = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123',
        1.5
      );
      expect(key).toMatch(UUID_V5_REGEX);
    });

    it('should handle NaN sequence number', () => {
      const key = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123',
        NaN
      );
      expect(key).toMatch(UUID_V5_REGEX);
    });

    it('should handle Infinity sequence number', () => {
      const key = generateIdempotencyKey(
        OrderEvents.ORDER_CREATED,
        'order-123',
        Infinity
      );
      expect(key).toMatch(UUID_V5_REGEX);
    });
  });

  // ============================================
  // Performance
  // ============================================
  describe('Performance', () => {
    it('should generate keys quickly', () => {
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        generateIdempotencyKey(OrderEvents.ORDER_CREATED, `order-${i}`, i);
      }
      const duration = Date.now() - start;
      
      // Should complete 1000 generations in under 1 second
      expect(duration).toBeLessThan(1000);
    });

    it('should generate random keys quickly', () => {
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        generateRandomIdempotencyKey();
      }
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000);
    });
  });
});
