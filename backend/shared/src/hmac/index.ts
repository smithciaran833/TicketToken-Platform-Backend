/**
 * HMAC Authentication Module
 *
 * Provides HMAC-SHA256 authentication for service-to-service communication.
 *
 * Features:
 * - HMAC-SHA256 request signing and validation
 * - Replay attack prevention with Redis-backed nonce storage
 * - Timestamp validation with configurable window
 * - Timing-safe signature comparison
 * - Feature flag for gradual rollout
 *
 * Usage (Client/Signer):
 * ```typescript
 * import { HmacSigner, signRequest } from '@tickettoken/shared/hmac';
 *
 * // Using class
 * const signer = new HmacSigner({ serviceName: 'payment-service' });
 * const headers = signer.sign('POST', '/internal/payments', { amount: 100 });
 *
 * // Using convenience function
 * const headers = signRequest('POST', '/internal/payments', { amount: 100 });
 * ```
 *
 * Usage (Server/Validator):
 * ```typescript
 * import { HmacValidator, validateRequest } from '@tickettoken/shared/hmac';
 *
 * // Using class
 * const validator = new HmacValidator();
 * const result = await validator.validate(headers, 'POST', '/internal/payments', body);
 *
 * // Using convenience function
 * const result = await validateRequest(headers, 'POST', '/internal/payments', body);
 * ```
 *
 * Configuration (Environment Variables):
 * - USE_NEW_HMAC: Set to 'true' to enable HMAC authentication
 * - INTERNAL_HMAC_SECRET: Shared secret for signing (min 32 chars)
 * - SERVICE_NAME: Name of the current service
 * - HMAC_REPLAY_WINDOW_MS: Optional replay window (default: 60000ms)
 */

// Types
export {
  HmacConfig,
  HmacHeaders,
  HmacValidationResult,
  HmacPayloadComponents,
  HmacErrorCode,
  HMAC_HEADER_NAMES,
  DEFAULT_HMAC_CONFIG,
} from './types';

// Errors
export {
  HmacError,
  ReplayAttackError,
  TimestampError,
  SignatureError,
  MissingHeadersError,
} from './errors';

// Configuration
export {
  isHmacEnabled,
  getHmacSecret,
  getServiceName,
  validateConfig,
  createHmacConfig,
  getReplayWindowMs,
} from './config';

// Nonce Store
export {
  NonceStore,
  getNonceStore,
  createNonceStore,
} from './nonce-store';

// Signer (Client-side)
export {
  HmacSigner,
  getHmacSigner,
  createHmacSigner,
  signRequest,
} from './signer';

// Validator (Server-side)
export {
  HmacValidator,
  getHmacValidator,
  createHmacValidator,
  validateRequest,
  RequestHeaders,
} from './validator';
