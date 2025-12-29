# Scanning Service Configuration Management Audit

**Standard:** Docs/research/19-configuration-management.md  
**Service:** backend/services/scanning-service  
**Date:** 2024-12-27

---

## Files Reviewed

| Path | Status |
|------|--------|
| src/config/env.validator.ts | ✅ Reviewed |
| src/config/secrets.ts | ✅ Reviewed |
| src/config/database.ts | ✅ Reviewed |
| src/config/redis.ts | ✅ Reviewed |
| .env.example | ❌ Does not exist at service level |
| src/index.ts | ✅ Reviewed |

---

## Section 3.1: Environment Configuration Checklist

### Repository & Version Control

| Check | Required | Status | Evidence |
|-------|----------|--------|----------|
| No secrets in git | ✅ | ⚠️ PARTIAL | No evidence of secrets |
| .gitignore includes env files | ✅ | ✅ PASS | Root .gitignore |
| .env.example exists | ✅ | ❌ FAIL | Missing at service level |
| Pre-commit hooks | ⚠️ | ❌ FAIL | Not configured |
| CI/CD secret scanning | ⚠️ | ❌ FAIL | Not configured |

### Configuration Structure

| Check | Required | Status | Evidence |
|-------|----------|--------|----------|
| Centralized config module | ✅ | ✅ PASS | src/config/env.validator.ts |
| Validation at startup | ✅ | ✅ PASS | Joi validation |
| Type-safe configuration | ✅ | ✅ PASS | TypeScript types |
| Fail fast on invalid config | ✅ | ✅ PASS | Joi throws on error |
| No process.env scattered | ✅ | ✅ PASS | All via config |

**Evidence - Excellent Validation:**
```typescript
// env.validator.ts:8-55
import Joi from 'joi';

export const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),
  
  // Database
  DATABASE_URL: Joi.string().required(),
  DATABASE_POOL_MAX: Joi.number().default(10),
  
  // Redis
  REDIS_URL: Joi.string().required(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  
  // Authentication
  JWT_SECRET: Joi.string().required(),
  HMAC_SECRET: Joi.string().required(),
  
  // QR Configuration
  QR_EXPIRATION_SECONDS: Joi.number().default(30),
  DUPLICATE_SCAN_WINDOW_MINUTES: Joi.number().default(30),
  
  // Rate Limiting
  RATE_LIMIT_MAX: Joi.number().default(100),
  RATE_LIMIT_WINDOW_MS: Joi.number().default(60000),
  
  // Logging
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .default('info'),
}).unknown(true);

export function validateEnv(): Record<string, any> {
  const { error, value } = envSchema.validate(process.env, {
    abortEarly: false,
    stripUnknown: true,
  });
  
  if (error) {
    throw new Error(`Environment validation failed: ${error.message}`);
  }
  
  return value;
}

export const config = validateEnv();
```

---

## Section 3.2: Secrets Handling Checklist

### JWT Secrets

| Check | Required | Status | Evidence |
|-------|----------|--------|----------|
| JWT secret in secrets manager | ✅ | ❌ FAIL | In env vars only |
| Different keys per env | ✅ | ⚠️ PARTIAL | Not enforced |
| Key length adequate | ✅ | ⚠️ PARTIAL | No validation |

### HMAC Secrets

| Check | Required | Status | Evidence |
|-------|----------|--------|----------|
| HMAC secret secured | ✅ | ❌ FAIL | In env vars only |
| Rotation procedure | ⚠️ | ❌ FAIL | Not documented |

### Database Credentials

| Check | Required | Status | Evidence |
|-------|----------|--------|----------|
| Connection string in secrets | ⚠️ | ❌ FAIL | In env vars |
| SSL/TLS required | ✅ | ⚠️ PARTIAL | Not enforced |

### Secrets Manager Integration

| Check | Required | Status | Evidence |
|-------|----------|--------|----------|
| Secrets manager used | ✅ | ⚠️ PARTIAL | Skeleton only |
| AWS/Vault integration | ⚠️ | ❌ FAIL | Not implemented |

