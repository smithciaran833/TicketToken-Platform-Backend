# Auth-Service Remediation Plan

**Generated:** 2025-12-21
**Audit Score:** Strong — Most items passing
**Critical Issues:** 1 (verification needed)
**High Priority Issues:** 3
**Medium Priority Issues:** 3

---

## Executive Summary

Auth-service has a strong security foundation with proper RLS policies, tenant isolation, and comprehensive authentication features. The main work is verification of critical configurations rather than implementation of missing features.

**Strengths:**
- Multiple auth methods (email, OAuth, Web3, biometric, MFA)
- Account lockout and brute force protection
- RLS policies for multi-tenancy
- Comprehensive audit logging with PII scrubbing
- Extensive test coverage

**Gaps:**
- Wallet key management needs verification
- GDPR compliance features incomplete
- Some infrastructure settings need verification

---

## Phase 1: Critical Verification (Day 1)

### Issue 1: Wallet Key Management — VERIFY IMMEDIATELY

**Risk:** Catastrophic if private keys compromised

**What to verify:**

1. **No private keys in source code**
```bash
# Search for private key patterns
rg -i "private.*key|secret.*key|BEGIN.*PRIVATE" --type ts src/
# Should return empty or only public key references
```

2. **No private keys in environment variables**
```bash
# Check env.ts for wallet-related secrets
cat src/config/env.ts | grep -i wallet
cat src/config/env.ts | grep -i private
```

3. **HSM/KMS usage confirmed**
```bash
# Look for AWS KMS or HSM references
rg -i "kms|hsm|secretsmanager" --type ts src/
```

4. **Wallet service only handles public keys and signatures**
```bash
# Review wallet.service.ts
cat src/services/wallet.service.ts | head -100
```

**Expected findings:**
- Wallet service should only verify signatures (public key operations)
- No signing operations (private key operations) in auth-service
- Signing should happen in minting-service or blockchain-service with HSM

**If private keys found:**
- STOP — This is a critical security issue
- Rotate all keys immediately
- Move to HSM/KMS before production

**Documentation to create:**
- `docs/WALLET_SECURITY.md` — How wallet auth works
- Confirm: "Auth-service never handles private keys"

---

## Phase 2: High Priority (Week 1)

### Issue 2: GDPR Compliance Gaps

**Risk:** Legal/regulatory violations in EU

**Current state:**
- ✅ Audit logging exists
- ✅ PII scrubbing in logs
- ❌ No data export API
- ❌ No consent tracking
- ❌ No documented retention policy

**Files to create/modify:**

**2a. Data Export API**

File: `src/routes/gdpr.routes.ts`
```typescript
import { FastifyInstance } from 'fastify';

export async function gdprRoutes(fastify: FastifyInstance) {
  // GET /api/auth/gdpr/export — Export all user data
  fastify.get('/gdpr/export', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = request.user.sub;
    const tenantId = request.user.tenantId;
    
    const userData = await gdprService.exportUserData(userId, tenantId);
    
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="user-data-${userId}.json"`);
    return userData;
  });
  
  // DELETE /api/auth/gdpr/delete — Right to be forgotten
  fastify.delete('/gdpr/delete', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = request.user.sub;
    const tenantId = request.user.tenantId;
    
    await gdprService.deleteUserData(userId, tenantId);
    
    return { success: true, message: 'Account scheduled for deletion' };
  });
}
```

**2b. GDPR Service**

File: `src/services/gdpr.service.ts`
```typescript
export class GDPRService {
  async exportUserData(userId: string, tenantId: string): Promise<UserDataExport> {
    const user = await this.getUserProfile(userId, tenantId);
    const sessions = await this.getUserSessions(userId, tenantId);
    const auditLogs = await this.getUserAuditLogs(userId, tenantId);
    const wallets = await this.getUserWallets(userId, tenantId);
    
    return {
      exportDate: new Date().toISOString(),
      user,
      sessions,
      auditLogs,
      wallets
    };
  }
  
