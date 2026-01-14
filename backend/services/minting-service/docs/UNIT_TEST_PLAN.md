# Minting Service - Unit Test Plan

**Last Updated:** January 13, 2026  
**Status:** Planning Phase  
**Total Unit Tests:** ~583  

---

## Overview

This document serves as the source of truth for unit tests in the minting-service. Tests are organized by folder structure and can be checked off as they are implemented.

### Test Status Legend
- `[ ]` - Not implemented
- `[x]` - Implemented
- `[~]` - Partially implemented
- `[!]` - Blocked/Needs investigation

### Priority Legend
- 🔴 **Critical** - Security-related, must have
- 🟠 **High** - Core functionality
- 🟡 **Medium** - Important utilities
- 🟢 **Low** - Nice to have

---

## Test Summary by Folder

| Folder | File Count | Test Count | Status |
|--------|-----------|------------|--------|
| `errors/` | 1 | 173 | [x] |
| `utils/` | 8 | 113 | [x] |
| `models/` | 3 | 50 | [x] |
| `schemas/` | 1 | 40 | [x] |
| `validators/` | 1 | 6 | [x] |
| `middleware/` | 7 | 83 | [x] |
| `queues/` | 1 | 68 | [x] |
| `workers/` | 1 | 10 | [x] |
| `services/` | 11 | 145 | [x] |
| `config/` | 6 | 49 | [x] |
| `jobs/` | 1 | 10 | [x] |
| `index.ts` | 1 | 15 | [x] |
| **TOTAL** | **42** | **~608** | **100%** |

---

## 1. errors/

### errors/index.ts (173 tests) 🔴 Critical ✅ COMPLETE

**ErrorCode Enum Tests:**
- [x] ErrorCode enum should have unique values
- [x] ErrorCode enum should include MINT_FAILED
- [x] ErrorCode enum should include MINT_DUPLICATE
- [x] ErrorCode enum should include MINT_IN_PROGRESS
- [x] ErrorCode enum should include MINT_NOT_FOUND
- [x] ErrorCode enum should include MINT_ALREADY_COMPLETED
- [x] ErrorCode enum should include SOLANA_RPC_ERROR
- [x] ErrorCode enum should include SOLANA_TIMEOUT
- [x] ErrorCode enum should include SOLANA_INSUFFICIENT_FUNDS
- [x] ErrorCode enum should include SOLANA_BLOCKHASH_EXPIRED
- [x] ErrorCode enum should include IPFS_UPLOAD_FAILED
- [x] ErrorCode enum should include IPFS_TIMEOUT
- [x] ErrorCode enum should include IPFS_CID_VERIFICATION_FAILED
- [x] ErrorCode enum should include TENANT_NOT_FOUND
- [x] ErrorCode enum should include TENANT_MISMATCH
- [x] ErrorCode enum should include TENANT_CONTEXT_MISSING
- [x] ErrorCode enum should include RATE_LIMITED
- [x] ErrorCode enum should include RATE_LIMIT_TENANT
- [x] ErrorCode enum should include RATE_LIMIT_GLOBAL
- [x] ErrorCode enum should include VALIDATION_FAILED
- [x] ErrorCode enum should include VALIDATION_MISSING_FIELD
- [x] ErrorCode enum should include UNAUTHORIZED
- [x] ErrorCode enum should include FORBIDDEN
- [x] ErrorCode enum should include TOKEN_INVALID
- [x] ErrorCode enum should include TOKEN_EXPIRED

**BaseError Tests:**
- [x] BaseError should set name property to class name
- [x] BaseError should set message property
- [x] BaseError should set statusCode property
- [x] BaseError should default statusCode to 500
- [x] BaseError should set code property
- [x] BaseError should set isOperational property (default true)
- [x] BaseError should allow setting isOperational to false
- [x] BaseError should capture stack trace
- [x] BaseError should accept context object
- [x] BaseError should set timestamp
- [x] BaseError.toJSON should serialize all properties
- [x] BaseError.toJSON should include stack trace
- [x] BaseError.toJSON should include timestamp as ISO string
- [x] BaseError should be instance of Error
- [x] BaseError should be instance of BaseError

**MintingError Tests:**
- [x] MintingError should extend BaseError
- [x] MintingError should set name to MintingError
- [x] MintingError should have default statusCode 500
- [x] MintingError should have default code MINT_FAILED
- [x] MintingError should accept custom code
- [x] MintingError should accept custom statusCode
- [x] MintingError should accept context
- [x] MintingError.duplicate should create error with MINT_DUPLICATE code
- [x] MintingError.duplicate should have statusCode 409
- [x] MintingError.duplicate should include ticketId in context
- [x] MintingError.duplicate should include tenantId in context
- [x] MintingError.duplicate should include ticketId in message
- [x] MintingError.inProgress should create error with MINT_IN_PROGRESS code
- [x] MintingError.inProgress should have statusCode 409
- [x] MintingError.inProgress should include ticketId in context
- [x] MintingError.inProgress should include tenantId in context
- [x] MintingError.notFound should create error with MINT_NOT_FOUND code
- [x] MintingError.notFound should have statusCode 404
- [x] MintingError.notFound should include mintId in context

**SolanaError Tests:**
- [x] SolanaError should extend BaseError
- [x] SolanaError should set name to SolanaError
- [x] SolanaError should have default statusCode 503
- [x] SolanaError should have default code SOLANA_RPC_ERROR
- [x] SolanaError.timeout should create error with SOLANA_TIMEOUT code
- [x] SolanaError.timeout should have statusCode 504
- [x] SolanaError.timeout should include operation in context
- [x] SolanaError.timeout should include duration in context
- [x] SolanaError.unavailable should create error with SOLANA_RPC_UNAVAILABLE code
- [x] SolanaError.unavailable should have statusCode 503
- [x] SolanaError.unavailable should include endpoint in context
- [x] SolanaError.insufficientFunds should create error with SOLANA_INSUFFICIENT_FUNDS code
- [x] SolanaError.insufficientFunds should have statusCode 400
- [x] SolanaError.insufficientFunds should include required amount in context
- [x] SolanaError.insufficientFunds should include available amount in context
- [x] SolanaError.blockhashExpired should create error with SOLANA_BLOCKHASH_EXPIRED code
- [x] SolanaError.blockhashExpired should have statusCode 409

**ValidationError Tests:**
- [x] ValidationError should extend BaseError
- [x] ValidationError should set name to ValidationError
- [x] ValidationError should have default statusCode 400
- [x] ValidationError should have default code VALIDATION_FAILED
- [x] ValidationError should accept validationErrors array
- [x] ValidationError.fromZodError should format Zod errors correctly
- [x] ValidationError.fromZodError should map paths to field names with dots
- [x] ValidationError.fromZodError should preserve error messages
- [x] ValidationError.fromZodError should include errorCount in context
- [x] ValidationError.missingField should create error with VALIDATION_MISSING_FIELD code
- [x] ValidationError.missingField should have statusCode 400
- [x] ValidationError.missingField should include field in context
- [x] ValidationError.missingField should include field name in message
- [x] ValidationError.toJSON should include validationErrors in JSON output

