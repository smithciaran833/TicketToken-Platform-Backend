// ============================================================================
// CORE UTILITIES
// ============================================================================

// Money utilities
export * from './utils/money';

// HTTP utilities
export { createAxiosInstance } from './http';

// Cache utilities
export { createCache } from './cache/src/index';

// Redis utilities (PHASE 1 - Complete Redis Implementation)
export * from './redis';

// MongoDB utilities
export * from '../mongodb/src';

// Content Reviews - Services only (types already exported by MongoDB)
export { ReviewService, RatingService, ModerationService } from '../content-reviews/src';

// ============================================================================
// SECURITY
// ============================================================================

// Audit logging (PHASE 0 - Secured)

// Note: Framework-specific middleware (helmet, rate limiters, authenticate) removed
// Services should implement their own middleware using their chosen framework

// Audit service
export { AuditService, auditService, auditMiddleware } from './services/audit.service';

// PII Sanitizer utility
export { PIISanitizer } from './utils/pii-sanitizer';

// Input validation utilities (PHASE 1 - Critical Security)

// Cryptography utilities (PHASE 1 - Critical Security)

// ============================================================================
// DISTRIBUTED SYSTEMS
// ============================================================================

// Lock errors
export {
  LockTimeoutError,
  LockContentionError,
  LockSystemError,
  USER_FACING_MESSAGES,
  getLockErrorMessage,
  isLockError,
} from './errors/lock-errors';

// Distributed lock utilities
export {
  withLock,
  withLockRetry,
  tryLock,
  acquireLock,
  releaseLock,
  extendLock,
  LockKeys,
  LockMetrics,
  redlock,
  lockRedisClient,
} from './utils/distributed-lock';

// ============================================================================
// MESSAGING & QUEUES
// ============================================================================

// Message queue configuration
export { QUEUES } from './mq/queues';

// Search sync publisher
export { publishSearchSync, closeSearchSync } from './publishers/searchSyncPublisher';

// ============================================================================
// SECRETS MANAGEMENT
// ============================================================================
// Secrets manager for AWS Secrets Manager / .env fallback
export { secretsManager, SecretsManager } from '../utils/secrets-manager';

// Secrets configuration mapping
export { SECRETS_CONFIG } from '../config/secrets.config';
export type { SecretKey } from '../config/secrets.config';

// ============================================================================
// BLOCKCHAIN CLIENT
// ============================================================================

// Blockchain client for interacting with TicketToken smart contract
export { BlockchainClient } from './blockchain/client';

// Blockchain types
export type {
  BlockchainConfig,
  CreateEventParams,
  CreateEventResult,
  RegisterTicketParams,
  RegisterTicketResult,
  TransferTicketParams,
  VerifyTicketParams,
  RoyaltyInfo,
  TicketInfo,
  EventInfo,
} from './blockchain/types';

// Blockchain errors
export {
  BlockchainError,
  TransactionError,
  AccountNotFoundError,
  ConfigurationError,
  TicketAlreadyUsedError,
  InvalidRoyaltyError,
} from './blockchain/types';

// PDA derivation helpers
export {
  derivePlatformPDA,
  deriveVenuePDA,
  deriveEventPDA,
  deriveTicketPDA,
  deriveReentrancyGuardPDA,
  deriveListingReentrancyGuardPDA,
  toBase58,
  fromBase58,
} from './blockchain/pda';
