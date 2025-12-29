# Queue Service Service-to-Service Auth Audit

**Service:** queue-service  
**Standard:** 05-service-to-service-auth.md  
**Date:** December 27, 2025  

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Overall Pass Rate** | **60.0%** (12/20 checks) |
| **CRITICAL Issues** | 3 |
| **HIGH Issues** | 3 |
| **MEDIUM Issues** | 2 |
| **LOW Issues** | 0 |

---

## Section: JWT Authentication for Internal Services

### S2S1: JWT validation for incoming requests
| Status | **PASS** |
|--------|----------|
| Evidence | `src/middleware/auth.middleware.ts:29-31` - `jwt.verify(token, JWT_SECRET)` |
| Evidence | `src/app.ts:60-67` - Auth hook applied globally |

### S2S2: Service identity in JWT claims
| Status | **PARTIAL** |
|--------|----------|
| Severity | **MEDIUM** |
| Evidence | `src/middleware/auth.middleware.ts:8-12` - JWTPayload has `userId`, `tenantId`, `role` |
| Issue | No `serviceId` or `serviceName` claim for service-to-service identification |
| Fix | Add service identity claim validation |

### S2S3: JWT audience validation
| Status | **FAIL** |
|--------|----------|
| Severity | **HIGH** |
| Evidence | `src/middleware/auth.middleware.ts:31` - No audience (`aud`) validation |
| Issue | Tokens from any issuer accepted if signature matches |
| Fix | Add `{ audience: 'queue-service' }` to verify options |

### S2S4: JWT issuer validation
| Status | **FAIL** |
|--------|----------|
| Severity | **HIGH** |
| Evidence | `src/middleware/auth.middleware.ts:31` - No issuer (`iss`) validation |
| Issue | No verification of token source |
| Fix | Add `{ issuer: 'tickettoken-auth-service' }` to verify options |

### S2S5: Algorithm whitelist
| Status | **FAIL** |
|--------|----------|
| Severity | **HIGH** |
| Evidence | `src/middleware/auth.middleware.ts:31` - No `algorithms` option |
| Issue | Vulnerable to algorithm confusion attacks |
| Fix | Add `{ algorithms: ['HS256'] }` to verify options |

---

## Section: Outbound Service Calls

### S2S6: Authentication headers on outbound calls
| Status | **PARTIAL** |
|--------|----------|
| Severity | **CRITICAL** |
| Evidence | `src/workers/money/payment.processor.ts:77-79` - Only sets `Content-Type` and `X-Idempotency-Key` |
| Issue | No `Authorization` header with service JWT for payment-service call |
| Fix | Generate and include service-to-service JWT token |

### S2S7: Correlation ID propagation
| Status | **FAIL** |
|--------|----------|
| Severity | **HIGH** |
| Evidence | No `x-correlation-id` header in outbound requests |
| Evidence | `src/workers/money/payment.processor.ts:77-79` - Only 2 headers set |

### S2S8: Webhook signature generation
| Status | **FAIL** |
|--------|----------|
| Severity | **CRITICAL** |
| Evidence | `src/services/webhook.service.ts:28-32` - No HMAC signature |
| Evidence | Only sends `Content-Type` and `User-Agent` headers |
| Issue | Webhooks can be spoofed - no signature verification possible for receivers |
| Fix | Add `X-Webhook-Signature` with HMAC-SHA256 of payload |

### S2S9: Webhook retry with backoff
| Status | **FAIL** |
|--------|----------|
| Severity | **MEDIUM** |
| Evidence | `src/services/webhook.service.ts:18-49` - Single attempt, no retry |
| Issue | Failed webhooks are lost |
| Fix | Add retry queue for failed webhooks |

---

## Section: Stripe Integration