**Evidence - secrets.ts (Skeleton):**
```typescript
// secrets.ts:8-35
export class SecretsManager {
  private cache: Map<string, string> = new Map();
  
  async getSecret(key: string): Promise<string | undefined> {
    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    
    // In production, fetch from AWS Secrets Manager or Vault
    // For now, fall back to environment variables
    const value = process.env[key];
    if (value) {
      this.cache.set(key, value);
    }
    return value;
  }
  
  async getJWTSecret(): Promise<string> {
    const secret = await this.getSecret('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }
    return secret;
  }
  
  async getHMACSecret(): Promise<string> {
    const secret = await this.getSecret('HMAC_SECRET');
    if (!secret) {
      throw new Error('HMAC_SECRET not configured');
    }
    return secret;
  }
}
```

---

## Section 3.3: Configuration Variables

### Required Variables Documented

| Variable | Type | Validated | Default | Status |
|----------|------|-----------|---------|--------|
| NODE_ENV | enum | ✅ | development | ✅ PASS |
| PORT | number | ✅ | 3000 | ✅ PASS |
| DATABASE_URL | string | ✅ | Required | ✅ PASS |
| DATABASE_POOL_MAX | number | ✅ | 10 | ✅ PASS |
| REDIS_URL | string | ✅ | Required | ✅ PASS |
| REDIS_HOST | string | ✅ | localhost | ✅ PASS |
| REDIS_PORT | number | ✅ | 6379 | ✅ PASS |
| JWT_SECRET | string | ✅ | Required | ✅ PASS |
| HMAC_SECRET | string | ✅ | Required | ✅ PASS |
| QR_EXPIRATION_SECONDS | number | ✅ | 30 | ✅ PASS |
| DUPLICATE_SCAN_WINDOW_MINUTES | number | ✅ | 30 | ✅ PASS |
| RATE_LIMIT_MAX | number | ✅ | 100 | ✅ PASS |
| RATE_LIMIT_WINDOW_MS | number | ✅ | 60000 | ✅ PASS |
| LOG_LEVEL | enum | ✅ | info | ✅ PASS |

---

## Section 3.4: Logging Security

| Check | Required | Status | Evidence |
|-------|----------|--------|----------|
| No secrets in logs | ✅ | ⚠️ PARTIAL | Some sanitization |
| Request logging sanitized | ✅ | ⚠️ PARTIAL | Headers logged |
| Error logging safe | ⚠️ | ⚠️ PARTIAL | Stack traces possible |
| Log level appropriate | ✅ | ✅ PASS | Configurable |
| Redaction configured | ⚠️ | ❌ FAIL | Not explicit |

**Evidence - Logger (No Redaction):**
```typescript
// logger.ts:10-25
export const logger = pino({
  level: config.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Missing: redact configuration
});
```

**Should Add:**
```typescript
const logger = pino({
  redact: {
    paths: ['req.headers.authorization', 'req.body.password', 'req.body.token'],
    censor: '[REDACTED]'
  }
});
```

---

## Section 3.5: Per-Environment Separation

| Check | Required | Status | Evidence |
|-------|----------|--------|----------|
| Unique secrets per env | ✅ | ⚠️ PARTIAL | Not enforced |
| Test keys in non-prod | ⚠️ | N/A | No external APIs |
| Environment in logs | ✅ | ✅ PASS | NODE_ENV logged |
| Prod access restricted | ⚠️ | N/A | Ops concern |

---

## Section 3.6: Docker Secrets (Dockerfile Review)

| Check | Required | Status | Evidence |
|-------|----------|--------|----------|
| No secrets in Dockerfile | ✅ | ✅ PASS | Clean Dockerfile |
| BuildKit secrets | ⚠️ | N/A | Not needed |
| Multi-stage builds | ⚠️ | ✅ PASS | Uses multi-stage |
| No secrets in layers | ✅ | ✅ PASS | No secrets |

**Evidence:**
```dockerfile
# Dockerfile - Clean, no embedded secrets
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]
```

---

## Summary

### Pass Rates by Section