**TenantError Tests:**
- [x] TenantError should extend BaseError
- [x] TenantError should set name to TenantError
- [x] TenantError should have default statusCode 403
- [x] TenantError should have default code TENANT_INVALID
- [x] TenantError.missingContext should create error with TENANT_CONTEXT_MISSING code
- [x] TenantError.missingContext should have statusCode 400
- [x] TenantError.mismatch should create error with TENANT_MISMATCH code
- [x] TenantError.mismatch should have statusCode 403
- [x] TenantError.mismatch should include requestTenantId in context
- [x] TenantError.mismatch should include resourceTenantId in context
- [x] TenantError.invalid should create error with TENANT_INVALID code
- [x] TenantError.invalid should have statusCode 400
- [x] TenantError.invalid should include tenantId in context

**IPFSError Tests:**
- [x] IPFSError should extend BaseError
- [x] IPFSError should set name to IPFSError
- [x] IPFSError should have default statusCode 502
- [x] IPFSError should have default code IPFS_UPLOAD_FAILED
- [x] IPFSError.timeout should create error with IPFS_TIMEOUT code
- [x] IPFSError.timeout should have statusCode 504
- [x] IPFSError.timeout should include durationMs in context
- [x] IPFSError.pinFailed should create error with IPFS_PIN_FAILED code
- [x] IPFSError.pinFailed should have statusCode 502
- [x] IPFSError.pinFailed should include CID in context
- [x] IPFSError.cidVerificationFailed should create error with IPFS_CID_VERIFICATION_FAILED code
- [x] IPFSError.cidVerificationFailed should have statusCode 500
- [x] IPFSError.cidVerificationFailed should include expectedCid in context
- [x] IPFSError.cidVerificationFailed should include actualCid in context

**AuthenticationError Tests:**
- [x] AuthenticationError should extend BaseError
- [x] AuthenticationError should set name to AuthenticationError
- [x] AuthenticationError should have default statusCode 401
- [x] AuthenticationError should have default code UNAUTHORIZED
- [x] AuthenticationError.invalidToken should create error with TOKEN_INVALID code
- [x] AuthenticationError.invalidToken should have statusCode 401
- [x] AuthenticationError.expiredToken should create error with TOKEN_EXPIRED code
- [x] AuthenticationError.expiredToken should have statusCode 401
- [x] AuthenticationError.invalidSignature should create error with SIGNATURE_INVALID code
- [x] AuthenticationError.invalidSignature should have statusCode 401
- [x] AuthenticationError.forbidden should create error with FORBIDDEN code
- [x] AuthenticationError.forbidden should have statusCode 403
- [x] AuthenticationError.forbidden should include requiredRole in context when provided
- [x] AuthenticationError.forbidden should include role in message when provided
- [x] AuthenticationError.insufficientRole should create error with ROLE_INSUFFICIENT code
- [x] AuthenticationError.insufficientRole should have statusCode 403
- [x] AuthenticationError.insufficientRole should include userRole in context
- [x] AuthenticationError.insufficientRole should include requiredRole in context
- [x] AuthenticationError.insufficientRole should include both roles in message

**RateLimitError Tests:**
- [x] RateLimitError should extend BaseError
- [x] RateLimitError should set name to RateLimitError
- [x] RateLimitError should have statusCode 429
- [x] RateLimitError should have default code RATE_LIMITED
- [x] RateLimitError should include retryAfter property
- [x] RateLimitError should default retryAfter to 60
- [x] RateLimitError.forTenant should create error with RATE_LIMIT_TENANT code
- [x] RateLimitError.forTenant should have statusCode 429
- [x] RateLimitError.forTenant should include tenantId in context
- [x] RateLimitError.forTenant should set retryAfter
- [x] RateLimitError.global should create error with RATE_LIMIT_GLOBAL code
- [x] RateLimitError.global should have statusCode 429
- [x] RateLimitError.global should set retryAfter
- [x] RateLimitError.toJSON should include retryAfter in JSON output

**Type Guard Tests:**
- [x] isBaseError should return true for BaseError instances
- [x] isBaseError should return true for subclass instances
- [x] isBaseError should return false for plain Error
- [x] isBaseError should return false for non-errors
- [x] isOperationalError should return true for operational errors
- [x] isOperationalError should return false for non-operational errors
- [x] isOperationalError should return false for plain Error
- [x] isOperationalError should return false for non-errors
- [x] isMintingError should return true for MintingError instances
- [x] isMintingError should return false for other error types
- [x] isMintingError should return false for BaseError
- [x] isSolanaError should return true for SolanaError instances
- [x] isSolanaError should return false for other error types
- [x] isValidationError should return true for ValidationError instances
- [x] isValidationError should return false for other error types
- [x] isTenantError should return true for TenantError instances
- [x] isTenantError should return false for other error types
- [x] isIPFSError should return true for IPFSError instances
- [x] isIPFSError should return false for other error types
- [x] isAuthenticationError should return true for AuthenticationError instances
- [x] isAuthenticationError should return false for other error types
- [x] isRateLimitError should return true for RateLimitError instances
- [x] isRateLimitError should return false for other error types

---

## 2. utils/ ✅ COMPLETE

### utils/logger.ts (20 tests) 🔴 Critical ✅ COMPLETE

**Sensitive Field Detection:**
- [x] should detect sensitive field 'password'
- [x] should detect sensitive field 'apiKey'
- [x] should detect sensitive field 'secret'
- [x] should detect sensitive field 'token'
- [x] should detect sensitive field 'privateKey'
- [x] should detect sensitive field 'private_key'
- [x] should detect sensitive field case-insensitively
- [x] should detect sensitive field with partial match

**Sensitive Pattern Detection:**
- [x] should detect JWT pattern in values
- [x] should detect Solana keypair pattern (base58, 87-88 chars)
- [x] should detect API key patterns (sk_, pk_, api_)
- [x] should detect email pattern
- [x] should detect long hex strings

**Sanitization Functions:**
- [x] sanitizeValue should redact sensitive strings
- [x] sanitizeValue should pass through safe values
- [x] sanitizeValue should truncate very long strings
- [x] sanitizeObject should redact sensitive fields
- [x] sanitizeObject should handle nested objects
- [x] sanitizeObject should handle arrays
- [x] sanitizeObject should limit recursion depth

**Helper Exports:**
- [x] createChildLogger should include context
- [x] sanitize should be exported for external use
- [x] wouldRedact should return true for sensitive fields
- [x] addSensitiveField should add custom field

### utils/circuit-breaker.ts (18 tests) 🟠 High ✅ COMPLETE

