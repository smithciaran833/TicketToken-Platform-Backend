# Configuration Management & Secrets Handling
## Production Readiness Audit Document for TicketToken

**Platform:** Blockchain-based ticketing with Solana NFTs, Stripe payments, multi-tenant SaaS  
**Stack:** Node.js, TypeScript, Fastify, PostgreSQL, Redis, Docker, 23 microservices

---

## 1. Standards & Best Practices

### 1.1 Environment Variable Management

**Industry Standards:**

- **12-Factor App Methodology**: Store configuration in environment variables, maintaining strict separation between config and code. Config varies between deploys; code does not.
- **Per-Environment Configuration**: Use separate `.env` files for each environment (`.env.development`, `.env.staging`, `.env.production`). Load dynamically based on `NODE_ENV`.
- **Never Commit `.env` Files**: Add all `.env` files to `.gitignore`. Create `.env.example` with placeholder values for documentation.

**Node.js Best Practices:**

- Use validation libraries at startup: `envalid`, `zod`, or `joi` to validate and type-check all environment variables before the application starts.
- Fail fast: If required variables are missing or malformed, crash immediately with a clear error message.
- Centralize configuration: Create a single `config.ts` module that exports validated, typed configuration.

*Sources: [Clerk Blog - Environment Variables in Node.js](https://clerk.com/blog/how-to-set-environment-variables-in-nodejs), [envalid on npm](https://www.npmjs.com/package/envalid), [Platformatic - Handling Environment Variables](https://blog.platformatic.dev/handling-environment-variables-in-nodejs)*

### 1.2 Secrets Management

**Centralized Secrets Management:**

Organizations should centralize secrets storage, provisioning, auditing, rotation, and management. Key solutions:

| Solution | Use Case | Key Features |
|----------|----------|--------------|
| **HashiCorp Vault** | Multi-cloud, on-prem | Dynamic secrets, encryption as a service, audit logging |
| **AWS Secrets Manager** | AWS-native | Managed rotation, RDS integration, cross-account access |
| **Docker Secrets** | Swarm/Compose | Encrypted at rest/transit, file-based access at `/run/secrets/` |

**Key Principles (OWASP):**

1. **Separation of Concerns**: Developers should not have access to production secrets
2. **Encryption at Rest**: All secrets must be encrypted in storage
3. **Encryption in Transit**: Use TLS for all secret transmission
4. **Audit Logging**: Log who accessed what secret, when, and why
5. **Least Privilege**: Grant minimum necessary access to secrets

*Sources: [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html), [HashiCorp Vault Documentation](https://developer.hashicorp.com/vault/tutorials/secrets-management), [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)*

### 1.3 Configuration Validation at Startup

**Fail-Fast Pattern:**

```typescript
// Example using envalid
import { cleanEnv, str, url, port, bool } from 'envalid';

export const config = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'staging', 'production'] }),
  DATABASE_URL: url(),
  REDIS_URL: url(),
  STRIPE_SECRET_KEY: str(),
  STRIPE_WEBHOOK_SECRET: str(),
  JWT_PRIVATE_KEY: str(),
  SOLANA_CLUSTER: str({ choices: ['devnet', 'testnet', 'mainnet-beta'] }),
  PORT: port({ default: 3000 }),
});
```

**Benefits:**

- Application won't start with missing or invalid configuration
- Type safety in TypeScript
- Executable documentation of required variables
- Immutable configuration after validation

*Sources: [GitHub - envalid](https://github.com/af/envalid), [Dev.to - Environment Variables with Zod](https://dev.to/roshan_ican/validating-environment-variables-in-nodejs-with-zod-2epn)*

### 1.4 Feature Flags

**Best Practices (LaunchDarkly):**

- **Separate feature flags from secrets management**: Flags control features, not credentials
- **Use dedicated platforms**: LaunchDarkly, Unleash, or AWS AppConfig
- **Naming conventions**: Clear, descriptive names to avoid cross-team confusion
- **Flag lifecycle management**: Distinguish temporary (release) flags from permanent (kill switch) flags
- **Remove stale flags**: If a flag is always on or off, remove it

**When NOT to use feature flags:**

- As replacement for secrets management
- For static configuration that rarely changes
- For configuration that blocks application startup (e.g., database hostname)
- For every small commit or change

*Sources: [LaunchDarkly - Creating Flags](https://docs.launchdarkly.com/guides/flags/creating-flags), [LaunchDarkly - Feature Flags 101](https://launchdarkly.com/blog/what-are-feature-flags/), [LaunchDarkly Best Practices](https://github.com/launchdarkly/featureflags/blob/main/5%20-%20Best%20Practices.md)*

### 1.5 Per-Environment Configuration

**Environment Isolation:**

| Environment | Secrets Source | Rotation | Access |
|-------------|---------------|----------|--------|
| Development | Local `.env` file | N/A | All developers |
| Staging | Secrets manager (test keys) | Monthly | DevOps + QA |
| Production | Secrets manager (live keys) | Per policy | DevOps only |

**Key Requirements:**

- **Never share secrets across environments**: Each environment gets unique credentials
- **Use test/sandbox keys in non-production**: Stripe test keys, Solana devnet
- **Restrict production access**: Minimal personnel with production secrets access
- **Environment indicators**: Include environment name in logs and monitoring

*Sources: [OWASP SAMM - Secret Management](https://owaspsamm.org/model/implementation/secure-deployment/stream-b/), [Configu - Node.js Environment Variables](https://configu.com/blog/node-js-environment-variables-working-with-process-env-and-dotenv/)*

### 1.6 Secret Rotation

**AWS Secrets Manager Rotation:**

- Supports rotation as frequently as every 4 hours
- Two strategies: **Single user** (simpler) and **Alternating users** (higher availability)
- PCI DSS requires rotation every 90 days minimum
- Use Lambda functions for custom rotation logic

**Rotation Best Practices:**

1. **Define rotation schedule**: Document rotation frequency per secret type
2. **Automate rotation**: Manual rotation is error-prone
3. **Test rotation process**: Verify in staging before production
4. **Maintain fallback**: Old credentials should work briefly during rotation
5. **Monitor rotation**: Alert on rotation failures

**Stripe Key Rotation:**

- Live secret keys are shown only once upon creation
- Store immediately in secrets manager
- Use restricted keys for third-party integrations
- Rotate periodically and after any suspected compromise

*Sources: [AWS Secrets Manager - Rotation](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html), [AWS Rotation Schedules](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotate-secrets_schedule.html), [Stripe - API Keys Best Practices](https://docs.stripe.com/keys-best-practices)*

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Secrets in Code or Git

**The Problem:**

Hardcoded secrets in source code are the #1 cause of credential leaks. GitGuardian detected over 10 million new secrets in public GitHub commits in one year.

**Common Patterns:**

```typescript
// ❌ NEVER DO THIS
const stripeKey = "sk_live_abc123...";
const dbPassword = "production_password_123";
```

**Detection Tools:**

| Tool | Type | Integration |
|------|------|-------------|
| **git-secrets** | Pre-commit hook | Local + CI |
| **detect-secrets** | Pre-commit hook | Local + CI |
| **Gitleaks** | Scanner | CI/CD pipeline |
| **TruffleHog** | Historical scan | CI + on-demand |
| **GitHub Secret Scanning** | Platform | Automatic for public repos |

*Sources: [GitHub - git-secrets](https://github.com/awslabs/git-secrets), [GitHub - detect-secrets](https://github.com/Yelp/detect-secrets), [OWASP DevSecOps Guideline](https://owasp.org/www-project-devsecops-guideline/latest/01a-Secrets-Management)*

### 2.2 No Configuration Validation

**Symptoms:**

- Application starts but fails later when accessing undefined config
- Runtime errors instead of startup errors
- Silent failures with `undefined` values

**Real-World Impact:**

```typescript
// ❌ Fails silently, crashes later
const dbUrl = process.env.DATABASE_URL; // undefined
await knex(dbUrl).connect(); // Runtime error

// ✅ Fails immediately at startup
const config = cleanEnv(process.env, {
  DATABASE_URL: url(), // Throws if missing/invalid
});
```

*Sources: [Vance Lucas - Ensure Required ENV Variables](https://vancelucas.com/blog/ensure-required-env-variables-are-set-in-node-js/), [xjavascript.com - Environment Variable Validation](https://www.xjavascript.com/blog/how-can-i-check-if-an-environment-variable-is-set-in-node-js/)*

### 2.3 Secrets in Logs

**High-Profile Incidents:**

- **Twitter (2018)**: Logged 330 million unmasked passwords
- **Facebook (2019)**: Stored passwords in readable format
- **DreamHost (2021)**: Leaked 814 million records via unencrypted logs

**Common Leak Vectors:**

1. **Direct logging**: `logger.info(\`User token: ${token}\`)`
2. **Object logging**: Logging request/response objects containing secrets
3. **Error objects**: Stack traces with configuration data
4. **Verbose log levels**: Debug/trace in production
5. **URL logging**: Magic links, API keys in query strings

**Prevention:**

```typescript
// ❌ Leaks token
logger.info(`Auth attempt with token: ${token}`);

// ✅ Safe logging
logger.info(`Auth attempt for user: ${userId}`);
```

*Sources: [Better Stack - Sensitive Data in Logs](https://betterstack.com/community/guides/logging/sensitive-data/), [Skyflow - Keep Sensitive Data Out of Logs](https://www.skyflow.com/post/how-to-keep-sensitive-data-out-of-your-logs-nine-best-practices), [OWASP Secure Logging Benchmark](https://owasp.org/www-project-secure-logging-benchmark/)*

### 2.4 Shared Secrets Across Environments

**Risks:**

- Development breach exposes production credentials
- Harder to identify source of compromise
- Violates compliance requirements (PCI DSS, SOC 2)
- Cannot revoke without affecting all environments

**Example Violation:**

```yaml
# ❌ Same key across environments
production:
  STRIPE_KEY: sk_live_shared...
staging:
  STRIPE_KEY: sk_live_shared...  # Should be sk_test_...
```

*Sources: [OWASP SAMM](https://owaspsamm.org/model/implementation/secure-deployment/stream-b/)*

### 2.5 No Secret Rotation

**Risks of Static Secrets:**

- Longer exposure window if compromised
- Credentials accumulate in logs, backups, memory dumps
- Former employees/contractors retain access
- Non-compliant with PCI DSS, SOC 2, HIPAA

**Rotation Frequencies:**

| Secret Type | Recommended Frequency |
|-------------|----------------------|
| Database credentials | 30-90 days |
| API keys | 90 days |
| JWT signing keys | 6-12 months |
| Encryption keys | Annually |
| After suspected breach | Immediately |

*Sources: [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html), [Intelligent Discovery - Secret Rotation](https://intelligentdiscovery.io/controls/secretmanager/aws-secret-manager-secret-rotation)*

### 2.6 Missing Required Config Not Caught at Startup

**Anti-Pattern:**

```typescript
// ❌ Config accessed lazily throughout codebase
function processPayment() {
  const key = process.env.STRIPE_KEY; // First access - might be undefined
  // ...
}
```

**Correct Pattern:**

```typescript
// ✅ Single validation point at startup
// config.ts
export const config = validateConfig();

// main.ts
import { config } from './config'; // Crashes here if invalid
startServer(config);
```

*Sources: [Clerk Blog](https://clerk.com/blog/how-to-set-environment-variables-in-nodejs), [envalid documentation](https://github.com/af/envalid)*

---

## 3. Audit Checklist for TicketToken

### 3.1 Environment Configuration Checklist

#### Repository & Version Control

- [ ] **No secrets in git history**: Run `git-secrets --scan-history` or `trufflehog git file://.`
- [ ] **`.gitignore` includes all env files**: `.env`, `.env.*`, `*.pem`, `*.key`
- [ ] **`.env.example` exists**: Documents all required variables with placeholder values
- [ ] **Pre-commit hooks installed**: `git-secrets` or `detect-secrets` configured
- [ ] **CI/CD secret scanning**: Pipeline fails on detected secrets

#### Configuration Structure

- [ ] **Centralized config module exists**: Single `config.ts` or `env.ts` file
- [ ] **Validation at startup**: Using `envalid`, `zod`, or `joi`
- [ ] **Type-safe configuration**: TypeScript types for all config values
- [ ] **Application fails fast**: Missing/invalid config crashes at startup, not runtime
- [ ] **No `process.env` scattered in code**: All access through validated config object

#### Per-Environment Separation

- [ ] **Unique secrets per environment**: Dev, staging, production have different credentials
- [ ] **Test keys in non-production**: Stripe test keys (`sk_test_`), Solana devnet
- [ ] **Environment indicator in logs**: Easy to identify which environment is running
- [ ] **Production access restricted**: Limited personnel with production config access

### 3.2 Secrets Handling Checklist

#### Stripe Keys (Critical for Payment Platform)

- [ ] **Secret keys in secrets manager**: Not in `.env` files in production
- [ ] **Never in client-side code**: Only publishable keys (`pk_`) on frontend
- [ ] **Restricted keys for limited use cases**: Create restricted keys for third-party access
- [ ] **Webhook secrets stored securely**: `STRIPE_WEBHOOK_SECRET` in secrets manager
- [ ] **Test vs live key separation**: `sk_test_` in dev/staging, `sk_live_` only in production
- [ ] **Rotation procedure documented**: Process to rotate keys without downtime
- [ ] **Audit API request logs**: Monitor for unusual patterns

*Reference: [Stripe Keys Best Practices](https://docs.stripe.com/keys-best-practices)*

#### Solana Wallet Keypairs (Critical for NFT Minting)

- [ ] **Keypairs not in source code**: JSON keypair files excluded from git
- [ ] **Production keypairs in HSM or secrets manager**: Not in file system
- [ ] **Separate keypairs per environment**: Devnet wallet ≠ mainnet wallet
- [ ] **Minimal SOL in hot wallet**: Only enough for operations
- [ ] **Keypair backup secured**: Offline backup of production keypair
- [ ] **Access logging for wallet operations**: Track all signing operations

*Reference: [Solana File System Wallet Docs](https://docs.solana.com/wallet-guide/file-system-wallet) - "File system wallets are the least secure method"*

#### JWT Secrets

- [ ] **RS256 private key secured**: In secrets manager, not file system
- [ ] **Key rotation procedure**: Can rotate without invalidating all sessions
- [ ] **Different keys per environment**: Dev JWT key ≠ production JWT key
- [ ] **Public key accessible for validation**: Separate from private key storage
- [ ] **Key length adequate**: RSA 2048-bit minimum, 4096-bit recommended

#### Database Credentials

- [ ] **Connection strings in secrets manager**: Not hardcoded
- [ ] **Unique credentials per service**: Each microservice has own DB user
- [ ] **Least privilege access**: Services only have needed permissions
- [ ] **Rotation enabled**: Automated credential rotation
- [ ] **SSL/TLS required**: `?sslmode=require` in connection string

#### Redis Credentials

- [ ] **AUTH password set**: Redis not accessible without authentication
- [ ] **TLS enabled**: Encrypted connections to Redis
- [ ] **Credentials in secrets manager**: Not in plain config files

### 3.3 Docker & Container Secrets Checklist

#### Build-Time Security

- [ ] **No secrets in Dockerfile**: No `ARG` or `ENV` with secret values
- [ ] **BuildKit secrets used**: `--secret` flag for build-time secrets
- [ ] **Multi-stage builds**: Secrets don't persist in final image
- [ ] **No secrets in image layers**: `docker history` shows no secrets

```dockerfile
# ✅ Correct: Using BuildKit secrets
RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN=$(cat /run/secrets/npm_token) npm install
```

#### Runtime Security

- [ ] **Docker secrets or mounted files**: Preferred over environment variables
- [ ] **Secrets at `/run/secrets/`**: File-based secret access
- [ ] **No secrets in `docker-compose.yml`**: Use external secrets
- [ ] **Environment variables minimized**: Only non-sensitive config

```yaml
# ✅ Correct: External secrets reference
services:
  api:
    secrets:
      - stripe_key
    environment:
      - NODE_ENV=production
secrets:
  stripe_key:
    external: true
```

*Sources: [Docker Secrets Documentation](https://docs.docker.com/engine/swarm/secrets/), [Spacelift - Docker Secrets](https://spacelift.io/blog/docker-secrets), [GitGuardian - Secrets in Docker](https://blog.gitguardian.com/how-to-handle-secrets-in-docker/)*

### 3.4 Logging Security Checklist

#### Prevention

- [ ] **No secrets in log statements**: Code review for `logger.*` calls
- [ ] **Request/response logging sanitized**: Headers, bodies filtered
- [ ] **Error logging safe**: Stack traces don't include secrets
- [ ] **Log level appropriate**: No DEBUG/TRACE in production
- [ ] **URL logging safe**: No tokens in logged URLs

#### Detection

- [ ] **Log output tested**: Unit tests check for secret patterns in logs
- [ ] **Log formatters configured**: Middleware to redact sensitive patterns
- [ ] **Log scanning enabled**: Automated detection of leaked secrets

```typescript
// Example: Pino redaction
const logger = pino({
  redact: {
    paths: ['req.headers.authorization', 'req.body.password', 'req.body.token'],
    censor: '[REDACTED]'
  }
});
```

*Sources: [OWASP Secure Logging Benchmark](https://owasp.org/www-project-secure-logging-benchmark/), [GitGuardian - Keeping Secrets Out of Logs](https://blog.gitguardian.com/keeping-secrets-out-of-logs/)*

### 3.5 Rotation & Lifecycle Checklist

- [ ] **Rotation schedule documented**: Per secret type
- [ ] **Rotation tested in staging**: Before production
- [ ] **Rotation automated**: Lambda functions or scheduled jobs
- [ ] **Rotation monitoring**: Alerts on failure
- [ ] **Rollback procedure exists**: Can revert to previous secret if needed
- [ ] **Incident response plan**: Immediate rotation after suspected breach

### 3.6 Feature Flags Checklist (If Applicable)

- [ ] **Feature flags not used for secrets**: Separate from secrets management
- [ ] **Flag naming convention**: Clear, team-specific prefixes
- [ ] **Stale flag cleanup process**: Regular removal of unused flags
- [ ] **Flag access controls**: Different permissions per environment
- [ ] **Default values safe**: Flags fail closed, not open

---

## 4. Verification Commands

### Scan Repository for Secrets

```bash
# Install and run git-secrets
git secrets --install
git secrets --register-aws
git secrets --scan

# Scan with Gitleaks
gitleaks detect --source . --verbose

# Scan with TruffleHog
trufflehog git file://. --since-commit HEAD~50

# Scan with detect-secrets
detect-secrets scan > .secrets.baseline
```

### Verify Docker Image for Secrets

```bash
# Check image history for secrets
docker history --no-trunc <image>

# Scan with Trivy
trivy image <image>

# Extract and search filesystem
docker save <image> | tar -xf -
grep -r "sk_live\|password\|secret" .
```

### Validate Environment Configuration

```bash
# Check required variables exist
node -e "require('./config')" && echo "Config valid" || echo "Config invalid"

# List undefined required variables
node -e "
const required = ['DATABASE_URL', 'STRIPE_SECRET_KEY', 'JWT_PRIVATE_KEY'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) { console.error('Missing:', missing); process.exit(1); }
"
```

---

## 5. Quick Reference: Secret Types for TicketToken

| Secret | Storage Location | Rotation | Notes |
|--------|-----------------|----------|-------|
| `STRIPE_SECRET_KEY` | Secrets Manager | 90 days | Use restricted keys where possible |
| `STRIPE_WEBHOOK_SECRET` | Secrets Manager | On key rotation | Per-endpoint secrets |
| `SOLANA_KEYPAIR` | HSM/Secrets Manager | Annually | Consider multisig for production |
| `JWT_PRIVATE_KEY` | Secrets Manager | 6-12 months | RS256 2048-bit minimum |
| `DATABASE_URL` | Secrets Manager | 30-90 days | Unique per microservice |
| `REDIS_PASSWORD` | Secrets Manager | 90 days | TLS required |
| `POSTGRES_PASSWORD` | Secrets Manager | 30-90 days | Automated rotation |

---

## 6. Implementation Priority

### Phase 1: Critical (Week 1)

1. Run secret scanning on entire git history
2. Implement configuration validation at startup
3. Move Stripe live keys to secrets manager
4. Add pre-commit hooks for secret detection

### Phase 2: High (Week 2-3)

1. Migrate all production secrets to secrets manager
2. Implement log sanitization
3. Set up unique credentials per environment
4. Document rotation procedures

### Phase 3: Medium (Month 1)

1. Automate secret rotation
2. Implement feature flag system (if needed)
3. Set up secret scanning in CI/CD
4. Train team on secrets handling

---

## Sources

1. [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
2. [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)
3. [HashiCorp Vault Documentation](https://developer.hashicorp.com/vault/tutorials/secrets-management)
4. [Stripe API Keys Best Practices](https://docs.stripe.com/keys-best-practices)
5. [Docker Secrets Documentation](https://docs.docker.com/engine/swarm/secrets/)
6. [GitHub - git-secrets](https://github.com/awslabs/git-secrets)
7. [GitHub - envalid](https://github.com/af/envalid)
8. [LaunchDarkly Documentation](https://docs.launchdarkly.com/guides/flags/creating-flags)
9. [OWASP Secure Logging Benchmark](https://owasp.org/www-project-secure-logging-benchmark/)
10. [Solana File System Wallet Guide](https://docs.solana.com/wallet-guide/file-system-wallet)
11. [GitGuardian - Secrets in Docker](https://blog.gitguardian.com/how-to-handle-secrets-in-docker/)
12. [Better Stack - Sensitive Data in Logs](https://betterstack.com/community/guides/logging/sensitive-data/)