  async deleteUserData(userId: string, tenantId: string): Promise<void> {
    // Soft delete — mark for deletion after retention period
    await pool.query(
      `UPDATE users SET 
        deleted_at = NOW(),
        email = 'deleted-' || id || '@deleted.local',
        first_name = '[DELETED]',
        last_name = '[DELETED]',
        phone = NULL
      WHERE id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    
    // Invalidate all sessions
    await this.invalidateAllSessions(userId);
    
    // Log deletion request
    await this.auditLog('gdpr_deletion_requested', userId, tenantId);
  }
}
```

**2c. Consent Tracking**

File: `src/migrations/XXX_add_consent_tracking.ts`
```typescript
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_consents', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users');
    table.uuid('tenant_id').notNullable();
    table.string('consent_type').notNullable(); // 'marketing', 'analytics', 'terms'
    table.boolean('granted').notNullable();
    table.timestamp('granted_at');
    table.timestamp('revoked_at');
    table.string('ip_address');
    table.string('user_agent');
    table.timestamps(true, true);
    
    table.index(['user_id', 'tenant_id']);
    table.index(['consent_type']);
  });
}
```

**Verification:**
```bash
# Test data export
curl -X GET http://localhost:3001/api/auth/gdpr/export \
  -H "Authorization: Bearer $TOKEN"

# Test deletion
curl -X DELETE http://localhost:3001/api/auth/gdpr/delete \
  -H "Authorization: Bearer $TOKEN"
```

---

### Issue 3: Secrets Management Verification

**Risk:** Credential exposure

**What to verify:**
```bash
# 1. Check for hardcoded secrets
rg "sk_live|sk_test|password.*=.*['\"]" --type ts src/
# Should return empty

# 2. Check env.ts for proper secret handling
cat src/config/env.ts | grep -A2 -B2 SECRET

# 3. Check for secrets manager integration
rg "secretsmanager|SecretsManager" --type ts src/

# 4. Scan git history for secrets
git log -p --all -S "sk_live" -- '*.ts'
git log -p --all -S "password" -- '*.env'
# Should return empty
```

**If secrets manager not integrated:**

File: `src/config/secrets.ts`
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: process.env.AWS_REGION });

export async function getSecret(secretName: string): Promise<string> {
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);
  return response.SecretString || '';
}

// Usage at startup
export async function loadSecrets(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    process.env.JWT_SECRET = await getSecret('tickettoken/auth/jwt-secret');
    process.env.DATABASE_URL = await getSecret('tickettoken/auth/database-url');
  }
}
```

---

### Issue 4: Rate Limiting Verification

**Risk:** Brute force attacks

**What to verify:**
```bash
# Check rate limiting configuration
rg "rateLimit|rate-limit|RateLimit" --type ts src/

# Check routes for rate limiting
cat src/routes/auth.routes.ts | grep -A5 "login\|register\|forgot"
```

**Expected rate limits:**

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /login | 5 req | 15 min |
| POST /register | 3 req | 1 hour |
| POST /forgot-password | 3 req | 1 hour |
| POST /verify-mfa | 5 req | 15 min |

**If rate limiting missing:**

File: `src/middleware/rate-limit.ts`
```typescript
import rateLimit from '@fastify/rate-limit';

export const authRateLimits = {
  login: {
    max: 5,
    timeWindow: '15 minutes',
    keyGenerator: (req) => req.ip
  },
  register: {
    max: 3,
    timeWindow: '1 hour',
    keyGenerator: (req) => req.ip
  },
  forgotPassword: {
    max: 3,
    timeWindow: '1 hour',
    keyGenerator: (req) => req.body?.email || req.ip
  }
};
```

Apply to routes:
```typescript
fastify.post('/login', {
  config: { rateLimit: authRateLimits.login }
}, loginHandler);
```

**Verification:**
```bash
# Test rate limiting (should get 429 after 5 attempts)
for i in {1..10}; do
  curl -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}' \
    -w "\n%{http_code}\n"
done
```

---

## Phase 3: Medium Priority (Week 2)

### Issue 5: HTTPS/HSTS Configuration

**File:** `src/app.ts`
```typescript
import helmet from '@fastify/helmet';

// Add security headers
await fastify.register(helmet, {
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  }
});

