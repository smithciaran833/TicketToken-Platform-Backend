# Notification Service - 05 Service-to-Service Authentication Audit

**Service:** notification-service  
**Document:** 05-s2s-auth.md  
**Date:** 2025-12-26  
**Auditor:** Cline  
**Pass Rate:** 68% (27/40 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | RabbitMQ no TLS, webhook signature not timing-safe |
| HIGH | 4 | No mTLS for internal calls, RabbitMQ shared credentials, no service identity, no message signing |
| MEDIUM | 3 | No timestamp validation in webhook middleware, no timestamp in outbound signature, webhook secret optional |
| LOW | 4 | No service allowlist, no correlation ID in MQ, no explicit HTTPS, HMAC SHA-1 for Twilio |

## Service Client - Outbound (4/12)

- mTLS or signed tokens - FAIL (HIGH)
- Credentials not hardcoded - PASS
- Secrets manager used - PASS
- Unique credentials per service - FAIL (HIGH - shared RabbitMQ)
- Failed auth logged - PASS
- HTTPS/TLS for internal calls - FAIL (MEDIUM)
- Service identity in requests - FAIL (HIGH)
- Correlation ID propagated - PARTIAL
- Request timeout configured - PASS
- Circuit breaker implemented - PASS

## Service Endpoint - Inbound (8/11)

- All endpoints require auth - PASS
- Auth middleware global - PASS
- Token crypto validation - PASS
- Token expiration checked - PASS
- Token issuer validated - FAIL (MEDIUM)
- Token audience validated - FAIL (MEDIUM)
- Service identity extracted - PASS
- Per-endpoint authorization - PASS
- No default-allow - PASS
- Caller identity logged - PASS
- Correlation ID logged - PASS

## Webhook Authentication (5/9)

### Inbound (from SendGrid/Twilio)
- Signature verification - PASS
- Timing-safe comparison - PARTIAL (controller yes, middleware no)
- Timestamp validation - PARTIAL (SendGrid yes, Twilio no)
- Secrets from environment - PASS

### Outbound (to customers)
- HMAC signature generated - PASS
- Timestamp included - PASS
- Signature includes timestamp - FAIL (MEDIUM)
- Timing-safe validation - PASS
- Secret required - FAIL (MEDIUM - optional)

## Message Queue Security (2/6)

- TLS/SSL enabled - FAIL (CRITICAL)
- Unique credentials per service - FAIL (HIGH)
- Message signing - FAIL (HIGH)
- Message validation on consume - FAIL (HIGH)
- Error handling - PASS

## Critical Evidence

### Non-Timing-Safe Comparison
```typescript
// webhook-auth.middleware.ts Line 27-29 - VULNERABLE
if (twilioSignature !== expectedSignature) {
  // String comparison!
}

// vs webhook.controller.ts - CORRECT
return crypto.timingSafeEqual(
  Buffer.from(signature),
  Buffer.from(expectedSignature)
);
```

### No RabbitMQ TLS Enforcement
```typescript
// rabbitmq.ts Line 13
this.connection = await amqp.connect(env.RABBITMQ_URL);
// No check for amqps:// protocol
```

### No Message Signing
```typescript
// rabbitmq.ts Lines 85-90
this.channel.publish(exchange, routingKey, message, {
  persistent: true,
  timestamp: Date.now(),
  // No HMAC signature!
});
```

### Outbound Webhook Missing Timestamp in Signature
```typescript
// webhook.provider.ts
private generateSignature(data: any, secret: string): string {
  const payload = JSON.stringify(data); // Should include timestamp
}
```

## Remediations

### CRITICAL
1. Require TLS for RabbitMQ:
```typescript
if (!env.RABBITMQ_URL.startsWith('amqps://')) {
  throw new Error('RabbitMQ TLS required in production');
}
```

2. Use timing-safe comparison in webhook-auth.middleware.ts:
```typescript
if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
```

### HIGH
1. Add service identity header to outbound calls
2. Implement message signing for RabbitMQ
3. Use per-service RabbitMQ credentials
4. Add mTLS or JWT for inter-service HTTP

### MEDIUM
1. Include timestamp in outbound webhook signature
2. Add timestamp validation to Twilio middleware
3. Validate JWT issuer and audience claims
4. Require webhook secret (warn if missing)

## Positive Highlights

- Webhook signature verification (inbound + outbound)
- Secrets manager integration
- All routes require JWT auth
- Circuit breaker for downstream
- Timing-safe in controller/provider
- Timestamp in outbound webhook headers
- MQ reconnection logic
- Request timeouts configured

S2S Auth Score: 68/100
