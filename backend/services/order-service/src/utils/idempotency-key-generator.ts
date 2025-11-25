import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { OrderEvents } from '../events/event-types';

// Namespace UUID for order events (generated once)
const ORDER_EVENT_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/**
 * Generate a deterministic idempotency key for an event
 * This allows the same event (same order + event type + sequence) to have the same key
 */
export function generateIdempotencyKey(
  eventType: OrderEvents,
  orderId: string,
  sequenceNumber?: number
): string {
  // Create a deterministic string to hash
  const data = `${eventType}:${orderId}:${sequenceNumber || Date.now()}`;
  
  // Generate UUID v5 (deterministic) from the data
  return uuidv5(data, ORDER_EVENT_NAMESPACE);
}

/**
 * Generate a random idempotency key (non-deterministic)
 * Use this when you want a truly unique key every time
 */
export function generateRandomIdempotencyKey(): string {
  return uuidv4();
}

/**
 * Generate idempotency key for event with timestamp
 */
export function generateTimestampedIdempotencyKey(
  eventType: OrderEvents,
  orderId: string
): string {
  const timestamp = Date.now();
  return generateIdempotencyKey(eventType, orderId, timestamp);
}