// Force HTTPS in production
if (process.env.NODE_ENV === 'production') {
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.headers['x-forwarded-proto'] !== 'https') {
      return reply.redirect(301, `https://${request.hostname}${request.url}`);
    }
  });
}
```

**Verification:**
```bash
# Check security headers
curl -I https://your-domain.com/api/auth/health
# Should include: Strict-Transport-Security, Content-Security-Policy
```

---

### Issue 6: Monitoring & Alerting

**Create alerts for:**

1. **Failed login spike** — More than 100 failed logins in 5 minutes
2. **Account lockouts** — More than 10 lockouts in 1 hour
3. **New admin created** — Any new admin role assignment
4. **Password reset spike** — More than 50 resets in 1 hour

**File:** `src/services/security-alerts.service.ts`
```typescript
export class SecurityAlertsService {
  async checkFailedLoginSpike(): Promise<void> {
    const count = await this.getFailedLoginsLast5Minutes();
    if (count > 100) {
      await this.sendAlert('FAILED_LOGIN_SPIKE', { count });
    }
  }
  
  async onAdminCreated(userId: string, grantedBy: string): Promise<void> {
    await this.sendAlert('NEW_ADMIN_CREATED', { userId, grantedBy });
  }
  
  private async sendAlert(type: string, data: any): Promise<void> {
    // Send to PagerDuty, Slack, etc.
    logger.error('SECURITY_ALERT', { type, data });
  }
}
```

---

### Issue 7: Security Documentation

**Create these docs:**

1. `docs/SECURITY_ARCHITECTURE.md` — How auth works
2. `docs/INCIDENT_RESPONSE.md` — What to do when breached
3. `docs/RUNBOOKS.md` — Common operational tasks

**Template for INCIDENT_RESPONSE.md:**
```markdown
# Auth Service Incident Response

## Suspected Account Compromise

1. Lock the affected account immediately
2. Invalidate all sessions: `DELETE FROM user_sessions WHERE user_id = ?`
3. Force password reset
4. Review audit logs for suspicious activity
5. Notify user via alternate channel

## Suspected Credential Leak

1. Rotate JWT signing keys
2. Invalidate all active sessions
3. Force password reset for all users
4. Scan git history for leaked secrets
5. Update secrets in AWS Secrets Manager

## DDoS on Auth Endpoints

1. Enable stricter rate limiting
2. Enable CAPTCHA on login/register
3. Block suspicious IPs at WAF level
4. Scale up auth service instances
```

---

## Verification Checklist

Run these checks after remediation:
```bash
# 1. No private keys in code
rg -i "private.*key" --type ts src/
# Expected: empty

# 2. Secrets manager integrated
rg "SecretsManager" --type ts src/
# Expected: results in config/secrets.ts

# 3. Rate limiting on auth endpoints
curl -X POST localhost:3001/api/auth/login -d '{}' -w "%{http_code}"
# After 5 attempts, expected: 429

# 4. GDPR export works
curl -X GET localhost:3001/api/auth/gdpr/export -H "Authorization: Bearer $TOKEN"
# Expected: JSON with user data

# 5. Security headers present
curl -I localhost:3001/api/auth/health | grep -i "strict-transport\|content-security"
# Expected: headers present

# 6. Tests pass
npm run test
# Expected: all pass
```

---

## Estimated Effort

| Phase | Issues | Hours | Priority |
|-------|--------|-------|----------|
| Phase 1: Critical Verification | 1 | 2-4 | IMMEDIATE |
| Phase 2: High Priority | 3 | 12-16 | WEEK 1 |
| Phase 3: Medium Priority | 3 | 8-12 | WEEK 2 |
| **Total** | **7** | **22-32** | |

---

## Sign-Off Criteria

Before marking auth-service as production-ready:

- [ ] Wallet key verification complete (no private keys)
- [ ] Secrets manager integration verified
- [ ] Rate limiting tested and working
- [ ] GDPR export API implemented
- [ ] Security headers configured
- [ ] All tests passing
- [ ] Security documentation complete

---

*Document generated from audit completed 2025-12-21*