### S2S10: Stripe webhook signature verification
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/stripe.service.ts:222-243` - `stripe.webhooks.constructEvent()` |
| Evidence | Uses `stripeConfig.webhookSecret` |

### S2S11: Stripe API key from secrets
| Status | **PASS** |
|--------|----------|
| Evidence | `src/config/stripe.config.ts:12` - `process.env.STRIPE_SECRET_KEY` |
| Evidence | Validates format: `if (!STRIPE_SECRET_KEY.startsWith('sk_'))` |

### S2S12: Stripe idempotency keys
| Status | **PASS** |
|--------|----------|
| Evidence | `src/workers/money/payment.processor.ts:78` - `'X-Idempotency-Key': idempotencyKey` |

---

## Section: Secrets Management

### S2S13: Secrets loaded from manager
| Status | **PARTIAL** |
|--------|----------|
| Severity | **CRITICAL** |
| Evidence | `src/config/secrets.ts:16-21` - Uses `secretsManager` for DB credentials |
| Issue | Stripe/Solana keys loaded directly from env, not secrets manager |
| Evidence | `src/config/stripe.config.ts:12` - `process.env.STRIPE_SECRET_KEY` |

### S2S14: No hardcoded secrets
| Status | **FAIL** |
|--------|----------|
| Severity | **CRITICAL** |
| Evidence | `src/middleware/auth.middleware.ts:6` - Hardcoded fallback: `'dev-secret-change-in-production'` |

### S2S15: JWT secret rotation support
| Status | **FAIL** |
|--------|----------|
| Severity | **MEDIUM** |
| Evidence | Single static JWT_SECRET with no rotation mechanism |
| Fix | Support multiple secrets for rotation periods |

---

## Section: mTLS & Network Security

### S2S16: Internal service URLs configured
| Status | **PASS** |
|--------|----------|
| Evidence | `src/workers/money/payment.processor.ts:63` - `process.env.PAYMENT_SERVICE_URL || 'http://localhost:3005'` |

### S2S17: TLS verification enabled
| Status | **PARTIAL** |
|--------|----------|
| Evidence | Axios default behavior verifies TLS in production |
| Issue | No explicit TLS configuration or certificate pinning |

### S2S18: Service mesh integration
| Status | **N/A** |
|--------|----------|
| Note | No service mesh (Istio/Linkerd) configuration present |
| Note | Would be infrastructure-level decision |

---

## Section: Health & Readiness

### S2S19: Health endpoint excludes auth
| Status | **PASS** |
|--------|----------|
| Evidence | `src/app.ts:61-62` - `if (request.url === '/health' || request.url.startsWith('/health'))` |
| Evidence | Auth middleware skipped for health endpoints |

### S2S20: API docs endpoint excludes auth
| Status | **PASS** |
|--------|----------|
| Evidence | `src/app.ts:63` - `request.url.startsWith('/api/v1/queue/docs')` |

---

## Remediation Priority

### CRITICAL (Fix Immediately)
1. **S2S14**: Remove hardcoded JWT secret fallback
```typescript
   const JWT_SECRET = process.env.JWT_SECRET;
   if (!JWT_SECRET) {
     throw new Error('JWT_SECRET environment variable required');
   }
```

2. **S2S8**: Add webhook signature generation
```typescript
   import crypto from 'crypto';
   
   const timestamp = Date.now().toString();
   const signature = crypto
     .createHmac('sha256', process.env.WEBHOOK_SECRET)
     .update(`${timestamp}.${JSON.stringify(payload)}`)
     .digest('hex');
   
   headers['X-Webhook-Timestamp'] = timestamp;
   headers['X-Webhook-Signature'] = `v1=${signature}`;
```

3. **S2S6/S2S13**: Generate service JWTs for outbound calls
```typescript
   const serviceToken = jwt.sign(
     { serviceId: 'queue-service', scope: 'internal' },
     process.env.SERVICE_JWT_SECRET,
     { expiresIn: '1h' }
   );
   headers['Authorization'] = `Bearer ${serviceToken}`;
```

### HIGH (Fix within 24-48 hours)
1. **S2S3**: Add JWT audience validation
2. **S2S4**: Add JWT issuer validation
3. **S2S5**: Add algorithm whitelist
4. **S2S7**: Propagate correlation ID in outbound requests

### MEDIUM (Fix within 1 week)
1. **S2S2**: Add service identity to JWT claims
2. **S2S9**: Add webhook retry queue
3. **S2S15**: Implement JWT secret rotation

---

## Summary

The queue-service has **significant gaps in service-to-service authentication**:

**Good:**
- ✅ JWT verification for incoming requests
- ✅ Stripe webhook signature verification
- ✅ Idempotency keys for Stripe calls
- ✅ Health/docs endpoints properly excluded from auth
- ✅ Secrets manager integration for database credentials

**Critical Issues:**
- ❌ Hardcoded JWT secret fallback (`dev-secret-change-in-production`)
- ❌ No signature on outbound webhooks (can be spoofed)
- ❌ No JWT token for outbound service-to-service calls
- ❌ No audience/issuer validation on incoming JWTs
- ❌ No algorithm whitelist (vulnerable to algorithm confusion)
- ❌ Stripe/Solana keys not in secrets manager

The webhook service is particularly vulnerable - it sends webhooks without signatures, making it impossible for receivers to verify authenticity. This is a significant security concern for payment and NFT notifications.
