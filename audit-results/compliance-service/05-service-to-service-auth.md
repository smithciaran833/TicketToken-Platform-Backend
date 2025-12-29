## Compliance Service Service-to-Service Auth Audit Report
### Audited Against: Docs/research/05-service-to-service-auth.md

---

## 🔴 CRITICAL FINDINGS

### No Service-to-Service Authentication
**Severity:** CRITICAL  
**File:** `src/middleware/auth.middleware.ts` (entire file)  
**Evidence:** The auth middleware ONLY handles user authentication, NOT service-to-service auth:
```typescript
// Line 23-40: Only user auth
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.headers.authorization?.replace('Bearer ', '');
  // ...
  const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;  // User token only
  request.user = decoded;
}
```
**Missing:**
- No service identity verification
- No mTLS implementation
- No HMAC request signing
- No service-level JWT validation

**Impact:** Any service (or attacker on the network) can call compliance endpoints without proving identity.

---

### JWT Uses Symmetric Algorithm (HS256)
**Severity:** CRITICAL  
**File:** `.env.example:31`  
**Evidence:**
```
JWT_ALGORITHM=HS256  # ❌ Symmetric key!
```
**File:** `src/middleware/auth.middleware.ts:10`
```typescript
const JWT_SECRET = process.env.JWT_SECRET;  // Single shared secret
// ...
jwt.verify(token, JWT_SECRET)  // All services must share the secret
```
**Issue:** With HS256, ANY service that can verify tokens can also CREATE tokens. One compromised service = all tokens compromised.  
**Checklist Violation:** Item #7 "Token signature algorithm is RS256 or ES256 (asymmetric)"  
**Fix:** Use RS256 with public/private key pair - services only need public key to verify.

---

### JWT_SECRET From Environment Variable, Not Secrets Manager
**Severity:** CRITICAL  
**File:** `src/middleware/auth.middleware.ts:4-9`  
**Evidence:**
```typescript
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_SECRET = process.env.JWT_SECRET;  // ❌ From env var!
```
**File:** `src/config/secrets.ts` - Does NOT load JWT_SECRET:
```typescript
const commonSecrets = [
  SECRETS_CONFIG.POSTGRES_PASSWORD,
  SECRETS_CONFIG.POSTGRES_USER,
  // JWT_SECRET NOT included!
];
```
**Checklist Violation:** Item #19 "JWT secret loaded from secrets manager, not env var"  
**Impact:** JWT secret in env vars can leak through logs, `/proc`, etc.

---

### Internal Service URLs Use HTTP (Not HTTPS)
**Severity:** CRITICAL  
**File:** `.env.example:48-63`  
**Evidence:**
```
# All internal service URLs use HTTP!
AUTH_SERVICE_URL=http://localhost:3001
VENUE_SERVICE_URL=http://localhost:3002
EVENT_SERVICE_URL=http://localhost:3003
PAYMENT_SERVICE_URL=http://localhost:3005  # ❌ Payment over HTTP!
# ... all use http://
```
**Checklist Violation:** Item #8 "All internal HTTP calls use HTTPS/TLS"  
**Impact:** Internal traffic can be sniffed. Tokens, PII, payment data sent in plain text.

---

## 🟠 HIGH FINDINGS

### Webhook Auth Uses Simple String Comparison (Not HMAC)
**Severity:** HIGH  
**File:** `src/middleware/auth.middleware.ts:55-64`  
**Evidence:**
```typescript
export function webhookAuth(secret: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const signature = request.headers['x-webhook-signature'] as string;

    if (!signature || signature !== secret) {  // ❌ Simple string compare!
      return reply.code(401).send({ error: 'Invalid webhook signature' });
    }
  };
}
```
**Issues:**
1. Not HMAC - sends secret over wire (should sign with secret, not transmit)
2. Not constant-time comparison - timing attack possible
3. No timestamp validation - replay attacks possible
4. No request body in signature - tampering possible

**Should be:**
```typescript
const crypto = require('crypto');
const expectedSignature = crypto
  .createHmac('sha256', secret)
  .update(JSON.stringify(request.body))
  .digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
  return reply.code(401).send({ error: 'Invalid signature' });
}
```

---

### No JWT Claims Validation (iss, aud)
**Severity:** HIGH  
**File:** `src/middleware/auth.middleware.ts:29-30`  
**Evidence:**
```typescript
const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
// ❌ No issuer validation!
// ❌ No audience validation!
// Only checks tenant_id
```
**File:** `.env.example:34-35` shows issuer/audience ARE defined but NOT used:
```
JWT_ISSUER=tickettoken                # Defined but NOT validated
JWT_AUDIENCE=tickettoken-platform     # Defined but NOT validated
```
**Checklist Violations:**
- Item #10 "iss claim validated against known issuers"
- Item #11 "aud claim includes this service"

**Fix:**
```typescript
const decoded = jwt.verify(token, JWT_SECRET, {
  algorithms: ['RS256'],
  issuer: 'tickettoken',
  audience: 'tickettoken-platform'
}) as AuthUser;
```

---

### No Service Identity Logging
**Severity:** HIGH  
**File:** `src/middleware/auth.middleware.ts`  
**Evidence:** No logging of caller identity on authentication success/failure:
```typescript
} catch (error) {
  return reply.code(401).send({ error: 'Invalid token' });
  // ❌ No logging of failed auth attempt!
}
```
**Checklist Violations:**
- Item #7 (Client checklist) "Failed authentication attempts are logged"
- Item #11 (Endpoint checklist) "Unauthorized access attempts logged"

---

