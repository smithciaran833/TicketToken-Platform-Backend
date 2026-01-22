/**
 * HMAC Types
 *
 * Type definitions for HMAC authentication module.
 */

/**
 * Configuration for HMAC authentication
 */
export interface HmacConfig {
  /** Shared secret for HMAC signing (min 32 characters) */
  secret: string;
  /** Service name of the calling service */
  serviceName: string;
  /** Replay window in milliseconds (default: 60000 = 60s) */
  replayWindowMs?: number;
  /** Whether to require body hash for requests with body */
  requireBodyHash?: boolean;
  /** Redis key prefix for nonce storage */
  nonceKeyPrefix?: string;
  /** Algorithm to use (default: sha256) */
  algorithm?: 'sha256' | 'sha384' | 'sha512';
}

/**
 * Default configuration values
 */
export const DEFAULT_HMAC_CONFIG: Required<Omit<HmacConfig, 'secret' | 'serviceName'>> = {
  replayWindowMs: 60000,
  requireBodyHash: true,
  nonceKeyPrefix: 'nonce:hmac',
  algorithm: 'sha256',
};

/**
 * Headers used in HMAC authentication
 */
export interface HmacHeaders {
  'x-internal-service': string;
  'x-internal-timestamp': string;
  'x-internal-nonce': string;
  'x-internal-signature': string;
  'x-internal-body-hash'?: string;
}

/**
 * All header names as constants
 */
export const HMAC_HEADER_NAMES = {
  SERVICE: 'x-internal-service',
  TIMESTAMP: 'x-internal-timestamp',
  NONCE: 'x-internal-nonce',
  SIGNATURE: 'x-internal-signature',
  BODY_HASH: 'x-internal-body-hash',
} as const;

/**
 * Result of HMAC validation
 */
export interface HmacValidationResult {
  valid: boolean;
  serviceName?: string;
  timestamp?: number;
  nonce?: string;
  error?: string;
  errorCode?: HmacErrorCode;
}

/**
 * Error codes for HMAC validation failures
 */
export type HmacErrorCode =
  | 'MISSING_HEADERS'
  | 'INVALID_TIMESTAMP'
  | 'TIMESTAMP_EXPIRED'
  | 'TIMESTAMP_FUTURE'
  | 'INVALID_NONCE'
  | 'NONCE_REUSED'
  | 'INVALID_SIGNATURE'
  | 'BODY_HASH_MISMATCH'
  | 'INTERNAL_ERROR';

/**
 * Payload components for signature generation
 */
export interface HmacPayloadComponents {
  serviceName: string;
  timestamp: number;
  nonce: string;
  method: string;
  path: string;
  bodyHash: string;
}