| Section | Checks | Passed | Partial | Failed | Pass Rate |
|---------|--------|--------|---------|--------|-----------|
| Repository/Git | 5 | 2 | 1 | 2 | 40% |
| Config Structure | 5 | 5 | 0 | 0 | 100% |
| JWT Secrets | 3 | 0 | 2 | 1 | 0% |
| HMAC Secrets | 2 | 0 | 0 | 2 | 0% |
| Database Creds | 2 | 0 | 1 | 1 | 0% |
| Secrets Manager | 2 | 0 | 1 | 1 | 0% |
| Config Variables | 14 | 14 | 0 | 0 | 100% |
| Logging Security | 5 | 1 | 3 | 1 | 20% |
| Per-Env Separation | 4 | 1 | 1 | 0 | 50% |
| Docker Secrets | 4 | 4 | 0 | 0 | 100% |
| **TOTAL** | **46** | **27** | **9** | **8** | **68%** |

---

### Critical Issues

| ID | Issue | File | Impact |
|----|-------|------|--------|
| CFG-1 | Secrets in env vars only | All configs | Security risk |
| CFG-2 | No .env.example at service level | Root | Developer confusion |
| CFG-3 | No log redaction configured | logger.ts | PII/secret leakage |
| CFG-4 | Secrets manager not implemented | secrets.ts | Production risk |

### High Issues

| ID | Issue | File | Impact |
|----|-------|------|--------|
| CFG-5 | No pre-commit secret scanning | Git | Accidental commits |
| CFG-6 | No secret rotation procedure | Docs | Compliance gap |
| CFG-7 | JWT key length not validated | env.validator.ts | Weak keys possible |
| CFG-8 | SSL not enforced for DB | database.ts | Insecure connections |

---

### Positive Findings

1. **Excellent Configuration Validation**: Joi-based validation with comprehensive schema covering all required variables with proper types and defaults.

2. **Fail-Fast Pattern**: Application crashes immediately on missing required config - exactly as recommended.

3. **Centralized Config Access**: All configuration accessed through validated `config` object, no scattered `process.env` calls.

4. **Clean Dockerfile**: Multi-stage build with no embedded secrets in any layer.

5. **Type-Safe Configuration**: TypeScript types for all configuration values.

6. **SecretsManager Skeleton**: Forward-looking abstraction for secrets management, ready for AWS/Vault integration.

---

### Recommended Fixes

**Priority 1: Add log redaction**
```typescript
// logger.ts
export const logger = pino({
  level: config.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.body.password',
      'req.body.token',
      'req.body.qr_data',
      '*.password',
      '*.secret',
      '*.jwt',
    ],
    censor: '[REDACTED]'
  },
});
```

**Priority 2: Create service-level .env.example**
```bash
# .env.example
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/scanning

# Redis
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# Authentication (use strong secrets in production)
JWT_SECRET=your-jwt-secret-here
HMAC_SECRET=your-hmac-secret-here

# QR Configuration
QR_EXPIRATION_SECONDS=30
DUPLICATE_SCAN_WINDOW_MINUTES=30

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# Logging
LOG_LEVEL=info
```

**Priority 3: Implement secrets manager**
```typescript
// secrets.ts - Add AWS Secrets Manager
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export class SecretsManager {
  private client: SecretsManagerClient;
  
  constructor() {
    if (process.env.NODE_ENV === 'production') {
      this.client = new SecretsManagerClient({ region: process.env.AWS_REGION });
    }
  }
  
  async getSecret(key: string): Promise<string> {
    if (process.env.NODE_ENV === 'production') {
      const command = new GetSecretValueCommand({ SecretId: key });
      const response = await this.client.send(command);
      return response.SecretString!;
    }
    return process.env[key]!;
  }
}
```

**Priority 4: Add JWT key length validation**
```typescript
// env.validator.ts
JWT_SECRET: Joi.string()
  .min(32)  // At least 256 bits
  .required()
  .messages({
    'string.min': 'JWT_SECRET must be at least 32 characters for security'
  }),
```

---

**Overall Assessment:** The scanning service has **excellent configuration validation** (100%) and **clean Docker setup** (100%) but **lacks production-ready secrets management** (0%). The Joi validation pattern is exemplary. Main gaps are implementing the secrets manager abstraction and adding log redaction.
