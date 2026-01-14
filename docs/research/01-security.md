# Security Audit Guide
## Authentication, Authorization, API Security, Payment Security, Blockchain Security, Data Protection

*Comprehensive Standards, Vulnerabilities, and Audit Checklist*
*Last Updated: December 2025*

---

## Table of Contents

1. [Standards & Best Practices](#1-standards--best-practices)
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist by Layer](#3-audit-checklist-by-layer)
4. [Sources & References](#4-sources--references)

---

## 1. Standards & Best Practices

### 1.1 Authentication

#### JWT (JSON Web Tokens)

JWTs are widely used for API authentication but require careful implementation:

**Security Requirements:**
- **Always verify signatures** — Use `jwt.verify()`, never `jwt.decode()` alone
- **Reject `alg: none`** — Explicitly whitelist allowed algorithms (RS256, ES256)
- **Validate all claims**: `iss` (issuer), `aud` (audience), `exp` (expiration), `nbf` (not before)
- **Use strong secrets** — Minimum 256-bit keys for HMAC; use asymmetric keys (RSA/ECDSA) for distributed systems
- **Short expiration times** — Access tokens: 15-60 minutes; use refresh tokens for longer sessions
- **Implement token revocation** — Use denylist or short-lived tokens with refresh mechanism

*Source: [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)*

**Token Storage:**
- Store in memory (preferred) or HttpOnly cookies
- Never store in localStorage (XSS vulnerable)
- Use `Secure` and `SameSite=Strict` cookie attributes

*Source: [OWASP JSON Web Token Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)*

#### Session Management

- Regenerate session ID after successful authentication
- Invalidate sessions on logout (server-side)
- Set appropriate session timeouts
- Use secure, random session identifiers (minimum 128-bit entropy)
- Bind sessions to user context (IP, user-agent fingerprint)

*Source: [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)*

#### OAuth 2.0 / OpenID Connect

**Best Practices:**
- Use OAuth 2.1 or OAuth 2.0 with PKCE (Proof Key for Code Exchange) for all clients
- Use OpenID Connect (OIDC) for authentication, OAuth for authorization
- Validate ID Tokens: issuer, audience, signature, expiration
- Use `state` parameter to prevent CSRF attacks
- Implement audience restriction for access tokens
- Use sender-constrained tokens (DPoP or mTLS) where possible

*Source: [OWASP OAuth2 Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html)*

#### Multi-Factor Authentication (MFA)

MFA stops 99.9% of account compromises according to Microsoft's analysis.

**Implementation Requirements:**
- Require MFA for all users (minimum for admins)
- Support TOTP (Time-based One-Time Password) authenticators
- Consider FIDO2/WebAuthn for phishing-resistant authentication
- Implement secure MFA reset procedures
- Require MFA for sensitive operations (password change, email update)

*Source: [OWASP Multifactor Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)*

---

### 1.2 Authorization

#### Role-Based Access Control (RBAC)

- Assign permissions to roles, not individual users
- Implement role hierarchy with inheritance
- Apply principle of least privilege
- Regular access reviews and role cleanup

*Source: [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)*

#### Attribute-Based Access Control (ABAC)

ABAC is preferred over RBAC for complex applications:
- Supports fine-grained, context-aware decisions
- Considers multiple attributes (user, resource, environment)
- Better for multi-tenant and cross-organizational access
- More scalable for complex permission structures

*Source: [NIST SP 800-162 ABAC Guide](https://csrc.nist.gov/publications/detail/sp/800-162/final)*

#### Object-Level Authorization (BOLA Prevention)

BOLA (Broken Object Level Authorization) is the #1 API security risk (OWASP API Top 10).

**Requirements:**
- Verify user owns/has access to every object accessed
- Check authorization on EVERY request, not just at login
- Never trust client-provided IDs without server-side validation
- Implement authorization at the data layer, not just route layer

```typescript
// BAD: No ownership check
const order = await Order.findById(req.params.orderId);

// GOOD: Ownership verification
const order = await Order.findOne({ 
  _id: req.params.orderId, 
  userId: req.user.id 
});
if (!order) throw new ForbiddenError();
```

*Source: [OWASP API Security Top 10 - API1:2023](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)*

#### Function-Level Authorization (BFLA Prevention)

- Separate administrative and user functions
- Deny by default; explicitly grant access
- Implement authorization checks for every function/endpoint
- Use consistent authorization logic across all endpoints

*Source: [OWASP API Security Top 10 - API5:2023](https://owasp.org/API-Security/editions/2023/en/0xa5-broken-function-level-authorization/)*

---

### 1.3 Password Hashing

#### Algorithm Hierarchy (OWASP Recommended)

| Priority | Algorithm | Configuration |
|----------|-----------|---------------|
| 1st | **Argon2id** | 19 MiB memory, 2 iterations, 1 parallelism |
| 2nd | **scrypt** | N=2^17, r=8, p=1 |
| 3rd | **bcrypt** | Work factor ≥10, 72-byte password limit |
| FIPS | **PBKDF2** | 600,000+ iterations, HMAC-SHA-256 |

*Source: [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)*

#### Implementation Requirements

- **Never use**: MD5, SHA-1, SHA-256 (without key stretching), plain text
- **Automatic salting**: Modern algorithms (Argon2, bcrypt, scrypt) salt automatically
- **Pepper**: Optional additional secret stored outside database (in vault/HSM)
- **Password limits**: Allow up to 64+ characters; don't silently truncate
- **Timing-safe comparison**: Use constant-time comparison functions

```typescript
// Node.js example with Argon2id
import argon2 from 'argon2';

const hash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1
});

const isValid = await argon2.verify(hash, password);
```

---

### 1.4 API Security (OWASP API Top 10 2023)

| Rank | Risk | Description |
|------|------|-------------|
| API1 | **Broken Object Level Authorization** | Missing ownership checks on object access |
| API2 | **Broken Authentication** | Weak auth, missing rate limiting, token issues |
| API3 | **Broken Object Property Level Authorization** | Excessive data exposure, mass assignment |
| API4 | **Unrestricted Resource Consumption** | Missing rate/size limits, DoS vulnerabilities |
| API5 | **Broken Function Level Authorization** | Missing admin/user function separation |
| API6 | **Unrestricted Access to Sensitive Business Flows** | Business logic abuse through automation |
| API7 | **Server Side Request Forgery (SSRF)** | Unsafe URL fetching without validation |
| API8 | **Security Misconfiguration** | Default configs, verbose errors, missing headers |
| API9 | **Improper Inventory Management** | Outdated/undocumented API versions exposed |
| API10 | **Unsafe Consumption of APIs** | Trusting third-party API responses blindly |

*Source: [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x00-header/)*

#### Key Mitigations

- **Rate limiting**: Implement per-user, per-IP, and per-endpoint limits
- **Input validation**: Validate all inputs; enforce schemas
- **Output filtering**: Return only required fields; use DTOs
- **Logging**: Log all API access with user context
- **Versioning**: Maintain API inventory; deprecate old versions

---

### 1.5 Payment Security (PCI-DSS & Stripe)

#### PCI-DSS Requirements for Stripe Integration

Using Stripe Elements/Checkout minimizes PCI scope (SAQ A eligible):

| Requirement | Implementation |
|-------------|----------------|
| **Never handle raw card data** | Use Stripe.js, Elements, or Checkout |
| **TLS 1.2+** | All payment pages must use HTTPS |
| **No card data in logs** | Never log PANs, CVVs, or full card numbers |
| **Secure API keys** | Store in secrets manager, not code |
| **Webhook verification** | Always verify Stripe webhook signatures |

*Source: [Stripe Security Guide](https://docs.stripe.com/security/guide)*

#### Stripe Webhook Signature Verification

**CRITICAL**: Always verify webhook signatures to prevent spoofing.

```typescript
// Node.js/Express webhook verification
import Stripe from 'stripe';
import express from 'express';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// IMPORTANT: Use raw body parser for webhook route
app.post('/webhook', 
  express.raw({ type: 'application/json' }), 
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body, 
        sig, 
        endpointSecret
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    // Handle verified event
    switch (event.type) {
      case 'payment_intent.succeeded':
        // Process payment
        break;
      // ... other events
    }
    
    res.json({ received: true });
  }
);
```

**Webhook Security Best Practices:**
- Use HTTPS for webhook endpoints
- Verify signatures before processing any event
- Use raw request body (frameworks may parse JSON and break signature)
- Implement idempotency for duplicate event handling
- Roll webhook secrets periodically
- Handle replay attacks (check timestamp tolerance, default 5 minutes)

*Source: [Stripe Webhook Documentation](https://docs.stripe.com/webhooks)*

---

### 1.6 Blockchain/Wallet Security (Solana)

#### Private Key Storage

**NEVER DO:**
- Store private keys in source code
- Store private keys in environment variables in production
- Store private keys in plaintext files
- Log private keys or seed phrases

**RECOMMENDED:**
- Use Hardware Security Modules (HSMs) for production signing
- Encrypt private keys at rest with AES-256-GCM
- Use key management services (AWS KMS, HashiCorp Vault)
- Implement multi-signature wallets for high-value operations
- Store seed phrases offline in secure physical locations

*Source: [Chainstack Private Key Security Guide](https://chainstack.com/how-to-store-private-keys-securely/)*

#### Transaction Signing Security

```typescript
// Secure transaction signing pattern
import { Keypair, Transaction, Connection } from '@solana/web3.js';
import { decrypt } from './encryption';

async function signTransaction(
  encryptedKey: string,
  transaction: Transaction
): Promise<Transaction> {
  // Decrypt key only when needed
  const privateKey = await decrypt(encryptedKey, process.env.MASTER_KEY);
  const keypair = Keypair.fromSecretKey(privateKey);
  
  // Sign transaction
  transaction.sign(keypair);
  
  // Clear sensitive data from memory
  privateKey.fill(0);
  
  return transaction;
}
```

**Best Practices:**
- Sign transactions locally, never send private keys over network
- Validate all transaction details before signing
- Implement transaction simulation before submission
- Use hardware wallets (Ledger) for high-value operations
- Implement spending limits and approval workflows

*Source: [Solana Wallet Security Best Practices](https://solana.com/docs/intro/wallets)*

---

### 1.7 Data Protection

#### Encryption at Rest

- **Standard**: AES-256 (AES-256-GCM for authenticated encryption)
- **Database**: Use Transparent Data Encryption (TDE) or field-level encryption
- **File storage**: Enable encryption for cloud storage (S3, GCS, Azure Blob)
- **Backups**: Encrypt all backup data

*Source: [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)*

#### Encryption in Transit

- **Minimum**: TLS 1.2 (prefer TLS 1.3)
- **Disable**: SSL, TLS 1.0, TLS 1.1
- **Cipher suites**: Use strong ciphers (AES-GCM, ChaCha20-Poly1305)
- **Perfect Forward Secrecy**: Use ECDHE key exchange
- **Certificate management**: Automate renewal, use short-lived certificates

*Source: [Mozilla TLS Configuration](https://ssl-config.mozilla.org/)*

#### Secrets Management

**Requirements (OWASP):**
- Use dedicated secrets management (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault)
- Never store secrets in code, config files, or environment variables (if avoidable)
- Implement secret rotation
- Audit all secret access
- Use short-lived, dynamic secrets where possible

*Source: [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)*

**Environment Variables Warning:**
> "Environment variables are generally accessible to all processes and may be included in logs or system dumps. Using environment variables is therefore not recommended unless the other methods are not possible."
> — OWASP Secrets Management Cheat Sheet

**Preferred Methods:**
1. Secrets manager (Vault, AWS Secrets Manager)
2. Sidecar injection (Vault Agent, Kubernetes secrets)
3. Encrypted files with restricted permissions
4. Environment variables (last resort, process-scoped only)

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Broken Authentication & Session Management

| Vulnerability | Impact | Fix |
|--------------|--------|-----|
| No signature verification on JWTs | Token forgery, privilege escalation | Always use `jwt.verify()` with secret |
| Accepting `alg: none` | Complete auth bypass | Whitelist allowed algorithms |
| Weak/hardcoded JWT secrets | Token forgery via brute force | Use 256+ bit random secrets |
| Missing token expiration | Indefinite session hijacking | Set short `exp` claims |
| Session ID in URL | Session leakage via referrer | Use cookies only |
| No session invalidation on logout | Persistent unauthorized access | Implement server-side session revocation |
| Password reset tokens don't expire | Account takeover | Short expiration (15-60 min) |

*Source: [OWASP Testing Guide - Authentication](https://owasp.org/www-project-web-security-testing-guide/)*

### 2.2 Broken Access Control (BOLA/BFLA)

**BOLA (Broken Object Level Authorization):**
```typescript
// VULNERABLE: No ownership check
app.get('/api/orders/:id', async (req, res) => {
  const order = await Order.findById(req.params.id);
  res.json(order); // Any user can access any order!
});

// SECURE: Ownership verified
app.get('/api/orders/:id', async (req, res) => {
  const order = await Order.findOne({
    _id: req.params.id,
    userId: req.user.id // User can only access own orders
  });
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json(order);
});
```

**BFLA (Broken Function Level Authorization):**
```typescript
// VULNERABLE: No role check
app.delete('/api/users/:id', async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ success: true }); // Any user can delete any user!
});

// SECURE: Admin role required
app.delete('/api/users/:id', requireRole('admin'), async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});
```

*Source: [OWASP API Security Top 10](https://owasp.org/API-Security/)*

### 2.3 Missing Webhook Signature Verification

**VULNERABLE:**
```typescript
// DANGEROUS: No signature verification
app.post('/webhook/stripe', express.json(), async (req, res) => {
  const event = req.body; // Attacker can send any event!
  await processPayment(event.data.object);
  res.json({ received: true });
});
```

**SECURE:**
```typescript
// CORRECT: Signature verified
app.post('/webhook/stripe', 
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    
    try {
      event = stripe.webhooks.constructEvent(
        req.body, sig, process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return res.status(400).send('Invalid signature');
    }
    
    await processPayment(event.data.object);
    res.json({ received: true });
  }
);
```

*Source: [Stripe Webhook Signature Verification](https://docs.stripe.com/webhooks/signature)*

### 2.4 Secrets in Code or Logs

**Common Mistakes:**
```typescript
// BAD: Hardcoded secrets
const stripe = new Stripe('sk_live_abc123...');
const jwtSecret = 'my-super-secret-key';

// BAD: Secrets in logs
console.log('User login:', { email, password });
console.log('API Key:', process.env.API_KEY);

// BAD: Secrets in error messages
throw new Error(`Database connection failed: ${connectionString}`);
```

**Correct Approach:**
```typescript
// GOOD: Secrets from vault/manager
const stripe = new Stripe(await vault.getSecret('stripe/secret-key'));

// GOOD: Sanitized logging
console.log('User login:', { email, password: '[REDACTED]' });

// GOOD: Generic error messages
throw new Error('Database connection failed');
// Log details separately with proper masking
```

*Source: [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)*

### 2.5 Weak JWT Implementation

| Issue | Example | Fix |
|-------|---------|-----|
| Algorithm confusion | Accepting HS256 when RS256 expected | Explicitly set expected algorithm |
| None algorithm | `{"alg":"none"}` accepted | Reject none algorithm |
| Weak secrets | `secret`, `password123` | Use cryptographically random 256+ bit keys |
| No expiration | Missing `exp` claim | Always set and validate expiration |
| No audience validation | Token used across services | Validate `aud` claim |
| Sensitive data in payload | PII, passwords in claims | Only store IDs, keep data minimal |

*Source: [OWASP JWT Testing](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/06-Session_Management_Testing/10-Testing_JSON_Web_Tokens)*

### 2.6 Missing Rate Limiting on Auth Endpoints

**Vulnerable Endpoints:**
- `/login`, `/signin`
- `/register`, `/signup`
- `/forgot-password`
- `/reset-password`
- `/verify-email`
- `/resend-verification`
- `/oauth/token`

**Required Protections:**
```typescript
import rateLimit from 'express-rate-limit';

// Strict rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/auth/login', authLimiter);
app.use('/auth/forgot-password', authLimiter);
```

**Additional Measures:**
- Account lockout after N failed attempts
- Exponential backoff
- CAPTCHA after failed attempts
- Device/browser fingerprinting
- Notification of failed login attempts

*Source: [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)*

### 2.7 Insecure Password Storage

| BAD Practice | Why It's Bad |
|--------------|--------------|
| Plain text storage | Immediate compromise on breach |
| MD5 hashing | Cracked in seconds |
| SHA-256 (unsalted) | Rainbow table attacks |
| SHA-256 (salted, no stretching) | GPU attacks feasible |
| Bcrypt with low work factor (<10) | Too fast to compute |
| Homegrown hashing | Unknown vulnerabilities |

**Detection Commands:**
```bash
# Find potential plaintext password storage
grep -rn "password.*=.*['\"]" --include="*.ts" --include="*.js"

# Find weak hashing
grep -rn "crypto.createHash\|md5\|sha1\|sha256" --include="*.ts" --include="*.js"

# Find if bcrypt/argon2 is used
grep -rn "argon2\|bcrypt" --include="*.ts" --include="*.js" --include="package.json"
```

---

## 3. Audit Checklist by Layer

### 3.1 Route Layer

#### Authentication Middleware

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| SEC-R1 | All protected routes use auth middleware | CRITICAL | `grep -rn "router\.\(get\|post\|put\|delete\|patch\)" --include="*.ts" \| grep -v "authenticate\|requireAuth\|protect"` |
| SEC-R2 | Auth middleware verifies JWT signature | CRITICAL | `grep -rn "jwt.verify\|verifyToken" --include="*.ts"` — should exist; `grep -rn "jwt.decode" --include="*.ts"` — should NOT be used for auth |
| SEC-R3 | JWT algorithm explicitly specified | HIGH | `grep -rn "algorithms.*\[" --include="*.ts"` — verify algorithm whitelist exists |
| SEC-R4 | Token expiration validated | HIGH | `grep -rn "exp\|expiresIn" --include="*.ts"` — verify expiration is set and checked |
| SEC-R5 | Auth middleware rejects expired tokens | HIGH | Manual: Test with expired JWT, should return 401 |
| SEC-R6 | No auth secrets hardcoded | CRITICAL | `grep -rn "JWT_SECRET.*=.*['\"]" --include="*.ts" --include="*.env"` — should only find env references |

#### Rate Limiting

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| SEC-R7 | Rate limiting on login endpoint | CRITICAL | `grep -rn "rateLimit\|RateLimiter" --include="*.ts"` in auth routes |
| SEC-R8 | Rate limiting on password reset | CRITICAL | Check `/forgot-password`, `/reset-password` routes |
| SEC-R9 | Rate limiting on registration | HIGH | Check `/register`, `/signup` routes |
| SEC-R10 | Rate limits are appropriately strict | HIGH | Manual: Verify ≤10 attempts per 15 minutes for auth |
| SEC-R11 | Account lockout after failed attempts | HIGH | `grep -rn "lockout\|failedAttempts\|loginAttempts" --include="*.ts"` |
| SEC-R12 | General API rate limiting exists | MEDIUM | `grep -rn "app.use.*rateLimit" --include="*.ts"` |

#### HTTPS/TLS

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| SEC-R13 | HTTPS enforced in production | CRITICAL | `grep -rn "forceHttps\|requireHttps\|redirect.*https" --include="*.ts"` |
| SEC-R14 | HSTS header enabled | HIGH | `grep -rn "Strict-Transport-Security\|helmet\|hsts" --include="*.ts"` |
| SEC-R15 | Secure cookies configured | HIGH | `grep -rn "secure.*true\|httpOnly.*true\|sameSite" --include="*.ts"` |
| SEC-R16 | TLS 1.2+ required | HIGH | Check server/load balancer config; `nmap --script ssl-enum-ciphers -p 443 <host>` |

---

### 3.2 Service Layer

#### Authorization Checks

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| SEC-S1 | Object ownership verified before access | CRITICAL | `grep -rn "findById\|findOne.*_id" --include="*.ts"` — verify userId/ownerId in query |
| SEC-S2 | No direct ID from request without validation | CRITICAL | `grep -rn "req.params\|req.body.*[iI]d" --include="*.ts"` — verify authorization follows |
| SEC-S3 | Admin functions check admin role | CRITICAL | `grep -rn "delete\|destroy\|admin" --include="*.ts"` in routes — verify role check |
| SEC-S4 | Role-based middleware applied correctly | HIGH | `grep -rn "requireRole\|hasRole\|authorize" --include="*.ts"` |
| SEC-S5 | Multi-tenant data isolation | CRITICAL | `grep -rn "tenantId\|organizationId" --include="*.ts"` — verify in all queries |
| SEC-S6 | Deny by default authorization | HIGH | Check default return is denied unless explicitly allowed |

#### Ownership Verification Pattern

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| SEC-S7 | Orders accessible only by owner | CRITICAL | Review Order service — must filter by userId |
| SEC-S8 | Tickets accessible only by owner | CRITICAL | Review Ticket service — must filter by userId |
| SEC-S9 | Payment methods owned by user | CRITICAL | Review Payment service — verify ownership |
| SEC-S10 | User can only modify own profile | HIGH | Review User update endpoints |
| SEC-S11 | Wallet operations verify ownership | CRITICAL | Review Wallet service — verify wallet ownership |

#### Input Validation in Services

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| SEC-S12 | Services validate input before processing | HIGH | `grep -rn "validate\|schema\|zod\|joi\|yup" --include="*.ts"` in service files |
| SEC-S13 | No SQL/NoSQL injection vectors | CRITICAL | `grep -rn "\$where\|eval\|exec\|\`\${" --include="*.ts"` |
| SEC-S14 | Sensitive operations require re-auth | HIGH | Password change, email change, 2FA disable require current password |

---

### 3.3 Database Layer

#### Encryption

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| SEC-DB1 | Database connection uses TLS | CRITICAL | `grep -rn "ssl.*true\|sslmode.*require" --include="*.ts" --include="*.env"` |
| SEC-DB2 | Encryption at rest enabled | HIGH | Check database provider settings (RDS, Atlas, etc.) |
| SEC-DB3 | Passwords hashed with Argon2id/bcrypt | CRITICAL | `grep -rn "argon2\|bcrypt" --include="*.ts"` in user/auth services |
| SEC-DB4 | No plaintext passwords stored | CRITICAL | `grep -rn "password.*String\|password.*varchar" --include="*.ts" --include="*.prisma"` — should be hash |
| SEC-DB5 | Sensitive fields encrypted (SSN, etc.) | HIGH | Check for field-level encryption on PII |
| SEC-DB6 | API keys/tokens hashed in database | HIGH | `grep -rn "apiKey\|token" --include="*.prisma" --include="*.ts"` — verify hashing |

#### Audit Logging

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| SEC-DB7 | Authentication events logged | HIGH | `grep -rn "log.*login\|log.*auth\|audit" --include="*.ts"` |
| SEC-DB8 | Authorization failures logged | HIGH | Verify 403 responses are logged with context |
| SEC-DB9 | Data access logged for sensitive resources | MEDIUM | Check audit trail for PII access |
| SEC-DB10 | Logs don't contain sensitive data | CRITICAL | `grep -rn "console.log.*password\|logger.*secret" --include="*.ts"` — should be empty |
| SEC-DB11 | Log retention policy implemented | MEDIUM | Check log configuration for rotation/retention |

---

### 3.4 External Integrations

#### Stripe Webhooks

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| SEC-EXT1 | Webhook signature verified | CRITICAL | `grep -rn "webhooks.constructEvent\|stripe-signature" --include="*.ts"` |
| SEC-EXT2 | Raw body used for verification | CRITICAL | `grep -rn "express.raw\|bodyParser.raw" --include="*.ts"` near webhook route |
| SEC-EXT3 | Webhook secret from environment | CRITICAL | `grep -rn "STRIPE_WEBHOOK_SECRET\|whsec_" --include="*.ts"` — should reference env |
| SEC-EXT4 | Webhook events idempotently processed | HIGH | `grep -rn "event.id\|idempotency\|processedEvents" --include="*.ts"` |
| SEC-EXT5 | Failed verification returns 400 | HIGH | Check webhook handler error responses |
| SEC-EXT6 | Stripe API key not hardcoded | CRITICAL | `grep -rn "sk_live\|sk_test" --include="*.ts"` — should only be in .env.example |

#### Solana/Blockchain Keys

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| SEC-EXT7 | Private keys not in source code | CRITICAL | `grep -rn "privateKey\|secretKey.*\[" --include="*.ts" --include="*.json"` |
| SEC-EXT8 | Private keys encrypted at rest | CRITICAL | Check key storage mechanism uses encryption |
| SEC-EXT9 | Keys loaded from secure storage | CRITICAL | `grep -rn "vault\|secretsManager\|keyVault" --include="*.ts"` |
| SEC-EXT10 | Transaction signing is local | HIGH | Verify private keys never sent over network |
| SEC-EXT11 | Spending limits implemented | HIGH | Check for transaction amount limits |
| SEC-EXT12 | Multi-sig for high-value ops | HIGH | Check multi-signature implementation for treasury |

#### Secrets Management

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| SEC-EXT13 | No secrets in git history | CRITICAL | `git log -p --all -S "sk_live\|SECRET_KEY\|private" -- '*.ts' '*.env'` |
| SEC-EXT14 | .env files in .gitignore | CRITICAL | `grep ".env" .gitignore` |
| SEC-EXT15 | Secrets manager used | HIGH | Check for Vault, AWS SM, or similar integration |
| SEC-EXT16 | Secret rotation capability | MEDIUM | Verify secrets can be rotated without downtime |
| SEC-EXT17 | Least privilege for service accounts | HIGH | Review cloud IAM policies for services |

---

### 3.5 Quick Reference Commands

```bash
# ===========================================
# AUTHENTICATION CHECKS
# ===========================================

# Find unprotected routes
grep -rn "router\.\(get\|post\|put\|delete\|patch\)" --include="*.ts" \
  | grep -v "authenticate\|requireAuth\|protect\|public"

# Check for jwt.decode without verify (DANGEROUS)
grep -rn "jwt.decode" --include="*.ts"

# Find hardcoded secrets
grep -rn "JWT_SECRET\|API_KEY\|SECRET_KEY.*=.*['\"][^}]*['\"]" --include="*.ts"

# ===========================================
# AUTHORIZATION CHECKS
# ===========================================

# Find findById without user context (potential BOLA)
grep -rn "findById\|findByPk" --include="*.ts" | grep -v "userId\|ownerId\|req.user"

# Check for missing role checks on admin routes
grep -rn "admin\|delete.*User\|destroy" --include="*.ts" \
  | grep -v "requireRole\|isAdmin\|authorize"

# ===========================================
# PASSWORD SECURITY
# ===========================================

# Verify password hashing library used
grep -rn "bcrypt\|argon2\|scrypt" --include="*.ts" --include="package.json"

# Find potentially insecure hashing
grep -rn "md5\|sha1\|sha256" --include="*.ts" | grep -i password

# ===========================================
# WEBHOOK SECURITY
# ===========================================

# Verify Stripe signature verification
grep -rn "constructEvent\|stripe-signature" --include="*.ts"

# Check for raw body parser on webhook routes
grep -rB5 "webhook" --include="*.ts" | grep -i "raw"

# ===========================================
# SECRETS IN CODE
# ===========================================

# Find potential secrets
grep -rn "sk_live\|sk_test\|whsec_\|pk_live\|pk_test" --include="*.ts"

# Find private keys
grep -rn "PRIVATE.*KEY\|BEGIN.*PRIVATE\|secretKey" --include="*.ts" --include="*.json"

# Check git history for secrets
git log -p --all -S "sk_live" -- '*.ts' '*.js' '*.json' '*.env'

# ===========================================
# RATE LIMITING
# ===========================================

# Verify rate limiting on auth routes
grep -rn "rateLimit" --include="*.ts" | grep -i "auth\|login\|register\|password"

# Find auth routes that might need rate limiting
grep -rn "/login\|/register\|/forgot-password\|/reset-password" --include="*.ts"

# ===========================================
# ENCRYPTION
# ===========================================

# Check TLS configuration
grep -rn "ssl\|tls\|https" --include="*.ts" --include="*.env"

# Find potential plaintext storage of sensitive data
grep -rn "password.*String\|credit.*Number\|ssn.*String" --include="*.prisma" --include="*.ts"
```

---

### 3.6 Severity Guide

| Severity | Description | Response Time |
|----------|-------------|---------------|
| **CRITICAL** | Immediate exploitation possible, data breach likely | Immediate fix required |
| **HIGH** | Significant security risk, exploitation feasible | Fix within 24-48 hours |
| **MEDIUM** | Security weakness, requires specific conditions | Fix within 1 week |
| **LOW** | Minor issue, defense in depth | Fix in next sprint |

---

## 4. Sources & References

### OWASP Resources
- [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x00-header/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP JWT Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [OWASP OAuth2 Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html)
- [OWASP MFA Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
- [OWASP Blocking Brute Force Attacks](https://owasp.org/www-community/controls/Blocking_Brute_Force_Attacks)

### Payment Security
- [Stripe Security Guide](https://docs.stripe.com/security/guide)
- [Stripe Webhook Documentation](https://docs.stripe.com/webhooks)
- [Stripe Webhook Signature Verification](https://docs.stripe.com/webhooks/signature)
- [Stripe PCI Compliance Guide](https://stripe.com/guides/pci-compliance)
- [PCI DSS v4.0 Requirements](https://www.pcisecuritystandards.org/)

### Blockchain Security
- [Solana Wallet Documentation](https://solana.com/docs/intro/wallets)
- [Chainstack Private Key Security](https://chainstack.com/how-to-store-private-keys-securely/)
- [Ledger Hardware Wallet Best Practices](https://www.ledger.com/academy/topics/crypto/best-solana-wallets)

### Cryptography & Encryption
- [NIST SP 800-162 ABAC](https://csrc.nist.gov/publications/detail/sp/800-162/final)
- [NIST SP 800-63B Password Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [Mozilla TLS Configuration](https://ssl-config.mozilla.org/)
- [RFC 8725 JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)

### Tools
- [jwt.io](https://jwt.io/) - JWT debugging and verification
- [OWASP ZAP](https://www.zaproxy.org/) - Security testing proxy
- [GitGuardian](https://www.gitguardian.com/) - Secrets detection
- [Snyk](https://snyk.io/) - Dependency vulnerability scanning
- [Trivy](https://trivy.dev/) - Container security scanning

---

*This document provides security guidance based on current industry standards. Always verify recommendations against the latest official documentation and consult security professionals for critical systems.*