**SolanaCircuitBreaker Tests:**
- [x] constructor should initialize with CLOSED state
- [x] should use configured timeout (30s)
- [x] should use configured errorThresholdPercentage (50%)
- [x] should use configured volumeThreshold (5)
- [x] fire should call function when CLOSED
- [x] fire should throw CircuitOpenError when OPEN
- [x] fire should allow single call in HALF_OPEN
- [x] should transition to OPEN after failure threshold
- [x] should transition to HALF_OPEN after resetTimeout
- [x] should transition to CLOSED on HALF_OPEN success
- [x] getState should return 'closed', 'open', or 'halfOpen'
- [x] getStats should return failure count
- [x] getStats should return success count
- [x] isHealthy should return true when closed

**IPFSCircuitBreaker Tests:**
- [x] should use 60s timeout (longer for uploads)
- [x] should use configured volumeThreshold (3)
- [x] fire should work independently from Solana breaker

**Singleton & Health:**
- [x] getSolanaCircuitBreaker should return singleton
- [x] getIPFSCircuitBreaker should return singleton
- [x] getCircuitBreakerHealth should return all breaker states

### utils/distributed-lock.ts (15 tests) 🔴 Critical ✅ COMPLETE

**Lock Key Generation:**
- [x] createMintLockKey should format as 'mint:{tenantId}:{ticketId}'
- [x] createBatchLockKey should format as 'batch:{tenantId}:{batchId}'
- [x] createVenueLockKey should format as 'venue:{venueId}'

**Redlock Configuration:**
- [x] getRedlock should return Redlock instance
- [x] getRedlock should return singleton on subsequent calls
- [x] should use configured retryCount (3)
- [x] should use configured retryDelay (200ms)
- [x] should use configured retryJitter (100ms)

**withLock Function:**
- [x] withLock should acquire lock before execution
- [x] withLock should release lock after successful execution
- [x] withLock should release lock after error
- [x] withLock should throw if lock cannot be acquired
- [x] withLock should respect TTL parameter

**Additional Lock Functions:**
- [x] tryLock should return lock if available
- [x] tryLock should return null if not available
- [x] extendLock should extend lock TTL
- [x] releaseLock should release lock

### utils/metrics.ts (22 tests) 🟡 Medium ✅ COMPLETE

**Counter Metrics:**
- [x] mintsTotal should be Counter type
- [x] mintsTotal should have labels: status, tenant_id
- [x] mintsSuccessTotal should be Counter type
- [x] mintsSuccessTotal should have label: tenant_id
- [x] mintsFailedTotal should be Counter type
- [x] mintsFailedTotal should have labels: reason, tenant_id
- [x] errors should be Counter with labels: error_type, service
- [x] httpRequestsTotal should be Counter
- [x] cacheHits should be Counter
- [x] cacheMisses should be Counter

**Histogram Metrics:**
- [x] mintDuration should be Histogram type
- [x] mintDuration should have buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
- [x] ipfsUploadDuration should be Histogram
- [x] solanaTxConfirmationDuration should be Histogram
- [x] httpRequestDuration should be Histogram

**Gauge Metrics:**
- [x] queueDepth should be Gauge type
- [x] walletBalanceSOL should be Gauge type
- [x] activeWorkers should be Gauge
- [x] databaseConnections should be Gauge
- [x] systemHealth should be Gauge with component label

**Helper Functions:**
- [x] getMetrics should return Prometheus format string
- [x] getMetricsJSON should return JSON object
- [x] updateSystemHealth should set gauge value
- [x] recordMintSuccess should increment counter
- [x] recordMintFailure should increment counter with reason
- [x] startTimer should return timer function

### utils/response-filter.ts (18 tests) 🟡 Medium ✅ COMPLETE

**Field Constants:**
- [x] MINT_RESPONSE_FIELDS should contain expected fields
- [x] MINT_DETAILED_RESPONSE_FIELDS should extend MINT_RESPONSE_FIELDS
- [x] JOB_RESPONSE_FIELDS should contain expected fields
- [x] DLQ_JOB_RESPONSE_FIELDS should contain expected fields
- [x] SENSITIVE_FIELDS should include common sensitive names

**Helper Functions:**
- [x] pick should return only specified keys
- [x] pick should handle missing keys gracefully
- [x] pick should return empty object for no matches
- [x] omit should remove specified keys
- [x] omit should preserve other keys

**Filter Functions:**
- [x] filterMintResponse should filter to allowed fields
- [x] filterMintResponse should exclude sensitive fields
- [x] filterMintListResponse should filter array of mints
- [x] filterDetailedMintResponse should include additional fields
- [x] filterJobResponse should filter job fields
- [x] filterDLQJobResponse should filter DLQ fields

**Redaction & Pagination:**
- [x] redactSensitiveFields should redact password
- [x] redactSensitiveFields should redact nested sensitive fields
- [x] redactSensitiveFields should handle arrays
- [x] redactSensitiveFields should be case-insensitive
- [x] createPaginatedResponse should calculate hasMore correctly
- [x] createPaginatedResponse should include pagination metadata

### utils/solana.ts (10 tests) 🟠 High ✅ COMPLETE

- [x] checkWalletBalance should return balance in SOL
- [x] checkWalletBalance should return sufficient flag
- [x] checkWalletBalance should compare against threshold
- [x] formatSOL should convert lamports to SOL (divide by 1e9)
- [x] formatSOL should handle decimal places correctly
- [x] isValidPublicKey should return true for valid Solana address
- [x] isValidPublicKey should return false for invalid address
- [x] isValidPublicKey should return false for empty string
- [x] isValidSignature should return true for valid signature
- [x] isValidSignature should return false for invalid signature
- [x] retryAsync should retry on failure
- [x] retryAsync should use exponential backoff

### utils/spending-limits.ts (12 tests) 🟠 High ✅ COMPLETE

- [x] checkSpendingLimits should read limits from config
- [x] checkSpendingLimits should check daily limit
- [x] checkSpendingLimits should check monthly limit
- [x] checkSpendingLimits should return allowed=true under limit
- [x] checkSpendingLimits should return allowed=false over limit
- [x] checkSpendingLimits should include remaining amount
- [x] checkSpendingLimits should include which limit was exceeded
- [x] recordSpending should increment daily counter
- [x] recordSpending should increment monthly counter
- [x] recordSpending should set TTL on daily counter (24h)
- [x] recordSpending should set TTL on monthly counter (30d)
- [x] getSpendingStatus should return current daily spending
- [x] getSpendingStatus should return current monthly spending

### utils/validate-config.ts (11 tests) 🟠 High ✅ COMPLETE

- [x] validateAll should check DATABASE_URL exists
- [x] validateAll should check REDIS_HOST exists
- [x] validateAll should check SOLANA_RPC_URL exists
- [x] validateAll should check JWT_SECRET exists
- [x] validateAll should check INTERNAL_SERVICE_SECRET exists
- [x] validateAll should throw on missing required vars
- [x] validateAll should list all missing vars in error
- [x] validateAll should pass when all vars present
- [x] validatePort should accept valid port numbers (1-65535)
- [x] validatePort should reject invalid ports
- [x] validateUrl should accept valid URLs
- [x] validateUrl should reject invalid URLs