### No Authorization Logging
**Severity:** HIGH  
**File:** `src/middleware/auth.middleware.ts:44-51`  
**Evidence:**
```typescript
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user?.roles?.includes('admin')) {
    return reply.code(403).send({ error: 'Admin access required' });
    // ❌ No logging of authorization failure!
  }
}

export async function requireComplianceOfficer(...) {
  // ❌ Same - no logging
}
```

---

## 🟡 MEDIUM FINDINGS

### Shared JWT Secret Across All Services
**Severity:** MEDIUM  
**File:** `.env.example:30`  
**Evidence:**
```
JWT_SECRET=<CHANGE_TO_256_BIT_SECRET>  # Same secret used by all services
```
**Checklist Violation:** Item #4 "Each service has its own unique credentials (not shared)"  
**Impact:** If one service is compromised, attacker can forge tokens for all services.

---

### No Correlation ID Propagation to Downstream
**Severity:** MEDIUM  
**File:** `src/server.ts`, `src/middleware/auth.middleware.ts`  
**Evidence:** No correlation ID extracted or propagated for service-to-service tracing.  
**Checklist Violation:** Item #10 "Correlation ID propagated to downstream services"

---

### No Service-Level ACLs
**Severity:** MEDIUM  
**File:** All route files  
**Evidence:** Routes use role-based auth (admin, compliance_officer) but no service-level ACLs:
```typescript
// Routes allow any authenticated user with role, not specific services
fastify.post('/venue/start-verification', {
  onRequest: requireComplianceOfficer  // User role check only, no service check
}, handler);
```
**Checklist Violation:** Item #10 (Endpoint) "Allowlist of services that can call each endpoint"

---

## ✅ PASSING CHECKS

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **Client #2** | Credentials not hardcoded | ✅ PASS | JWT_SECRET from env/secrets, not source |
| **Client #3** | Secrets manager used | ✅ PARTIAL | `secrets.ts` uses secretsManager (DB creds only) |
| **Endpoint #1** | All endpoints require auth | ✅ PASS | Routes use `onRequest: authenticate` |
| **Endpoint #4** | Token verified (not just decoded) | ✅ PASS | `jwt.verify()` used |
| **Endpoint #5** | Token exp checked | ✅ PASS | `jwt.verify()` checks by default |
| **Endpoint #12** | No default-allow | ✅ PASS | Auth required, then role check |
| **Secrets #1** | Secrets manager exists | ✅ PASS | `src/config/secrets.ts` |
| **Secrets #6** | Each service has unique DB creds | ✅ PASS | Per-service secrets loaded |

---

## 📊 SUMMARY

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 4 | No S2S auth, HS256 not RS256, JWT secret in env, HTTP not HTTPS |
| 🟠 HIGH | 4 | Webhook not HMAC, no iss/aud validation, no auth logging |
| 🟡 MEDIUM | 3 | Shared JWT secret, no correlation ID, no service ACLs |
| ✅ PASS | 8 | Basic auth structure exists |

---

## 🛠️ REQUIRED FIXES

### IMMEDIATE (CRITICAL)

**1. Add service identity verification middleware:**
```typescript
// src/middleware/service-auth.middleware.ts
export async function verifyServiceIdentity(request: FastifyRequest, reply: FastifyReply) {
  const serviceToken = request.headers['x-service-token'];
  const serviceId = request.headers['x-service-id'];
  
  if (!serviceToken || !serviceId) {
    return reply.code(401).send({ error: 'Service authentication required' });
  }
  
  try {
    const decoded = jwt.verify(serviceToken, SERVICE_PUBLIC_KEY, {
      algorithms: ['RS256'],
      issuer: 'tickettoken-auth-service',
      audience: 'compliance-service'
    });
    
    if (decoded.sub !== serviceId) {
      throw new Error('Service identity mismatch');
    }
    
    request.callerService = serviceId;
    request.log.info({ callerService: serviceId }, 'Service authenticated');
  } catch (error) {
    request.log.warn({ serviceId, error: error.message }, 'Service auth failed');
    return reply.code(401).send({ error: 'Invalid service token' });
  }
}
```

**2. Switch to RS256 asymmetric JWT:**
```typescript
// Use public key for verification (all services can verify)
// Use private key for signing (only auth-service)
const decoded = jwt.verify(token, JWT_PUBLIC_KEY, {
  algorithms: ['RS256'],
  issuer: process.env.JWT_ISSUER,
  audience: process.env.JWT_AUDIENCE
});
```

**3. Move JWT secret to secrets manager:**
```typescript
const JWT_PUBLIC_KEY = await secretsManager.getSecret('jwt/public-key');
```

**4. Switch internal URLs to HTTPS in `.env.example`:**
```
AUTH_SERVICE_URL=https://auth-service.internal:3001
PAYMENT_SERVICE_URL=https://payment-service.internal:3005
```

### 24-48 HOURS (HIGH)

**5. Fix webhook authentication with HMAC:**
```typescript
import crypto from 'crypto';

export function webhookAuth(secret: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const signature = request.headers['x-webhook-signature'] as string;
    const timestamp = request.headers['x-webhook-timestamp'] as string;
    
    // Check timestamp (prevent replay)
    const timestampMs = parseInt(timestamp);
    if (Math.abs(Date.now() - timestampMs) > 30000) {
      return reply.code(401).send({ error: 'Request too old' });
    }
    
    // Compute expected signature
    const payload = `${timestamp}.${JSON.stringify(request.body)}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    
    // Constant-time comparison
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return reply.code(401).send({ error: 'Invalid signature' });
    }
  };
}
```

**6. Add JWT issuer/audience validation**

**7. Add authentication failure logging**

### 1 WEEK (MEDIUM)

8. Implement per-service credentials
9. Add service-level ACLs for endpoints
10. Implement mTLS for service mesh
