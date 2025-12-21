/**
 * Redis Key Builder
 * 
 * Type-safe key generation utility that maintains consistent naming
 * conventions across the application. Supports existing key patterns
 * for backwards compatibility.
 */

import { DEFAULT_KEY_PREFIXES } from '../config';

/**
 * Key Builder Class
 * 
 * Provides type-safe methods for building Redis keys with consistent
 * naming conventions.
 */
export class KeyBuilder {
  private prefixes: typeof DEFAULT_KEY_PREFIXES;
  
  constructor(prefixes: typeof DEFAULT_KEY_PREFIXES = DEFAULT_KEY_PREFIXES) {
    this.prefixes = prefixes;
  }
  
  /**
   * Build a generic key from parts
   */
  public build(...parts: (string | number)[]): string {
    return parts.filter(p => p !== undefined && p !== null).join(':');
  }
  
  /**
   * Session keys
   */
  public session(sessionId: string): string {
    return `${this.prefixes.session}${sessionId}`;
  }
  
  public userSessions(userId: string): string {
    return `${this.prefixes.userSessions}${userId}`;
  }
  
  public sessionSummary(sessionId: string): string {
    return `session:summary:${sessionId}`;
  }
  
  /**
   * Authentication keys
   */
  public refreshToken(token: string): string {
    return `${this.prefixes.refreshToken}${token}`;
  }
  
  public failedAuth(identifier: string): string {
    return `${this.prefixes.failedAuth}${identifier}`;
  }
  
  public authLock(identifier: string): string {
    return `${this.prefixes.authLock}${identifier}`;
  }
  
  /**
   * Rate limiting keys
   */
  public rateLimit(type: string, identifier: string): string {
    return `${this.prefixes.rateLimit}${type}:${identifier}`;
  }
  
  public rateLimitTicket(userId: string, eventId: string): string {
    return `${this.prefixes.rateLimitTicket}${userId}:${eventId}`;
  }
  
  public rateLimitIP(ip: string): string {
    return `${this.prefixes.rateLimitIP}${ip}`;
  }
  
  public rateLimitUser(userId: string): string {
    return `${this.prefixes.rateLimit}user:${userId}`;
  }
  
  public rateLimitApi(apiKey: string): string {
    return `${this.prefixes.rateLimit}api:${apiKey}`;
  }
  
  /**
   * Cache keys
   */
  public cache(type: string, id: string): string {
    return `${this.prefixes.cache}${type}:${id}`;
  }
  
  public cacheEvent(eventId: string): string {
    return `${this.prefixes.cache}event:${eventId}`;
  }
  
  public cacheVenue(venueId: string): string {
    return `${this.prefixes.cache}venue:${venueId}`;
  }
  
  public cacheTicket(ticketId: string): string {
    return `${this.prefixes.cache}ticket:${ticketId}`;
  }
  
  public cacheUser(userId: string): string {
    return `${this.prefixes.cache}user:${userId}`;
  }
  
  /**
   * Lock keys
   */
  public lock(resource: string): string {
    return `${this.prefixes.lock}${resource}`;
  }
  
  public queueLock(queueName: string): string {
    return `${this.prefixes.queueLock}${queueName}`;
  }
  
  /**
   * Infrastructure keys
   */
  public circuitBreaker(service: string): string {
    return `${this.prefixes.circuitBreaker}${service}`;
  }
  
  public serviceDiscovery(service: string): string {
    return `${this.prefixes.serviceDiscovery}${service}`;
  }
  
  public health(service: string): string {
    return `${this.prefixes.health}${service}`;
  }
  
  public apiKey(key: string): string {
    return `${this.prefixes.apiKey}${key}`;
  }
  
  public idempotency(key: string): string {
    return `${this.prefixes.idempotency}${key}`;
  }
  
  /**
   * Analytics keys (matches analytics-service patterns)
   */
  public analytics(type: string, ...parts: string[]): string {
    return `${this.prefixes.analytics}${type}:${parts.join(':')}`;
  }
  
  public realtime(venueId: string, metricType: string): string {
    return `${this.prefixes.realtime}${venueId}:${metricType}`;
  }
  
  public realtimeData(venueId: string, metricType: string): string {
    return `realtime:data:${venueId}:${metricType}`;
  }
  
  public counter(venueId: string, counterType: string): string {
    return `${this.prefixes.counter}${venueId}:${counterType}`;
  }
  
  public gauge(venueId: string, gaugeName: string): string {
    return `${this.prefixes.gauge}${venueId}:${gaugeName}`;
  }
  
  /**
   * Pub/Sub channels (not stored as keys, but for consistency)
   */
  public channel(type: string, ...parts: string[]): string {
    return `${type}:${parts.join(':')}`;
  }
  
  public metricsChannel(venueId: string, metricType: string): string {
    return `metrics:${venueId}:${metricType}`;
  }
  
  /**
   * Pattern builders for scanning
   */
  public pattern = {
    allSessions: (): string => `${this.prefixes.session}*`,
    userSessions: (userId: string): string => `${this.prefixes.userSessions}${userId}`,
    allCache: (): string => `${this.prefixes.cache}*`,
    cacheByType: (type: string): string => `${this.prefixes.cache}${type}:*`,
    allLocks: (): string => `${this.prefixes.lock}*`,
    rateLimitByType: (type: string): string => `${this.prefixes.rateLimit}${type}:*`,
    analyticsBy: (type: string): string => `${this.prefixes.analytics}${type}:*`,
  };
}

/**
 * Default key builder instance
 */
let defaultKeyBuilder: KeyBuilder | null = null;

/**
 * Get the default key builder
 */
export function getKeyBuilder(): KeyBuilder {
  if (!defaultKeyBuilder) {
    defaultKeyBuilder = new KeyBuilder();
  }
  return defaultKeyBuilder;
}

/**
 * Create a new key builder with custom prefixes
 */
export function createKeyBuilder(prefixes?: typeof DEFAULT_KEY_PREFIXES): KeyBuilder {
  return new KeyBuilder(prefixes);
}

/**
 * Convenience function to build a key
 */
export function buildKey(...parts: (string | number)[]): string {
  return getKeyBuilder().build(...parts);
}