---

## 3. models/ ✅ COMPLETE

### models/Mint.ts (30 tests) 🔴 Critical ✅ COMPLETE

**Interface & Constants:**
- [x] IMint interface should define required fields
- [x] IMint should include ticket_id
- [x] IMint should include tenant_id
- [x] IMint should include status enum (pending, minting, completed, failed)
- [x] IMint should include soft delete fields (deleted_at, deleted_by)
- [x] IMMUTABLE_FIELDS should include id, tenant_id, ticket_id, created_at

**stripImmutableFields Function:**
- [x] stripImmutableFields should remove tenant_id
- [x] stripImmutableFields should remove id
- [x] stripImmutableFields should remove created_at
- [x] stripImmutableFields should remove ticket_id
- [x] stripImmutableFields should preserve mutable fields
- [x] stripImmutableFields should log warning on attempt

**Query Builders:**
- [x] activeQuery should exclude soft-deleted records (whereNull deleted_at)
- [x] allQuery should include all records
- [x] deletedQuery should only return soft-deleted (whereNotNull deleted_at)

**CRUD Operations:**
- [x] create should use RETURNING clause
- [x] create should set created_at and updated_at
- [x] create should set deleted_at to null
- [x] findById should filter by tenant when provided
- [x] findById should exclude soft-deleted
- [x] findByIdIncludeDeleted should return deleted records
- [x] findByTicketId should require tenantId parameter
- [x] findPending should filter status='pending'
- [x] findPending should filter retry_count < 3
- [x] findPending should order by created_at ASC
- [x] findByStatus should support pagination (limit, offset)
- [x] update should strip immutable fields
- [x] update should use RETURNING clause
- [x] update should set updated_at

**Soft Delete:**
- [x] softDelete should set deleted_at timestamp
- [x] softDelete should record deleted_by
- [x] softDelete should use RETURNING clause
- [x] restore should clear deleted_at
- [x] restore should clear deleted_by
- [x] hardDelete should require confirm flag
- [x] hardDelete should return false without confirmation

**Statistics:**
- [x] countByStatus should return counts per status
- [x] countByStatus should filter by tenant
- [x] getCounts should return total, active, deleted

### models/Collection.ts (12 tests) 🟡 Medium ✅ COMPLETE

- [x] ICollection interface should define required fields
- [x] ICollection should include name, symbol, contract_address
- [x] ICollection should include max_supply, current_supply
- [x] create should insert and return with RETURNING
- [x] create should set timestamps
- [x] findById should return null when not found
- [x] findByContract should find by contract_address
- [x] update should set updated_at timestamp
- [x] update should use RETURNING clause
- [x] incrementSupply should increment current_supply by 1
- [x] incrementSupply should return boolean success
- [x] delete should return boolean (true if deleted)
- [x] constructor should accept custom db instance

### models/NFT.ts (10 tests) 🟡 Medium ✅ COMPLETE

- [x] INFT interface should define required fields
- [x] INFT should include token_id, contract_address, owner_address
- [x] INFT should include metadata_uri, metadata
- [x] create should use RETURNING clause
- [x] findById should return null when not found
- [x] findByTokenId should require both tokenId and contractAddress
- [x] findByOwner should return array of NFTs
- [x] findByOwner should order by created_at DESC
- [x] update should set updated_at
- [x] update should use RETURNING clause
- [x] delete should return boolean

---

## 4. schemas/ ✅ COMPLETE

### schemas/validation.ts (40 tests) 🟠 High ✅ COMPLETE

**Helper Functions:**
- [x] validate should return parsed data on success
- [x] validate should throw on failure
- [x] safeValidate should return { success: true, data } on success
- [x] safeValidate should return { success: false, error } on failure
- [x] formatValidationErrors should format Zod errors
- [x] formatValidationErrors should join paths with dots

**ticketMetadataSchema:**
- [x] should accept valid metadata
- [x] should accept optional eventName
- [x] should accept optional eventDate
- [x] should accept optional venue
- [x] should accept optional tier
- [x] should accept optional seatNumber
- [x] should accept optional section
- [x] should accept optional row
- [x] should validate image as URL
- [x] should enforce STRING_LIMITS.NAME for eventName
- [x] should use strict mode (no extra fields)

**ticketMintDataSchema:**
- [x] should require ticketId as UUID
- [x] should require tenantId as UUID
- [x] should accept optional orderId as UUID
- [x] should accept optional eventId as UUID
- [x] should accept optional userId as UUID
- [x] should validate ownerAddress length (32-64)
- [x] should accept optional metadata

**batchMintSchema:**
- [x] should require venueId as UUID
- [x] should require tickets array
- [x] should validate nested ticket objects
- [x] should enforce min 1 ticket
- [x] should enforce max 100 tickets
- [x] should validate ticketData passthrough

**mintQuerySchema:**
- [x] should validate status enum values
- [x] should coerce limit to number
- [x] should default limit to 50
- [x] should enforce max limit of 100
- [x] should default offset to 0

**reconcileSchema & dlqRequeueSchema:**
- [x] reconcileSchema should require ticketIds array
- [x] reconcileSchema should enforce max 1000 tickets
- [x] dlqRequeueSchema should require jobIds array
- [x] dlqRequeueSchema should enforce max 100 jobIds

**nftMetadataSchema (Metaplex):**
- [x] should require name
- [x] should require symbol
- [x] should require image as URL
- [x] should accept optional description
- [x] should validate seller_fee_basis_points (0-10000)
- [x] should validate attributes array
- [x] should validate properties.files array

**webhookMintPayloadSchema:**
- [x] should validate event enum
- [x] should require ticketId
- [x] should require tenantId
- [x] should accept optional timestamp in datetime format

**internalMintRequestSchema:**
- [x] should require ticket_id
- [x] should require tenant_id
- [x] should default priority to 'normal'
- [x] should validate priority enum (low, normal, high)

---

## 5. validators/ ✅ COMPLETE

### validators/mint.schemas.ts (6 tests) 🟡 Medium ✅ COMPLETE

- [x] internalMintSchema should require ticketIds array
- [x] internalMintSchema should validate ticketIds as UUIDs
- [x] internalMintSchema should enforce min 1 ticketId
- [x] internalMintSchema should enforce max 100 ticketIds
- [x] internalMintSchema should require eventId as UUID
- [x] internalMintSchema should require userId as UUID
- [x] internalMintSchema should require tenantId as UUID
- [x] internalMintSchema should accept optional queue boolean
- [x] internalMintSchema should accept optional orderId

---

## 6. middleware/ ✅ COMPLETE

### middleware/admin-auth.ts (18 tests) 🔴 Critical ✅ COMPLETE

