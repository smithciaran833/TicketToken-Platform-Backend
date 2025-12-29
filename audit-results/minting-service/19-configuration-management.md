# Minting Service - 19 Configuration Management Audit

**Service:** minting-service
**Document:** 19-configuration-management.md
**Date:** 2024-12-26
**Auditor:** Cline
**Pass Rate:** 21% (7/33 checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 4 | Hardcoded DB password, Secrets manager not called, No pre-commit scanning, No DB SSL |
| HIGH | 5 | No centralized config, process.env scattered, Wallet from file, No per-service DB creds, API keys in logs |
| MEDIUM | 3 | No env-specific files, No log sanitization, No Redis TLS |
| LOW | 0 | None |

## 1. Repository & Version Control (1/5)

- No secrets in git - PARTIAL (hardcoded password!)
- .gitignore includes env - PARTIAL
- .env.example exists - PASS
- Pre-commit hooks - FAIL
- CI/CD secret scanning - FAIL

## 2. Configuration Structure (0/5)

- Centralized config module - PARTIAL
- Validation at startup - FAIL
- Type-safe configuration - FAIL
- Fails fast on missing - PARTIAL
- No scattered process.env - FAIL

## 3. Per-Environment Separation (1/3)

- Unique secrets per env - PARTIAL
- Test keys in non-prod - PASS
- Environment in logs - PARTIAL

## 4. Solana Wallet (1/5)

- Keypairs not in source - PARTIAL
- Production in HSM/secrets - FAIL
- Separate per environment - PARTIAL
- Minimal SOL in wallet - PASS
- Access logging - PARTIAL

## 5. Database Credentials (0/4)

- Connection strings secured - PARTIAL (hardcoded fallback!)
- Unique creds per service - FAIL
- SSL/TLS required - FAIL
- Credential rotation - FAIL

## 6. Redis Credentials (1/2)

- AUTH password set - PASS
- TLS enabled - FAIL

## 7. Docker/Container (0/2)

- No secrets in Dockerfile - PARTIAL
- BuildKit secrets - FAIL

## 8. Logging Security (1/3)

- No secrets in logs - PARTIAL (RPC URLs with keys)
- Request/response sanitized - FAIL
- Log level appropriate - PASS

## 9. Startup Validation (2/4)

- Solana config validated - PASS
- IPFS config validated - PASS
- Database config validated - FAIL
- All secrets validated - FAIL

## Critical Evidence

### Hardcoded Password (CRITICAL)
```typescript
// config/database.ts:9
password: process.env.DB_PASSWORD || 'TicketToken2024Secure!'
```

### Secrets Manager Not Called
```typescript
// index.ts - missing loadSecrets() call
async function main(): Promise<void> {
  // No loadSecrets() call!
  await initializeDatabase();
```

### No Database SSL
```typescript
// config/database.ts - missing ssl config
pool = new Pool({
  host: process.env.DB_HOST,
  // No ssl: true
});
```

## Critical Remediations

### P0: Remove Hardcoded Password
```typescript
// config/database.ts
password: process.env.DB_PASSWORD,
// Fail if not set
if (!process.env.DB_PASSWORD) throw new Error('DB_PASSWORD required');
```

### P0: Call Secrets Manager at Startup
```typescript
// index.ts
async function main() {
  await loadSecrets(); // Add this!
  await initializeDatabase();
}
```

### P0: Add Pre-Commit Hooks
```json
// package.json
"husky": {
  "hooks": {
    "pre-commit": "git-secrets --pre_commit_hook"
  }
}
```

### P0: Enable Database SSL
```typescript
ssl: {
  rejectUnauthorized: true,
  ca: process.env.DB_CA_CERT
}
```

### P1: Centralize Configuration
```typescript
// config/index.ts
import { cleanEnv, str, num, url } from 'envalid';

export const config = cleanEnv(process.env, {
  DB_HOST: str(),
  DB_PASSWORD: str(),
  SOLANA_RPC_URL: url(),
});
```

## Strengths

- .env.example exists with 35+ variables
- Secrets manager integration exists (not used)
- Solana/IPFS config validation functions
- Balance monitoring for wallet
- Environment configurable via env vars
- Log level configurable

Configuration Management Score: 21/100
