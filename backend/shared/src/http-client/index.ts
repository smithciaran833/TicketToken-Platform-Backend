/**
 * HTTP Client Module
 * 
 * Provides standardized HTTP client infrastructure for service-to-service
 * communication with circuit breaker, retry logic, and distributed tracing.
 * 
 * Usage:
 * ```typescript
 * import { BaseServiceClient, RequestContext, withRetry } from '@tickettoken/shared/http-client';
 * ```
 */

// Circuit breaker
export {
  CircuitBreaker,
  CircuitState,
  CircuitBreakerOptions,
  CircuitBreakerStats,
  CircuitOpenError,
  TimeoutError,
  createDefaultCircuitBreaker,
} from './circuit-breaker';

// Retry utilities
export {
  RetryOptions,
  RetryContext,
  withRetry,
  makeRetryable,
  Retryable,
  calculateDelay,
  RetryPresets,
} from './retry';

// Base service client
export {
  BaseServiceClient,
  ServiceClientConfig,
  RequestContext,
  ServiceResponse,
  ServiceClientError,
  createRequestContext,
  extractRequestContext,
} from './base-service-client';