**authMiddleware:**
- [x] should return 401 when no Authorization header
- [x] should return 401 for non-Bearer token format
- [x] should return 401 for malformed Bearer header
- [x] should return 401 for invalid JWT token
- [x] should return 401 for expired token
- [x] should return 500 when JWT_SECRET not configured
- [x] should attach user to request on success
- [x] should extract id from token sub claim
- [x] should extract tenant_id from token
- [x] should extract email from token
- [x] should extract role from token
- [x] should extract permissions from token

**requireAdmin:**
- [x] should return 500 without user context
- [x] should return 403 for non-admin role
- [x] should allow 'admin' role
- [x] should allow 'super_admin' role
- [x] should allow 'platform_admin' role

**requirePermission:**
- [x] should return 500 without user context
- [x] should return 403 without required permission
- [x] should allow when permission present
- [x] should allow admins all permissions
- [x] should allow super_admin all permissions
- [x] should allow platform_admin all permissions
- [x] should handle missing permissions array

### middleware/internal-auth.ts (12 tests) 🔴 Critical ✅ COMPLETE

- [x] should return 401 without x-internal-service header
- [x] should return 401 without x-internal-signature header
- [x] should return 401 without x-timestamp header
- [x] should return 403 for service not in allowed list
- [x] should return 401 for timestamp older than 5 minutes
- [x] should return 401 for timestamp in future > 5 minutes
- [x] should return 500 without INTERNAL_SERVICE_SECRET configured
- [x] should return 401 for invalid signature
- [x] should use HMAC-SHA256 for signature verification
- [x] should reject signature with wrong length
- [x] should accept timestamp within 5 minute window
- [x] should allow payment-service
- [x] should allow ticket-service
- [x] should attach internalService to request on success

### middleware/load-shedding.ts (14 tests) 🟠 High ✅ COMPLETE

**RequestPriority Enum:**
- [x] RequestPriority.CRITICAL should be 'critical'
- [x] RequestPriority.HIGH should be 'high'
- [x] RequestPriority.NORMAL should be 'normal'
- [x] RequestPriority.LOW should be 'low'

**getLoadSheddingStatus:**
- [x] should return enabled status
- [x] should return current request count
- [x] should return max requests
- [x] should return load percent
- [x] should return bulkheads status
- [x] should have mint bulkhead
- [x] should have webhook bulkhead
- [x] should have admin bulkhead
- [x] should have default bulkhead

### middleware/request-id.ts (6 tests) 🟡 Medium ✅ COMPLETE

- [x] should return request.id when present
- [x] should return "unknown" when no id present
- [x] should return "unknown" for empty string id
- [x] should return UUID format id

### middleware/request-logger.ts (10 tests) 🟡 Medium ✅ COMPLETE

- [x] should sanitize sensitive query params
- [x] should preserve non-sensitive params
- [x] should identify health endpoints
- [x] should identify metrics endpoint
- [x] should identify sensitive headers
- [x] should identify safe headers
- [x] should handle hrtime format

### middleware/tenant-context.ts (12 tests) 🔴 Critical ✅ COMPLETE

**tenantContextMiddleware:**
- [x] should return 401 without tenant
- [x] should return 401 when user has no tenant_id
- [x] should validate tenant_id is UUID format
- [x] should attach tenantId to request on success

**isPlatformAdmin:**
- [x] should return true for platform_admin role
- [x] should return true for super_admin role
- [x] should return false for regular user
- [x] should return false for admin role
- [x] should return false when no user

**getTenantIdFromRequest:**
- [x] should return tenant_id for regular user
- [x] should return null when no user
- [x] should allow platform admin to specify different tenant via query
- [x] should return null for platform admin without specific tenant
- [x] should ignore query param for non-platform-admin
- [x] should validate tenant_id format in query param

**withTenantContext:**
- [x] should validate tenant ID format
- [x] should accept valid UUID tenant ID
- [x] should call SET LOCAL with tenant ID
- [x] should pass transaction to callback

### middleware/webhook-idempotency.ts (11 tests) 🟠 High ✅ COMPLETE

**isWebhookProcessed:**
- [x] should return true when event exists
- [x] should return false when event does not exist
- [x] should return false on Redis error

**markWebhookProcessed:**
- [x] should call setex with correct TTL (24 hours)
- [x] should include metadata in stored value
- [x] should include processedAt timestamp
- [x] should not throw on Redis error

**getWebhookProcessingInfo:**
- [x] should return null when not found
- [x] should return parsed processing info
- [x] should return null on Redis error

**webhookIdempotencyMiddleware:**
- [x] should extract event ID from body.id
- [x] should extract event ID from x-webhook-id header
- [x] should return 200 for duplicate webhook
- [x] should allow processing for new webhook

**clearWebhookProcessingStatus:**
- [x] should call Redis del
- [x] should not throw on error

---

## 7. queues/ ✅ COMPLETE

### queues/mintQueue.ts (68 tests) 🟠 High ✅ COMPLETE

**ID Generation:**
- [x] generateJobId should be deterministic
- [x] generateJobId should format as 'mint-{tenantId}-{ticketId}'

**Backoff Calculation:**
- [x] calculateBackoffWithJitter should use exponential formula
- [x] calculateBackoffWithJitter should start at BASE_BACKOFF_DELAY_MS
- [x] calculateBackoffWithJitter should add random jitter
- [x] calculateBackoffWithJitter should cap at MAX_BACKOFF_DELAY_MS
- [x] calculateBackoffWithJitter should handle high attempt numbers
- [x] calculateBackoffWithJitter should return rounded integer values

**Error Categorization:**
- [x] categorizeError should return 'insufficient_balance'
- [x] categorizeError should return 'ipfs_failure'
- [x] categorizeError should return 'transaction_failure'
- [x] categorizeError should return 'timeout'
- [x] categorizeError should return 'connection_error'
- [x] categorizeError should return 'rate_limited'
- [x] categorizeError should return 'bubblegum_error'
- [x] categorizeError should return 'unknown' as default

**Queue Limits:**
- [x] checkQueueLimits should return canAccept=true under limits
- [x] checkQueueLimits should return canAccept=false at MAX_QUEUE_SIZE
- [x] checkQueueLimits should return canAccept=false at HIGH_WATER_MARK
- [x] checkQueueLimits should include currentSize, maxSize, highWaterMark
- [x] getQueueLimits should return maxQueueSize
- [x] getQueueLimits should return highWaterMark
- [x] getQueueLimits should return default values

**Job Management:**
- [x] addMintJob should use deterministic job ID
- [x] addMintJob should check queue limits before adding
- [x] addMintJob should throw on missing ticketId
- [x] addMintJob should throw on missing tenantId
- [x] addMintJob should return existing job if already queued
- [x] addMintJob should allow re-queue for completed/failed jobs
- [x] addBatchMintJobs should queue all valid tickets
- [x] addBatchMintJobs should track skipped tickets

**Queue Access:**
- [x] getMintQueue should throw if not initialized
- [x] getRetryQueue should throw if not initialized
- [x] getDLQ should throw if not initialized

