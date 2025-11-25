// ============================================================================
// CORE UTILITIES
// ============================================================================

// Money utilities
export * from './utils/money';

// HTTP utilities
export { createAxiosInstance } from './http';

// Cache utilities
export { createCache } from './cache/src/index';

// ============================================================================
// SECURITY
// ============================================================================

// Audit logging (PHASE 0 - Secured)
export { AuditLogger } from '../security/audit-logger';

// Note: Framework-specific middleware (helmet, rate limiters, authenticate) removed
// Services should implement their own middleware using their chosen framework

// Audit service
export { AuditService, auditService, auditMiddleware } from './services/audit.service';

// PII Sanitizer utility
export { PIISanitizer } from './utils/pii-sanitizer';

// Input validation utilities (PHASE 1 - Critical Security)
export { InputValidator } from '../security/validators/input-validator';

// Cryptography utilities (PHASE 1 - Critical Security)
export { CryptoService } from '../security/utils/crypto-service';

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