**Stale Job Detection:**
- [x] detectStaleJobs should find active jobs > threshold
- [x] detectStaleJobs should find waiting jobs > threshold
- [x] detectStaleJobs should return totalStale count
- [x] detectStaleJobs should return empty arrays when no stale jobs
- [x] getStaleJobDetectionStatus should return running status
- [x] getStaleJobDetectionStatus should return intervalMs
- [x] getStaleJobDetectionStatus should return activeThresholdMs
- [x] getStaleJobDetectionStatus should return waitingThresholdMs
- [x] forceRetryStaleJob should move job to failed then requeue
- [x] forceRetryStaleJob should return null if job not found
- [x] forceRetryStaleJob should create new job with retry prefix
- [x] startStaleJobDetection should set running to true
- [x] stopStaleJobDetection should set running to false
- [x] should not start twice

**Stats & Config:**
- [x] getConcurrencyLimit should return MINT_CONCURRENCY value
- [x] getConcurrencyLimit should default to 5
- [x] getQueueRateLimitConfig should return rate limit configuration
- [x] getQueueRateLimitConfig should return default max of 10
- [x] getQueueRateLimitConfig should return default duration of 1000ms
- [x] getQueueConfig should return complete queue configuration
- [x] getQueueConfig should include jobOptions with timeout
- [x] getQueueConfig should include jobOptions with attempts
- [x] getMintQueueStats should return all queue counts
- [x] getMintQueueStats should return paused status
- [x] getDLQStats should return DLQ statistics

**Job Options Export:**
- [x] JOB_OPTIONS_WITH_JITTER should export job options with custom backoff type
- [x] JOB_OPTIONS_WITH_JITTER should have same timeout as default options
- [x] JOB_OPTIONS_WITH_JITTER should have same attempts as default options

**Queue Pause/Resume:**
- [x] pauseMintQueue should call pause on queue
- [x] resumeMintQueue should call resume on queue

**Requeue from DLQ:**
- [x] requeueFromDLQ should add job back to main queue
- [x] requeueFromDLQ should return null if DLQ job not found

**Update Queue Metrics:**
- [x] updateQueueMetrics should update queue depth metrics
- [x] updateQueueMetrics should update DLQ metrics

---

## 8. workers/ ✅ COMPLETE

### workers/mintingWorker.ts (10 tests) 🟠 High ✅ COMPLETE

**Error Categorization:**
- [x] categorizeError should return 'insufficient_balance'
- [x] categorizeError should return 'ipfs_error'
- [x] categorizeError should return 'rpc_error'
- [x] categorizeError should return 'transaction_failed'
- [x] categorizeError should return 'unknown' for unmatched

**Retry Logic:**
- [x] isRetryableError should return true for RPC errors
- [x] isRetryableError should return true for timeout errors
- [x] isRetryableError should return true for connection errors
- [x] isRetryableError should return false for validation errors
- [x] isRetryableError should return false for auth errors

**Configuration:**
- [x] getConcurrencyLimit should read from MINT_CONCURRENCY
- [x] getConcurrencyLimit should default to 5

---

## 9. services/ ✅ COMPLETE

### services/MintingOrchestrator.ts (25 tests) 🔴 Critical ✅ COMPLETE

**Error Categorization:**
- [x] categorizeError should return 'insufficient_balance'
- [x] categorizeError should return 'ipfs_upload_failed'
- [x] categorizeError should return 'transaction_failed'
- [x] categorizeError should return 'timeout'
- [x] categorizeError should return 'bubblegum_error'
- [x] categorizeError should return 'unknown' as default

**Accessors:**
- [x] getMerkleTreeAddress should return address when initialized
- [x] getMerkleTreeAddress should return null when not initialized
- [x] getCollectionAddress should return address when initialized

**Initialization:**
- [x] ensureInitialized should get connection
- [x] ensureInitialized should get wallet
- [x] ensureInitialized should initialize nftService
- [x] ensureInitialized should only run once

**Minting:**
- [x] mintCompressedNFT should acquire distributed lock
- [x] mintCompressedNFT should release lock on success
- [x] mintCompressedNFT should release lock on error
- [x] executeMint should return cached result for completed
- [x] executeMint should throw for in-progress mint
- [x] executeMint should allow retry for failed/pending

**Balance & Metadata:**
- [x] executeMint should check wallet balance
- [x] executeMint should throw on insufficient balance
- [x] prepareAndUploadMetadata should format metadata correctly

**Database:**
- [x] checkExistingMint should return record if found
- [x] checkExistingMint should return null if not found
- [x] markMintingStarted should create table if not exists
- [x] markMintingStarted should upsert with 'minting' status
- [x] saveMintRecord should use transaction

### services/MetadataService.ts (35 tests) 🟠 High ✅ COMPLETE

**CID Validation:**
- [x] isValidCidFormat should accept CIDv0 (Qm...)
- [x] isValidCidFormat should accept CIDv1 base32
- [x] isValidCidFormat should accept CIDv1 base16
- [x] isValidCidFormat should reject invalid CID
- [x] isValidCidFormat should reject empty string

**CID Extraction:**
- [x] extractCidFromUri should handle ipfs:// scheme
- [x] extractCidFromUri should handle /ipfs/ path
- [x] extractCidFromUri should handle gateway URLs
- [x] extractCidFromUri should return raw CID
- [x] extractCidFromUri should return null for invalid

**CID Verification:**
- [x] verifyCidExists should return exists=true for valid CID
- [x] verifyCidExists should return exists=false for invalid
- [x] verifyCidExists should timeout after configured ms
- [x] verifyCidContent should verify content hash
- [x] verifyCidContent should detect hash mismatch

**Caching:**
- [x] generateCacheKey should format as 'ipfs:cache:{tenantId}:{ticketId}'
- [x] generateContentCacheKey should hash metadata
- [x] getCachedIPFSUri should return cached value
- [x] getCachedIPFSUri should return null on miss
- [x] cacheIPFSUri should store with TTL
- [x] IPFS_CACHE_TTL_SECONDS should be 7 days

**Upload:**
- [x] uploadToIPFS should check cache first
- [x] uploadToIPFS should upload if not cached
- [x] uploadToIPFS should cache result
- [x] uploadToIPFS should format NFT metadata
- [x] uploadToIPFS should add optional attributes
- [x] uploadMetadata should use content-based caching
- [x] invalidateIPFSCache should delete key

**Event Emitter:**
- [x] MintStatusEmitter.getInstance should return singleton
- [x] emitMintStatus should emit global 'status' event
- [x] emitMintStatus should emit tenant-specific event
- [x] emitMintStatus should emit user-specific event
- [x] subscribeTenant should receive tenant events
- [x] subscribeUser should receive user events
- [x] subscribeTicket should receive ticket events
- [x] unsubscribeTenant should stop receiving events

### services/BalanceMonitor.ts (12 tests) 🟡 Medium ✅ COMPLETE

- [x] POLL_INTERVAL should be 5 minutes
- [x] ALERT_COOLDOWN should be 1 hour
- [x] MIN_SOL_BALANCE should read from env
- [x] MIN_SOL_BALANCE should default to 0.1
- [x] getCurrentBalance should return SOL balance
- [x] isBalanceSufficient should compare to threshold
- [x] getBalanceStatus should return comprehensive status
- [x] startBalanceMonitoring should start interval
- [x] startBalanceMonitoring should check immediately
- [x] stopBalanceMonitoring should clear interval
- [x] should trigger alert when balance below threshold
- [x] should respect alert cooldown

### services/BatchMintingService.ts (10 tests) 🟡 Medium ✅ COMPLETE

- [x] MAX_BATCH_SIZE should be 10
- [x] BATCH_DELAY_MS should be 100
- [x] batchMint should validate batch size
- [x] batchMint should process in batches of MAX_BATCH_SIZE
- [x] batchMint should process batch items in parallel
- [x] batchMint should add delay between batches
- [x] batchMint should collect all results
- [x] batchMint should count successful and failed
- [x] estimateBatchCost should calculate SOL cost
- [x] estimateBatchCost should include transaction fees

### services/DASClient.ts (15 tests) 🟡 Medium ✅ COMPLETE

- [x] constructor should set RPC URL
- [x] constructor should set 10-second timeout
- [x] getAsset should make JSON-RPC call
- [x] getAsset should return asset data
- [x] getAssetProof should return merkle proof
- [x] getAssetBatch should fetch multiple assets
- [x] getAssetsByOwner should paginate results
- [x] getAssetsByOwner should return array
- [x] getAssetsByGroup should filter by collection
- [x] getAssetsByCreator should filter by creator
- [x] verifyOwnership should return true for owner
- [x] verifyOwnership should return false for non-owner
- [x] assetExists should return true for existing
- [x] assetExists should return false for missing
- [x] getDASClient should return singleton

### services/MetadataCache.ts (12 tests) 🟡 Medium ✅ COMPLETE

- [x] KEY_PREFIX should be 'minting:'
- [x] DEFAULT_TTL should be 1 hour
- [x] get should return cached value
- [x] get should return null for miss
- [x] set should store with TTL
- [x] delete should remove key
- [x] getOrSet should return cached on hit
- [x] getOrSet should call factory on miss
- [x] getOrSet should cache factory result
- [x] invalidateTicket should clear ticket keys
- [x] clearAll should flush cache
- [x] getStats should return hit/miss counts

### services/PaymentIntegration.ts (6 tests) 🟡 Medium ✅ COMPLETE

- [x] onPaymentComplete should extract order data
- [x] onPaymentComplete should map ticket fields
- [x] onPaymentComplete should include metadata
- [x] onPaymentComplete should create job per ticket
- [x] onPaymentComplete should return job array
- [x] onPaymentComplete should log completion

### services/RPCManager.ts (10 tests) 🟡 Medium ✅ COMPLETE

- [x] constructor should configure multiple endpoints
- [x] constructor should set maxRetries to 3
- [x] constructor should set baseDelay to 1000ms
- [x] should rotate endpoint on 429 rate limit
- [x] should wrap around to first endpoint
- [x] getConnection should return current connection
- [x] sendTransactionWithRetry should add compute budget
- [x] sendTransactionWithRetry should confirm transaction
- [x] sendTransactionWithRetry should use exponential backoff
- [x] sendTransactionWithRetry should throw after max retries

### services/RealCompressedNFT.ts (10 tests) 🟠 High ✅ COMPLETE

- [x] getMerkleTreeAddress should return address when initialized
- [x] getMerkleTreeAddress should return null when not initialized
- [x] getCollectionAddress should return address when initialized
- [x] initialize should create Umi instance
- [x] initialize should load wallet from file
- [x] initialize should throw if wallet missing
- [x] initialize should load merkle tree config
- [x] mintNFT should throw if not initialized
- [x] mintNFT should use ownerAddress as leafOwner
- [x] mintNFT should return signature and tree

### services/ReconciliationService.ts (10 tests) 🟡 Medium ✅ COMPLETE

- [x] should categorize status as 'confirmed'
- [x] should categorize status as 'not_found'
- [x] should categorize status as 'pending'
- [x] should categorize status as 'error'
- [x] reconcileAll should fetch minted tickets
- [x] reconcileAll should check each on blockchain
- [x] reconcileAll should count by status
- [x] fixDiscrepancies should reset status
- [x] fixDiscrepancies should clear signature
- [x] getReconciliationHistory should return ordered results

### services/blockchain.service.ts (8 tests) 🟡 Medium ✅ COMPLETE

- [x] getClient should create with correct config
- [x] getClient should use env vars
- [x] getClient should use defaults when env not set
- [x] getClient should return singleton
- [x] registerTicketOnChain should call client.registerTicket
- [x] registerTicketOnChain should log success
- [x] registerTicketOnChain should re-throw BlockchainError
- [x] close should close client and nullify

---

## 10. config/ ✅ COMPLETE

### config/database.ts (10 tests) 🟠 High ✅ COMPLETE

- [x] should use default DATABASE_URL
- [x] should read DATABASE_URL from env
- [x] should configure connection pool min
- [x] should configure connection pool max
- [x] should configure acquireConnectionTimeout
- [x] should configure idleTimeoutMillis
- [x] should enable SSL in production
- [x] getPool should return singleton
- [x] initializeDatabase should test connection
- [x] db.destroy should close connections

### config/redis.ts (8 tests) 🟡 Medium ✅ COMPLETE

- [x] should use default host 'redis'
- [x] should use default port 6379
- [x] should read REDIS_HOST from env
- [x] should read REDIS_PORT from env
- [x] should include password when set
- [x] should configure retry strategy
- [x] getRedisClient should return singleton
- [x] should handle connection errors

### config/solana.ts (10 tests) 🟠 High ✅ COMPLETE

- [x] should read SOLANA_RPC_URL from env
- [x] should read SOLANA_WS_URL from env
- [x] should default to devnet URL
- [x] should configure commitment level
- [x] should configure confirm options
- [x] getConnection should return singleton
- [x] getWallet should load from WALLET_PATH
- [x] getWallet should parse JSON keypair
- [x] initializeSolana should establish connection
- [x] initializeSolana should verify RPC health

### config/secrets.ts (8 tests) 🟡 Medium ✅ COMPLETE

- [x] should detect AWS environment
- [x] should detect Vault environment
- [x] should fall back to env vars
- [x] loadSecrets should load required secrets
- [x] loadSecrets should set process.env
- [x] loadSecrets should handle missing secrets
- [x] loadSecrets should cache loaded secrets
- [x] loadSecrets should log loaded secrets (redacted)

### config/ipfs.ts (7 tests) 🟡 Medium ✅ COMPLETE

- [x] should read PINATA_JWT from env
- [x] should read PINATA_API_KEY from env
- [x] should read NFT_STORAGE_KEY from env
- [x] should configure primary provider
- [x] should configure fallback provider
- [x] getIPFSService should return service instance
- [x] getIPFSConfig should return configuration

### config/wallet-provider.ts (6 tests) 🟡 Medium ✅ COMPLETE

- [x] should detect file-based wallet from WALLET_PATH
- [x] should detect AWS KMS wallet from config
- [x] should generate ephemeral wallet in test mode
- [x] loadWallet should load from file path
- [x] loadWallet should validate keypair format
- [x] loadWallet should throw on invalid JSON

---

## 11. jobs/ ✅ COMPLETE

### jobs/reconciliation.ts (10 tests) 🟡 Medium ✅ COMPLETE

**Constants:**
- [x] RECONCILIATION_INTERVAL should be 15 minutes
- [x] STALE_MINTING_THRESHOLD should be 30 minutes
- [x] STALE_PENDING_THRESHOLD should be 1 hour
- [x] STARTUP_DELAY should be 5 seconds

**Reconciliation Logic:**
- [x] should find stale minting records
- [x] should verify asset existence via DAS
- [x] should update status for confirmed assets
- [x] should re-queue stuck pending mints
- [x] should check for existing queue jobs before re-queueing
- [x] should log reconciliation summary

**Lifecycle:**
- [x] startReconciliation should run periodically
- [x] stopReconciliation should clear interval
- [x] runReconciliationNow should trigger manual run
- [x] should handle DAS errors gracefully

---

## 12. Entry Point ✅ COMPLETE

### index.ts (15 tests) 🟠 High ✅ COMPLETE

**Configuration Constants:**
- [x] RATE_LIMIT_BYPASS_PATHS should include health endpoints
- [x] RATE_LIMIT_BYPASS_PATHS should include /metrics

**getRateLimitRedis:**
- [x] getRateLimitRedis should create Redis client
- [x] getRateLimitRedis should return singleton instance
- [x] getRateLimitRedis should log warning on error

**Process Event Handlers:**
- [x] unhandledRejection handler should log error
- [x] unhandledRejection handler should not crash process
- [x] uncaughtException handler should log and exit
- [x] warning handler should log warning details

**Graceful Shutdown:**
- [x] gracefulShutdown should set isShuttingDown flag
- [x] gracefulShutdown should ignore duplicate signals
- [x] gracefulShutdown should close HTTP server first
- [x] gracefulShutdown should stop balance monitoring
- [x] gracefulShutdown should close queues
- [x] gracefulShutdown should close database
- [x] gracefulShutdown should exit 0 on success
- [x] gracefulShutdown should exit 1 on error
- [x] gracefulShutdown should force exit after 30s timeout

---

## Appendix A: Test File Structure

```
tests/
├── setup.ts                          # Jest setup (required)
├── helpers/
│   ├── database.ts                   # DB test utilities
│   ├── queue.ts                      # Queue test utilities
│   ├── auth.ts                       # Auth token generators
│   └── setup.ts                      # Global test setup
├── mocks/
│   ├── solana.ts                     # Solana connection/wallet mocks
│   ├── redis.ts                      # Redis/ioredis mocks
│   ├── database.ts                   # Knex/pg mocks
│   └── ipfs.ts                       # IPFS provider mocks
├── fixtures/
│   ├── tickets.ts                    # Sample ticket data
│   ├── tenants.ts                    # Sample tenant data
│   └── mints.ts                      # Sample mint records
└── unit/
    ├── errors/
    │   └── index.test.ts
    ├── utils/
    │   ├── logger.test.ts
    │   ├── circuit-breaker.test.ts
    │   ├── distributed-lock.test.ts
    │   ├── metrics.test.ts
    │   ├── response-filter.test.ts
    │   ├── solana.test.ts
    │   ├── spending-limits.test.ts
    │   └── validate-config.test.ts
    ├── models/
    │   ├── Mint.test.ts
    │   ├── Collection.test.ts
    │   └── NFT.test.ts
    ├── schemas/
    │   └── validation.test.ts
    ├── validators/
    │   └── mint.schemas.test.ts
    ├── middleware/
    │   ├── admin-auth.test.ts
    │   ├── internal-auth.test.ts
    │   ├── load-shedding.test.ts
    │   ├── request-id.test.ts
    │   ├── request-logger.test.ts
    │   ├── tenant-context.test.ts
    │   └── webhook-idempotency.test.ts
    ├── queues/
    │   └── mintQueue.test.ts
    ├── workers/
    │   └── mintingWorker.test.ts
    ├── jobs/
    │   └── reconciliation.test.ts
    ├── services/
    │   ├── MintingOrchestrator.test.ts
    │   ├── MetadataService.test.ts
    │   ├── BalanceMonitor.test.ts
    │   ├── BatchMintingService.test.ts
    │   ├── DASClient.test.ts
    │   ├── MetadataCache.test.ts
    │   ├── PaymentIntegration.test.ts
    │   ├── RPCManager.test.ts
    │   ├── RealCompressedNFT.test.ts
    │   ├── ReconciliationService.test.ts
    │   └── blockchain.service.test.ts
    ├── config/
    │   ├── database.test.ts
    │   ├── redis.test.ts
    │   ├── solana.test.ts
    │   ├── secrets.test.ts
    │   ├── ipfs.test.ts
    │   └── wallet-provider.test.ts
    └── index.test.ts
```

---

## Appendix B: Environment Variables for Testing

```bash
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5432/minting_test
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=test-secret-minimum-32-characters-long
INTERNAL_SERVICE_SECRET=test-internal-secret-32-chars-min
WEBHOOK_SECRET=test-webhook-secret-32-chars-minimum
SOLANA_RPC_URL=https://api.devnet.solana.com
WALLET_PATH=./test-wallet.json
PINATA_JWT=test-pinata-jwt
MIN_SOL_BALANCE=0.01
MINTING_SERVICE_PORT=3018
MINT_CONCURRENCY=5
MAX_QUEUE_SIZE=10000
QUEUE_HIGH_WATER_MARK=5000
```

---

## Appendix C: Mock Requirements

### Required Mocks

| Dependency | Mock Strategy |
|------------|---------------|
| `@solana/web3.js` | Mock Connection, PublicKey, Keypair |
| `@metaplex-foundation/umi` | Mock Umi instance, Bubblegum |
| `pg` / `knex` | Mock query builder, use test DB |
| `ioredis` | Use `ioredis-mock` or mock manually |
| `bull` | Mock Queue and Job types |
| `jsonwebtoken` | Mock sign/verify functions |
| `node-fetch` / `axios` | Mock HTTP requests for IPFS |
| `redlock` | Mock lock acquisition/release |
| `opossum` | Mock circuit breaker states |

---

## Changelog

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-13 | Initial | Created comprehensive unit test plan |
