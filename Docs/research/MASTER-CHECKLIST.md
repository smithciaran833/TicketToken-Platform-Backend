# Master Checklist - All Research Documents

Generated: 2025-12-21T17:02:12.798Z
Total Documents: 38

---

## 01 - 01-security

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

---

## 02 - 02-input-validation

### 3.1 Route Definition Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **RD1** | All routes have schema validation | CRITICAL | `grep -rn "schema:" src/routes/` |
| **RD2** | Body schema defined for POST/PUT/PATCH | CRITICAL | Check all mutation routes |
| **RD3** | Params schema defined with format validation | HIGH | Check `:id` params for UUID format |
| **RD4** | Query schema defined with type constraints | HIGH | Check pagination, filters |
| **RD5** | Response schema defined (serialization) | MEDIUM | Check for response leakage |
| **RD6** | `additionalProperties: false` on all object schemas | CRITICAL | Prevents mass assignment |
| **RD7** | Arrays have `maxItems` constraint | HIGH | Prevents memory exhaustion |
| **RD8** | Strings have `maxLength` constraint | HIGH | Prevents large payload attacks |
| **RD9** | Integers have `minimum` and `maximum` | MEDIUM | Prevents overflow |
| **RD10** | Enums use `Type.Union` with `Type.Literal` | MEDIUM | Prevents invalid values |

**Fastify Route Audit Template:**

```typescript
// ✅ Complete route definition
app.post('/events', {
  schema: {
    body: Type.Object({
      name: Type.String({ minLength: 1, maxLength: 200 }),
      price_cents: Type.Integer({ minimum: 0, maximum: 100000000 }),
      tags: Type.Array(Type.String({ maxLength: 50 }), { maxItems: 20 })
    }, { additionalProperties: false }),
    
    params: Type.Object({}, { additionalProperties: false }),
    
    querystring: Type.Object({}, { additionalProperties: false }),
    
    headers: Type.Object({
      authorization: Type.String()
    }),
    
    response: {
      201: Type.Object({
        id: Type.String({ format: 'uuid' }),
        name: Type.String()
      }),
      400: ProblemDetailsSchema,
      422: ProblemDetailsSchema
    }
  }
}, handler);
```

---

### 3.2 Schema Definition Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **SD1** | UUIDs validated with `format: 'uuid'` | HIGH | All ID fields |
| **SD2** | Emails validated with `format: 'email'` | HIGH | Email fields |
| **SD3** | URLs validated with `format: 'uri'` | HIGH | URL fields |
| **SD4** | Dates use ISO8601 format string | MEDIUM | Date fields |
| **SD5** | Phone numbers have pattern validation | MEDIUM | Phone fields |
| **SD6** | No `Type.Any()` or `Type.Unknown()` in production | HIGH | Code search |
| **SD7** | Optional fields explicitly marked | MEDIUM | Check schema definitions |
| **SD8** | Default values set where appropriate | LOW | Check schema definitions |
| **SD9** | Schemas are reusable (DRY) | LOW | Check for duplication |
| **SD10** | Schema names are consistent | LOW | Naming conventions |

**Common Format Patterns:**

```typescript
// Standard format patterns
const Schemas = {
  uuid: Type.String({ format: 'uuid' }),
  email: Type.String({ format: 'email', maxLength: 254 }),
  url: Type.String({ format: 'uri', maxLength: 2048 }),
  date: Type.String({ format: 'date' }),  // YYYY-MM-DD
  datetime: Type.String({ format: 'date-time' }),  // ISO8601
  
  // Custom patterns
  phone: Type.String({ pattern: '^\\+?[1-9]\\d{1,14}$' }),  // E.164
  slug: Type.String({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 100 }),
  username: Type.String({ pattern: '^[a-zA-Z0-9_-]{3,30}$' }),
  
  // Money (always in cents/smallest unit)
  money: Type.Integer({ minimum: 0, maximum: 100000000 }),
  
  // Pagination
  page: Type.Integer({ minimum: 1, default: 1 }),
  limit: Type.Integer({ minimum: 1, maximum: 100, default: 20 })
};
```

---

### 3.3 Service Layer Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **SL1** | Business rule validation after schema validation | HIGH | Review service methods |
| **SL2** | Authorization checks before data access | CRITICAL | Check ownership/permissions |
| **SL3** | Entity existence validated before operations | HIGH | Check findById calls |
| **SL4** | State transitions validated | HIGH | Check status changes |
| **SL5** | Cross-field validation performed | MEDIUM | e.g., end_date > start_date |
| **SL6** | External input re-validated if transformed | HIGH | After any data manipulation |
| **SL7** | No direct use of `request.body` in DB queries | CRITICAL | Use typed DTOs |
| **SL8** | Sensitive fields filtered from responses | HIGH | Check response serialization |

**Service Layer Validation Pattern:**

```typescript
class EventService {
  async create(input: CreateEventInput, userId: string): Promise<Event> {
    // 1. Business rule validation
    if (new Date(input.end_date) <= new Date(input.start_date)) {
      throw new ValidationError('End date must be after start date');
    }
    
    // 2. Authorization (user can create events)
    const user = await this.userRepo.findById(userId);
    if (!user.can('create_events')) {
      throw new ForbiddenError('Not authorized to create events');
    }
    
    // 3. Validate referenced entities exist
    const venue = await this.venueRepo.findById(input.venue_id);
    if (!venue) {
      throw new ValidationError('Venue not found', { field: 'venue_id' });
    }
    
    // 4. Cross-field validation
    const totalTickets = input.ticket_types.reduce((sum, t) => sum + t.quantity, 0);
    if (totalTickets > venue.capacity) {
      throw new ValidationError('Total tickets exceed venue capacity');
    }
    
    // 5. Create with validated data
    return this.eventRepo.create({
      ...input,
      organizer_id: userId,
      status: 'draft'
    });
  }
}
```

---

### 3.4 Database Layer Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **DB1** | All queries use parameterized values | CRITICAL | No string concatenation |
| **DB2** | `whereRaw` uses bindings array | CRITICAL | Check all raw queries |
| **DB3** | Dynamic columns use allowlist | CRITICAL | Check orderBy, select |
| **DB4** | No user input in table/column names | CRITICAL | Review dynamic queries |
| **DB5** | Knex migrations define NOT NULL | HIGH | Check migration files |
| **DB6** | Knex migrations define constraints | HIGH | Check, unique, foreign key |
| **DB7** | Repository methods use explicit field lists | HIGH | No `select('*')` with user data |
| **DB8** | Insert/update use explicit field mapping | CRITICAL | Prevents mass assignment |

**Knex Repository Pattern:**

```typescript
class EventRepository {
  // Explicit column lists
  private static readonly COLUMNS = [
    'id', 'name', 'description', 'venue_id', 'start_date', 
    'end_date', 'status', 'created_at', 'updated_at'
  ] as const;
  
  private static readonly INSERTABLE = [
    'name', 'description', 'venue_id', 'start_date', 
    'end_date', 'organizer_id', 'status'
  ] as const;
  
  private static readonly UPDATABLE = [
    'name', 'description', 'start_date', 'end_date', 'status'
  ] as const;
  
  async findById(id: string): Promise<Event | null> {
    return this.db('events')
      .select(EventRepository.COLUMNS)
      .where({ id })  // Parameterized
      .first();
  }
  
  async create(data: CreateEventData): Promise<Event> {
    const insertData = pick(data, EventRepository.INSERTABLE);
    const [event] = await this.db('events')
      .insert(insertData)
      .returning(EventRepository.COLUMNS);
    return event;
  }
  
  async update(id: string, data: UpdateEventData): Promise<Event> {
    const updateData = pick(data, EventRepository.UPDATABLE);
    const [event] = await this.db('events')
      .where({ id })
      .update(updateData)
      .returning(EventRepository.COLUMNS);
    return event;
  }
  
  // Safe dynamic ordering
  async findAll(options: { sortBy?: string; order?: 'asc' | 'desc' }): Promise<Event[]> {
    const allowedSortColumns = ['name', 'start_date', 'created_at'];
    const sortBy = allowedSortColumns.includes(options.sortBy!) 
      ? options.sortBy 
      : 'created_at';
    const order = options.order === 'asc' ? 'asc' : 'desc';
    
    return this.db('events')
      .select(EventRepository.COLUMNS)
      .orderBy(sortBy, order);
  }
}
```

---

### 3.5 Security-Specific Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **SEC1** | Prototype pollution blocked (`additionalProperties: false`) | CRITICAL | All object schemas |
| **SEC2** | Mass assignment prevented (explicit fields) | CRITICAL | Insert/update operations |
| **SEC3** | SQL injection prevented (parameterized queries) | CRITICAL | All database queries |
| **SEC4** | XSS prevented (output encoding) | HIGH | HTML responses |
| **SEC5** | File upload validates content type | CRITICAL | File upload endpoints |
| **SEC6** | File names are sanitized/regenerated | CRITICAL | File storage |
| **SEC7** | Path traversal prevented | CRITICAL | File operations |
| **SEC8** | Unicode normalized before comparison | MEDIUM | String comparisons |
| **SEC9** | Integer bounds prevent overflow | MEDIUM | Numeric inputs |
| **SEC10** | Rate limiting on validation-heavy endpoints | HIGH | Public endpoints |

---

### 3.6 Quick Grep Audit Commands

```bash
# Find routes without schema validation
grep -rn "app\.\(get\|post\|put\|patch\|delete\)" --include="*.ts" | grep -v "schema:"

# Find potential SQL injection (string concatenation in queries)
grep -rn "whereRaw\|raw(" --include="*.ts" | grep -v "\[\|{.*}"

# Find Type.Any() usage
grep -rn "Type\.Any\|Type\.Unknown" --include="*.ts"

# Find schemas without additionalProperties
grep -rn "Type\.Object" --include="*.ts" | grep -v "additionalProperties"

# Find direct request.body usage in repositories
grep -rn "request\.body" --include="*repository*.ts"

# Find arrays without maxItems
grep -rn "Type\.Array" --include="*.ts" | grep -v "maxItems"

# Find missing format validation on ID fields
grep -rn "_id.*Type\.String" --include="*.ts" | grep -v "format.*uuid"
```

---

---

## 03 - 03-error-handling

### 3.1 Route Handler Checklist

#### Fastify Error Handling

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **RH1** | Global error handler registered with `setErrorHandler` | CRITICAL | `grep -r "setErrorHandler" src/` |
| **RH2** | Error handler registered BEFORE routes | CRITICAL | Check app initialization order |
| **RH3** | Not Found handler registered with `setNotFoundHandler` | HIGH | `grep -r "setNotFoundHandler" src/` |
| **RH4** | Schema validation errors produce consistent format | HIGH | Test invalid payload response format |
| **RH5** | Error handler returns RFC 7807 Problem Details | HIGH | Test any error endpoint response |
| **RH6** | Correlation ID included in all error responses | HIGH | Check `correlation_id` in responses |
| **RH7** | Stack traces NOT exposed in production | CRITICAL | `curl` any 500 error in prod |
| **RH8** | All async route handlers use async/await | HIGH | `grep -r "function.*request.*reply" --include="*.ts"` |
| **RH9** | No floating promises in route handlers | CRITICAL | Run ESLint with `@typescript-eslint/no-floating-promises` |
| **RH10** | Response status matches Problem Details status field | MEDIUM | Compare HTTP status vs body status |

**Fastify Error Handler Template:**
```typescript
// src/plugins/error-handler.ts
import { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';

export default async function errorHandler(fastify: FastifyInstance) {
  // MUST be registered before routes
  fastify.setErrorHandler(async (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.headers['x-correlation-id'] || request.id;
    
    // Log full error internally
    request.log.error({
      correlationId,
      err: error,
      req: {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.body
      }
    });
    
    // Determine appropriate status code
    let statusCode = error.statusCode || 500;
    if (error.validation) {
      statusCode = 422;
    }
    
    // Build RFC 7807 response
    const response = {
      type: `https://api.tickettoken.com/errors/${error.code || 'internal'}`,
      title: statusCode >= 500 ? 'Internal Server Error' : error.message,
      status: statusCode,
      detail: statusCode >= 500 
        ? 'An unexpected error occurred' 
        : error.message,
      instance: request.url,
      correlation_id: correlationId,
      ...(error.validation && {
        errors: error.validation
      })
    };
    
    reply
      .status(statusCode)
      .header('content-type', 'application/problem+json')
      .send(response);
  });
  
  fastify.setNotFoundHandler((request, reply) => {
    reply
      .status(404)
      .header('content-type', 'application/problem+json')
      .send({
        type: 'https://api.tickettoken.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Route ${request.method} ${request.url} not found`,
        instance: request.url
      });
  });
}
```

---

### 3.2 Service Layer Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **SL1** | All public methods have try/catch or throw typed errors | HIGH | Code review |
| **SL2** | Errors include context (IDs, operation type) | HIGH | Review error constructors |
| **SL3** | No empty catch blocks | CRITICAL | `grep -rn "catch.*{.*}" --include="*.ts" \| grep -v "log\|throw\|return"` |
| **SL4** | Domain errors extend base AppError class | MEDIUM | Check error class hierarchy |
| **SL5** | Error codes are documented and consistent | MEDIUM | Check error code enum |
| **SL6** | Sensitive data not included in error messages | CRITICAL | Review error message strings |
| **SL7** | External errors wrapped with context | HIGH | Check catch blocks calling external services |
| **SL8** | Timeouts configured for all I/O operations | HIGH | Check HTTP clients, DB connections |

**Service Error Pattern:**
```typescript
// src/services/ticket.service.ts
export class TicketService {
  async purchase(userId: string, eventId: string, quantity: number): Promise<Ticket[]> {
    // Validate business rules
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw new NotFoundError('Event not found', { eventId });
    }
    
    if (event.availableTickets < quantity) {
      throw new BusinessRuleError('Insufficient tickets available', {
        code: 'INSUFFICIENT_INVENTORY',
        requested: quantity,
        available: event.availableTickets
      });
    }
    
    // External service call with error wrapping
    let paymentIntent;
    try {
      paymentIntent = await this.stripeService.createPaymentIntent({
        amount: event.priceInCents * quantity,
        currency: 'usd',
        metadata: { eventId, userId, quantity }
      });
    } catch (error) {
      throw new ExternalServiceError('Payment processing failed', {
        service: 'stripe',
        operation: 'createPaymentIntent',
        cause: error
      });
    }
    
    // Database operation with transaction
    try {
      return await this.db.transaction(async (trx) => {
        await this.eventRepo.decrementAvailable(eventId, quantity, trx);
        return this.ticketRepo.createMany(userId, eventId, quantity, paymentIntent.id, trx);
      });
    } catch (error) {
      // Refund on database failure
      await this.stripeService.refund(paymentIntent.id).catch(refundError => {
        this.logger.error('Refund failed after DB error', { refundError, paymentIntent });
      });
      throw new DatabaseError('Failed to create tickets', { cause: error });
    }
  }
}
```

---

### 3.3 Knex/Database Error Handling Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **DB1** | All queries wrapped in try/catch | HIGH | Review repository files |
| **DB2** | Transactions used for multi-operation writes | CRITICAL | Check service methods with multiple writes |
| **DB3** | Transaction errors trigger rollback | CRITICAL | Review transaction code |
| **DB4** | Connection pool errors handled | HIGH | Check pool configuration |
| **DB5** | Database errors NOT exposed to clients | CRITICAL | Test constraint violation response |
| **DB6** | Unique constraint violations return 409 Conflict | MEDIUM | Test duplicate insert |
| **DB7** | Foreign key violations return 400/422 | MEDIUM | Test invalid reference |
| **DB8** | Query timeouts configured | HIGH | Check `acquireTimeoutMillis` |
| **DB9** | Connection pool has error event handler | HIGH | `grep -r "pool.*error" src/` |
| **DB10** | Migrations handle errors gracefully | MEDIUM | Review migration files |

**Knex Error Handling Pattern:**
```typescript
// src/repositories/base.repository.ts
export class BaseRepository {
  constructor(protected db: Knex) {}
  
  protected async executeQuery<T>(
    operation: string,
    query: () => Promise<T>
  ): Promise<T> {
    try {
      return await query();
    } catch (error) {
      throw this.transformDatabaseError(error, operation);
    }
  }
  
  private transformDatabaseError(error: any, operation: string): AppError {
    // PostgreSQL error codes
    switch (error.code) {
      case '23505': // unique_violation
        return new ConflictError('Resource already exists', {
          code: 'DUPLICATE_ENTRY',
          constraint: error.constraint,
          detail: error.detail
        });
      
      case '23503': // foreign_key_violation
        return new ValidationError('Referenced resource does not exist', {
          code: 'INVALID_REFERENCE',
          constraint: error.constraint
        });
      
      case '23502': // not_null_violation
        return new ValidationError('Required field is missing', {
          code: 'MISSING_REQUIRED_FIELD',
          column: error.column
        });
      
      case '57014': // query_canceled (timeout)
        return new TimeoutError('Database query timed out', {
          operation,
          timeout: this.db.client.config.pool?.acquireTimeoutMillis
        });
      
      case 'ECONNREFUSED':
      case 'ETIMEDOUT':
        return new ServiceUnavailableError('Database connection failed', {
          code: 'DATABASE_UNAVAILABLE'
        });
      
      default:
        return new DatabaseError('Database operation failed', {
          operation,
          originalCode: error.code,
          cause: error
        });
    }
  }
}

// Knex configuration with pool error handling
const knexConfig: Knex.Config = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    propagateCreateError: false
  }
};

// Pool error handling
const db = knex(knexConfig);
db.client.pool.on('error', (error: Error) => {
  logger.error('Database pool error', { error });
});
```

**Transaction Pattern:**
```typescript
async function transferTicket(ticketId: string, fromUserId: string, toUserId: string) {
  const trx = await db.transaction();
  
  try {
    // Lock the ticket row
    const ticket = await trx('tickets')
      .where({ id: ticketId, owner_id: fromUserId })
      .forUpdate()
      .first();
    
    if (!ticket) {
      throw new NotFoundError('Ticket not found or not owned by user');
    }
    
    // Update ownership
    await trx('tickets')
      .where({ id: ticketId })
      .update({ owner_id: toUserId, transferred_at: new Date() });
    
    // Create transfer record
    await trx('ticket_transfers').insert({
      ticket_id: ticketId,
      from_user_id: fromUserId,
      to_user_id: toUserId
    });
    
    await trx.commit();
  } catch (error) {
    await trx.rollback();
    throw error;  // Re-throw after rollback
  }
}
```

**Source:** https://knexjs.org/faq/recipes

---

### 3.4 External Integration Checklist

#### Stripe Integration

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **ST1** | Webhook signature verified before processing | CRITICAL | Check `stripe.webhooks.constructEvent` |
| **ST2** | Webhook handler returns 200 even on processing errors | CRITICAL | Review webhook endpoint |
| **ST3** | Idempotency keys used for all POST requests | HIGH | Check `idempotencyKey` option |
| **ST4** | Stripe errors caught and categorized | HIGH | Review try/catch around Stripe calls |
| **ST5** | Rate limit errors handled with backoff | MEDIUM | Check for 429 handling |
| **ST6** | Webhook events deduplicated | HIGH | Check event ID storage |
| **ST7** | Card decline errors return user-friendly messages | MEDIUM | Test declined card response |
| **ST8** | API version locked to prevent breaking changes | MEDIUM | Check Stripe client initialization |

**Stripe Error Handling Pattern:**
```typescript
// src/services/stripe.service.ts
import Stripe from 'stripe';

export class StripeService {
  private stripe: Stripe;
  
  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',  // Lock API version
      maxNetworkRetries: 2
    });
  }
  
  async createPaymentIntent(params: CreatePaymentParams): Promise<Stripe.PaymentIntent> {
    try {
      return await this.stripe.paymentIntents.create({
        amount: params.amount,
        currency: params.currency,
        metadata: params.metadata
      }, {
        idempotencyKey: params.idempotencyKey  // ALWAYS use
      });
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }
  
  private handleStripeError(error: any): AppError {
    if (error instanceof Stripe.errors.StripeError) {
      switch (error.type) {
        case 'StripeCardError':
          return new PaymentError(this.getCardErrorMessage(error.code), {
            code: 'CARD_DECLINED',
            decline_code: error.decline_code,
            // Safe to expose these to users
            userMessage: this.getCardErrorMessage(error.code)
          });
        
        case 'StripeRateLimitError':
          return new RateLimitError('Payment service rate limited', {
            retryAfter: 60
          });
        
        case 'StripeInvalidRequestError':
          return new ValidationError('Invalid payment request', {
            param: error.param
          });
        
        case 'StripeAPIError':
        case 'StripeConnectionError':
          return new ExternalServiceError('Payment service unavailable', {
            service: 'stripe',
            retryable: true
          });
        
        case 'StripeAuthenticationError':
          // This is a configuration error - alert ops
          this.alerting.critical('Stripe authentication failed');
          return new InternalError('Payment configuration error');
      }
    }
    
    return new ExternalServiceError('Payment processing failed', {
      service: 'stripe',
      cause: error
    });
  }
  
  private getCardErrorMessage(code: string | undefined): string {
    const messages: Record<string, string> = {
      'card_declined': 'Your card was declined. Please try a different card.',
      'insufficient_funds': 'Insufficient funds. Please try a different card.',
      'expired_card': 'Your card has expired. Please use a different card.',
      'incorrect_cvc': 'The security code is incorrect. Please check and try again.',
      'processing_error': 'An error occurred processing your card. Please try again.'
    };
    return messages[code || ''] || 'Your card could not be charged. Please try again.';
  }
}
```

**Source:** https://docs.stripe.com/error-handling?lang=node

#### Solana Integration

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **SOL1** | Transaction confirmation awaited properly | CRITICAL | Check `confirmTransaction` usage |
| **SOL2** | Blockhash expiry handled with retry | CRITICAL | Check `TransactionExpiredBlockheightExceededError` handling |
| **SOL3** | Transaction simulation errors caught | HIGH | Check preflight error handling |
| **SOL4** | RPC errors categorized (timeout vs rejection) | HIGH | Review Solana client error handling |
| **SOL5** | Multiple RPC endpoints configured for failover | MEDIUM | Check RPC configuration |
| **SOL6** | Compute budget estimated before sending | MEDIUM | Check `simulateTransaction` usage |
| **SOL7** | Priority fees added during congestion | MEDIUM | Check fee configuration |
| **SOL8** | Transaction status polled until finalized | HIGH | Check confirmation strategy |

**Solana Error Handling Pattern:**
```typescript
// src/services/solana.service.ts
import { 
  Connection, 
  Transaction, 
  sendAndConfirmTransaction,
  TransactionExpiredBlockheightExceededError
} from '@solana/web3.js';

export class SolanaService {
  private connections: Connection[];
  private currentConnectionIndex = 0;
  
  constructor() {
    // Multiple RPC endpoints for redundancy
    this.connections = [
      new Connection(process.env.SOLANA_RPC_PRIMARY!, 'confirmed'),
      new Connection(process.env.SOLANA_RPC_SECONDARY!, 'confirmed')
    ];
  }
  
  async sendTransaction(
    transaction: Transaction,
    signers: Keypair[],
    options: { maxRetries?: number } = {}
  ): Promise<string> {
    const maxRetries = options.maxRetries || 3;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const connection = this.getConnection();
      
      try {
        // Get fresh blockhash for each attempt
        const { blockhash, lastValidBlockHeight } = 
          await connection.getLatestBlockhash('finalized');
        
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        
        // Simulate first
        const simulation = await connection.simulateTransaction(transaction);
        if (simulation.value.err) {
          throw new TransactionSimulationError(
            'Transaction simulation failed',
            simulation.value.err,
            simulation.value.logs
          );
        }
        
        // Send and confirm
        const signature = await sendAndConfirmTransaction(
          connection,
          transaction,
          signers,
          {
            commitment: 'confirmed',
            maxRetries: 0  // We handle retries ourselves
          }
        );
        
        return signature;
        
      } catch (error) {
        lastError = error as Error;
        
        if (error instanceof TransactionExpiredBlockheightExceededError) {
          // Blockhash expired - get new one and retry
          this.logger.warn('Transaction expired, retrying', { attempt });
          continue;
        }
        
        if (this.isNetworkError(error)) {
          // Switch to backup RPC
          this.rotateConnection();
          continue;
        }
        
        // Non-retryable error
        throw this.transformSolanaError(error);
      }
    }
    
    throw new BlockchainError('Transaction failed after max retries', {
      cause: lastError,
      attempts: maxRetries
    });
  }
  
  private transformSolanaError(error: any): AppError {
    if (error.message?.includes('insufficient funds')) {
      return new InsufficientFundsError('Wallet has insufficient SOL', {
        code: 'INSUFFICIENT_SOL'
      });
    }
    
    if (error.message?.includes('custom program error')) {
      return new SmartContractError('NFT program error', {
        programError: error.message
      });
    }
    
    return new BlockchainError('Solana transaction failed', {
      cause: error
    });
  }
  
  private getConnection(): Connection {
    return this.connections[this.currentConnectionIndex];
  }
  
  private rotateConnection(): void {
    this.currentConnectionIndex = 
      (this.currentConnectionIndex + 1) % this.connections.length;
  }
  
  private isNetworkError(error: any): boolean {
    return error.message?.includes('ECONNREFUSED') ||
           error.message?.includes('ETIMEDOUT') ||
           error.message?.includes('fetch failed');
  }
}
```

**Source:** https://solana.com/docs/advanced/retry, https://docs.chainstack.com/docs/solana-how-to-handle-the-transaction-expiry-error

---

### 3.5 Distributed Systems Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **DS1** | Correlation ID generated at API gateway | CRITICAL | Check first service in chain |
| **DS2** | Correlation ID propagated in all service calls | CRITICAL | Check HTTP client headers |
| **DS3** | Correlation ID included in all logs | CRITICAL | `grep -r "correlationId" src/` |
| **DS4** | Circuit breaker implemented for external services | HIGH | Check service clients |
| **DS5** | Timeouts configured for all inter-service calls | CRITICAL | Check HTTP client configuration |
| **DS6** | Retry logic with exponential backoff | HIGH | Review retry configuration |
| **DS7** | Dead letter queues for failed async operations | HIGH | Check queue configuration |
| **DS8** | Error responses include source service | MEDIUM | Check error `instance` field |
| **DS9** | Health checks report dependency status | MEDIUM | Test `/health` endpoint |
| **DS10** | Graceful degradation when dependencies fail | MEDIUM | Test with dependency down |

**Circuit Breaker Pattern:**
```typescript
import CircuitBreaker from 'opossum';

const paymentCircuitBreaker = new CircuitBreaker(
  async (params: PaymentParams) => stripeService.charge(params),
  {
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 5
  }
);

paymentCircuitBreaker.on('open', () => {
  logger.warn('Payment circuit breaker opened');
  alerting.warn('Stripe service degraded');
});

paymentCircuitBreaker.on('halfOpen', () => {
  logger.info('Payment circuit breaker half-open, testing...');
});

paymentCircuitBreaker.on('close', () => {
  logger.info('Payment circuit breaker closed');
});

paymentCircuitBreaker.fallback(() => {
  throw new ServiceUnavailableError('Payment service temporarily unavailable', {
    retryAfter: 30
  });
});
```

---

### 3.6 Background Jobs Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **BJ1** | Worker has error event listener | CRITICAL | `grep -r "worker.on.*error" src/` |
| **BJ2** | Failed jobs have retry configuration | HIGH | Check job options |
| **BJ3** | Max retries configured per job type | HIGH | Review job definitions |
| **BJ4** | Exponential backoff configured | MEDIUM | Check backoff settings |
| **BJ5** | Dead letter queue for permanently failed jobs | HIGH | Check DLQ configuration |
| **BJ6** | Stalled job detection enabled | HIGH | Check worker settings |
| **BJ7** | Job progress tracked for long operations | MEDIUM | Check `job.updateProgress` usage |
| **BJ8** | Completed/failed job cleanup configured | MEDIUM | Check `removeOnComplete/removeOnFail` |
| **BJ9** | Job data includes correlation ID | HIGH | Check job payload structure |
| **BJ10** | Workers don't swallow errors | CRITICAL | Review worker processor functions |

---

---

## 04 - 04-logging-observability

### 3.1 Log Configuration Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **LC1** | Structured JSON logging enabled | CRITICAL | `logger.info()` outputs JSON |
| **LC2** | Appropriate log level per environment | HIGH | Production: `info`, Dev: `debug` |
| **LC3** | Redaction configured for sensitive fields | CRITICAL | Check `redact` paths in config |
| **LC4** | Correlation ID middleware installed | CRITICAL | Check `X-Correlation-ID` header handling |
| **LC5** | Request ID generation enabled | HIGH | Check Fastify `requestIdHeader` config |
| **LC6** | Timestamps in ISO 8601 format | MEDIUM | `"time":"2024-01-15T10:30:00.000Z"` |
| **LC7** | Service name/version in base context | HIGH | Check `base` config in Pino |
| **LC8** | Log destination configured (stdout/file) | HIGH | Verify log shipping |
| **LC9** | Log rotation configured | MEDIUM | Check file size/time rotation |
| **LC10** | pino-pretty disabled in production | MEDIUM | Performance impact |

**Verification Script:**

```bash
# Check log configuration
grep -rn "logger:" src/ --include="*.ts"
grep -rn "redact:" src/ --include="*.ts"
grep -rn "pino-pretty" src/ --include="*.ts"
grep -rn "correlationId\|correlation-id" src/ --include="*.ts"
```

---

### 3.2 Sensitive Data Protection Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **SD1** | Passwords never logged | CRITICAL | Search logs for "password" |
| **SD2** | Tokens/API keys redacted | CRITICAL | Check `authorization` header handling |
| **SD3** | PII fields redacted | CRITICAL | Check for email, phone, SSN patterns |
| **SD4** | Credit card data never logged | CRITICAL | PCI-DSS requirement |
| **SD5** | Session tokens redacted | CRITICAL | Check cookie handling |
| **SD6** | Stripe sensitive data filtered | HIGH | No full card numbers |
| **SD7** | Solana private keys never logged | CRITICAL | Check wallet operations |
| **SD8** | Request body logging filtered | HIGH | Check body serializer |
| **SD9** | Error stack traces controlled | MEDIUM | No stacks in production |
| **SD10** | Database queries sanitized | HIGH | No raw SQL with values |

**Pino Redaction Template:**

```typescript
const REDACT_PATHS = [
  // Authentication
  '*.password',
  '*.passwordHash',
  '*.currentPassword',
  '*.newPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.apiKey',
  '*.secret',
  
  // Request headers
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  
  // PII
  '*.email',
  '*.phone',
  '*.ssn',
  '*.socialSecurityNumber',
  '*.dateOfBirth',
  '*.address',
  
  // Financial
  '*.creditCard',
  '*.cardNumber',
  '*.cvv',
  '*.cvc',
  '*.bankAccount',
  '*.routingNumber',
  
  // Stripe
  '*.stripeCustomerId',
  'req.body.paymentMethodId',
  
  // Solana
  '*.privateKey',
  '*.secretKey',
  '*.mnemonic',
  '*.seed',
  '*.keypair'
];
```

---

### 3.3 Security Event Logging Checklist

| ID | Event Category | Events to Log | Level |
|----|----------------|---------------|-------|
| **SE1** | Authentication | Login success/failure | INFO/WARN |
| **SE2** | Authentication | Logout | INFO |
| **SE3** | Authentication | Password change/reset | INFO |
| **SE4** | Authentication | MFA enable/disable | INFO/WARN |
| **SE5** | Authorization | Access denied | WARN |
| **SE6** | Authorization | Role/permission changes | INFO |
| **SE7** | Session | Creation/expiry/revocation | INFO |
| **SE8** | Input Validation | Validation failures | WARN |
| **SE9** | Rate Limiting | Limit exceeded | WARN |
| **SE10** | Transactions | Payment success/failure | INFO/WARN |
| **SE11** | Transactions | Refunds issued | INFO |
| **SE12** | Data Access | Bulk exports | INFO |
| **SE13** | Data Access | Sensitive data access | INFO |
| **SE14** | Admin Actions | User management | INFO |
| **SE15** | Admin Actions | Configuration changes | WARN |

**Source:** https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

---

### 3.4 Service-Specific Checklist

#### Fastify/Pino Configuration

| ID | Check | Severity |
|----|-------|----------|
| **FP1** | `logger: true` or custom config in Fastify options | CRITICAL |
| **FP2** | `request.log` used instead of global logger | HIGH |
| **FP3** | `serializers` configured for req/res | HIGH |
| **FP4** | `genReqId` configured for request tracking | HIGH |
| **FP5** | Child loggers used for context | MEDIUM |
| **FP6** | Async logging enabled (`sync: false`) | MEDIUM |

#### Stripe Integration Logging

| ID | Check | Severity |
|----|-------|----------|
| **ST1** | Webhook events logged with event ID | HIGH |
| **ST2** | Payment intent IDs logged (not full card) | HIGH |
| **ST3** | Customer IDs hashed in logs | MEDIUM |
| **ST4** | Stripe API errors logged with code | HIGH |
| **ST5** | Idempotency keys logged | MEDIUM |

```typescript
// Stripe logging example
stripeWebhookHandler.on('payment_intent.succeeded', async (event) => {
  logger.info({
    event: 'stripe_webhook',
    stripeEventId: event.id,
    stripeEventType: event.type,
    paymentIntentId: event.data.object.id,
    amount: event.data.object.amount,
    currency: event.data.object.currency
    // NEVER log: customer email, card details
  });
});
```

#### Solana Integration Logging

| ID | Check | Severity |
|----|-------|----------|
| **SOL1** | Transaction signatures logged | HIGH |
| **SOL2** | Wallet addresses logged (public only) | HIGH |
| **SOL3** | Private keys NEVER logged | CRITICAL |
| **SOL4** | RPC errors logged with endpoint | HIGH |
| **SOL5** | Confirmation status logged | MEDIUM |

```typescript
// Solana logging example
logger.info({
  event: 'solana_transaction',
  signature: transaction.signature,
  status: confirmationStatus,
  slot: slot,
  walletAddress: publicKey.toBase58(),  // Public key only
  // NEVER log: privateKey, secretKey, mnemonic
});
```

---

### 3.5 Distributed Tracing Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **DT1** | OpenTelemetry SDK initialized | HIGH | Check `tracing.ts` |
| **DT2** | Auto-instrumentation enabled | HIGH | HTTP, DB, Redis instrumented |
| **DT3** | Service name configured | HIGH | `OTEL_SERVICE_NAME` set |
| **DT4** | Trace ID in all logs | HIGH | Check log output |
| **DT5** | Context propagation to downstream | CRITICAL | Headers forwarded |
| **DT6** | Error spans recorded | HIGH | `span.recordException()` used |
| **DT7** | Custom spans for business logic | MEDIUM | Key operations traced |
| **DT8** | Sampling configured for production | MEDIUM | Avoid 100% in high-traffic |

---

### 3.6 Metrics Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **M1** | `/metrics` endpoint exposed | HIGH | Prometheus can scrape |
| **M2** | HTTP request rate tracked | HIGH | `http_requests_total` |
| **M3** | HTTP request duration tracked | HIGH | `http_request_duration_seconds` |
| **M4** | Error rate trackable | HIGH | Status code labels |
| **M5** | Default Node.js metrics enabled | MEDIUM | Memory, CPU, GC |
| **M6** | Business metrics defined | MEDIUM | Tickets, payments, etc. |
| **M7** | Label cardinality controlled | HIGH | No user IDs in labels |
| **M8** | Histogram buckets appropriate | MEDIUM | Check latency buckets |

---

### 3.7 Quick Grep Audit Commands

```bash
# Find logging without correlation ID
grep -rn "logger\.\(info\|warn\|error\)" src/ --include="*.ts" | grep -v correlationId

# Find potential sensitive data logging
grep -rn "password\|token\|secret\|apiKey" src/ --include="*.ts" | grep "log"

# Find console.log usage (should use logger)
grep -rn "console\.\(log\|error\|warn\)" src/ --include="*.ts"

# Verify redaction is configured
grep -rn "redact:" src/ --include="*.ts"

# Check for stack traces in production
grep -rn "err\.stack\|error\.stack" src/ --include="*.ts"

# Find missing error logging
grep -rn "catch\s*(" src/ --include="*.ts" -A3 | grep -v "log"

# Check OpenTelemetry setup
grep -rn "@opentelemetry" src/ --include="*.ts"
```

---

---

## 05 - 05-service-to-service-auth

### Service Client Checklist (Calling Other Services)

#### Authentication Configuration
| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| 1 | Service uses mTLS OR signed tokens (JWT/HMAC) for all outbound calls | | |
| 2 | Service credentials are NOT hardcoded in source code | | |
| 3 | Service credentials are retrieved from secrets manager at runtime | | |
| 4 | Each service has its own unique credentials (not shared) | | |
| 5 | Short-lived credentials or tokens used (< 1 hour preferred) | | |
| 6 | Credential rotation is automated | | |
| 7 | Failed authentication attempts are logged | | |

#### Request Security
| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| 8 | All internal HTTP calls use HTTPS/TLS | | |
| 9 | Service identity included in every request (header or cert) | | |
| 10 | Correlation ID propagated to downstream services | | |
| 11 | Request timeout configured to prevent hanging | | |
| 12 | Circuit breaker implemented for downstream failures | | |

#### Node.js/Fastify Specific
| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| 13 | HTTP client configured with TLS certificate validation | | |
| 14 | `undici` or `got` used (not deprecated `request`) | | |
| 15 | No `NODE_TLS_REJECT_UNAUTHORIZED=0` in production | | |
| 16 | Client includes service identity header | | |

**Quick Grep Commands for Clients:**
```bash
# Find hardcoded credentials
grep -rn "password\s*[=:]" src/ --include="*.ts" --include="*.js"
grep -rn "apiKey\s*[=:]" src/ --include="*.ts" --include="*.js"

# Check for disabled TLS verification
grep -rn "rejectUnauthorized.*false" src/
grep -rn "NODE_TLS_REJECT_UNAUTHORIZED" .

# Find HTTP (not HTTPS) internal calls
grep -rn "http://.*\.internal" src/
grep -rn "http://.*\.local" src/

# Check for missing correlation ID propagation
grep -rn "x-correlation-id" src/  # Should exist in client code
```

---

### Service Endpoint Checklist (Receiving Requests)

#### Authentication Enforcement
| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| 1 | ALL endpoints require authentication (no exceptions for "internal" routes) | | |
| 2 | Authentication middleware applied globally (not per-route) | | |
| 3 | Token/certificate verification uses cryptographic validation | | |
| 4 | Tokens verified with signature check (not just decoded) | | |
| 5 | Token expiration (`exp`) checked | | |
| 6 | Token issuer (`iss`) validated against allowlist | | |
| 7 | Token audience (`aud`) validated | | |

#### Authorization
| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| 8 | Service identity extracted and verified from request | | |
| 9 | Per-endpoint authorization rules defined | | |
| 10 | Allowlist of services that can call each endpoint | | |
| 11 | Unauthorized access attempts logged | | |
| 12 | No default-allow authorization policy | | |

#### Audit Logging
| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| 13 | Caller service identity logged for every request | | |
| 14 | Correlation ID logged for tracing | | |
| 15 | Request success/failure status logged | | |
| 16 | Sensitive operations logged with additional context | | |
| 17 | Logs sent to centralized logging system | | |

#### Node.js/Fastify Specific
| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| 18 | `@fastify/jwt` or similar used for JWT validation | | |
| 19 | JWT secret loaded from secrets manager, not env var | | |
| 20 | `preHandler` hook used for consistent authentication | | |
| 21 | Request logging includes caller identification | | |
| 22 | Fastify `onError` hook logs authentication failures | | |

**Quick Grep Commands for Endpoints:**
```bash
# Find routes without authentication
grep -rn "fastify\.(get|post|put|delete|patch)" src/ | grep -v "preHandler"

# Check JWT configuration
grep -rn "jwt\." src/ --include="*.ts"

# Find potential bypass routes
grep -rn "skipAuth" src/
grep -rn "noAuth" src/
grep -rn "public" src/routes/

# Verify token verification (not just decode)
grep -rn "jwt\.decode" src/  # Should be jwt.verify instead
grep -rn "jwt\.verify" src/  # Should exist
```

---

### Service Identity Verification Checklist

#### For mTLS
| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| 1 | Mutual TLS enabled (client cert required) | | |
| 2 | CA bundle limited to internal CA only | | |
| 3 | Client certificate CN or SAN validated | | |
| 4 | Certificate revocation list (CRL) or OCSP checked | | |
| 5 | Certificate expiration handled gracefully | | |
| 6 | Certificate rotation automated | | |

#### For JWT Service Tokens
| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| 7 | Token signature algorithm is RS256 or ES256 (asymmetric) | | |
| 8 | Public key for verification retrieved securely | | |
| 9 | `sub` claim contains service identity | | |
| 10 | `iss` claim validated against known issuers | | |
| 11 | `aud` claim includes this service | | |
| 12 | `exp` claim checked (short expiration preferred) | | |
| 13 | Token not accepted if expired | | |

#### For HMAC Signatures
| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| 14 | Signature algorithm is SHA-256 or stronger | | |
| 15 | Timestamp included and validated (prevent replay) | | |
| 16 | Clock skew tolerance is reasonable (< 30 seconds) | | |
| 17 | Request body included in signature | | |
| 18 | Signature comparison uses constant-time function | | |
| 19 | Per-service secrets used (not shared) | | |

---

### Message Queue Security Checklist

#### RabbitMQ
| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| 1 | TLS/SSL enabled for connections | | |
| 2 | Each service has unique credentials | | |
| 3 | Permissions restricted per service (configure/write/read) | | |
| 4 | Virtual hosts used to isolate environments | | |
| 5 | Default guest user disabled | | |
| 6 | Management plugin access restricted | | |

#### Apache Kafka
| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| 7 | SASL authentication enabled | | |
| 8 | SSL/TLS encryption for inter-broker and client traffic | | |
| 9 | ACLs configured per topic and consumer group | | |
| 10 | Each service has unique principal | | |
| 11 | ZooKeeper authentication enabled | | |
| 12 | Network segmentation for Kafka cluster | | |

**Node.js Client Configuration:**
```javascript
// RabbitMQ with amqplib
const conn = await amqp.connect({
  protocol: 'amqps',  // Must be amqps, not amqp
  hostname: process.env.RABBITMQ_HOST,
  username: await secretsManager.getSecret('rabbitmq/order-service/username'),
  password: await secretsManager.getSecret('rabbitmq/order-service/password'),
  vhost: 'production',
  ssl: {
    ca: [fs.readFileSync('/etc/ssl/rabbitmq-ca.pem')],
    cert: fs.readFileSync('/etc/ssl/order-service-cert.pem'),
    key: fs.readFileSync('/etc/ssl/order-service-key.pem')
  }
});

// Kafka with kafkajs
const kafka = new Kafka({
  clientId: 'order-service',
  brokers: process.env.KAFKA_BROKERS.split(','),
  ssl: {
    ca: [fs.readFileSync('/etc/ssl/kafka-ca.pem')],
    cert: fs.readFileSync('/etc/ssl/order-service-cert.pem'),
    key: fs.readFileSync('/etc/ssl/order-service-key.pem')
  },
  sasl: {
    mechanism: 'scram-sha-512',
    username: await secretsManager.getSecret('kafka/order-service/username'),
    password: await secretsManager.getSecret('kafka/order-service/password')
  }
});
```

---

### Secrets Management Checklist

| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| 1 | Secrets manager in use (Vault, AWS Secrets Manager, etc.) | | |
| 2 | No secrets in source code | | |
| 3 | No secrets in environment variables for production | | |
| 4 | No secrets in CI/CD configuration files | | |
| 5 | Secrets not logged anywhere | | |
| 6 | Each service has unique secrets | | |
| 7 | Automatic secret rotation configured | | |
| 8 | Secret access is audited | | |
| 9 | Least privilege access to secrets | | |
| 10 | Emergency rotation procedure documented | | |

**Secrets Detection Commands:**
```bash
# Git history scan for secrets
git log -p | grep -E "(password|secret|api_key|apiKey|token)" | head -50

# Find potential secrets in code
grep -rn "-----BEGIN" src/  # Private keys
grep -rn "AKIA" src/        # AWS access keys
grep -rn "sk_live_" src/    # Stripe keys
grep -rn "sk_test_" src/    # Stripe test keys

# Docker image scan
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image your-service:latest --scanners secret
```

---

### Network Security Checklist

| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| 1 | All internal traffic encrypted (TLS/mTLS) | | |
| 2 | Network policies restrict service-to-service communication | | |
| 3 | Services cannot reach arbitrary external endpoints | | |
| 4 | Egress filtering configured | | |
| 5 | Internal DNS used (not public DNS for internal services) | | |
| 6 | No services exposed directly to internet without gateway | | |
| 7 | Service mesh or network policies enforce allowlists | | |

---

---

## 06 - 06-database-integrity

### 3.1 Migration Audit Checklist

For each migration file in your Knex migrations:

#### Schema Definition
- [ ] **Foreign keys defined for all relationships**
  - Check: Every `_id` column has corresponding REFERENCES
  - Check: ON DELETE action explicitly specified (not relying on default)
  
- [ ] **Appropriate ON DELETE actions**
  - RESTRICT for critical relationships (payments → users)
  - CASCADE for owned data (event → event_images)
  - SET NULL for optional relationships

- [ ] **Primary keys on all tables**
  - Check: Using UUID or SERIAL
  - Check: Composite keys where appropriate (tenant_id + id)

- [ ] **Unique constraints where needed**
  ```javascript
  // Check for patterns like:
  table.unique(['tenant_id', 'email']);
  table.unique(['event_id', 'section', 'row', 'seat']);
  ```

- [ ] **NOT NULL on required fields**
  - Check: Business-critical fields marked NOT NULL
  - Check: Foreign keys NOT NULL unless optional relationship

- [ ] **CHECK constraints for valid ranges**
  ```javascript
  // Look for:
  table.check('price > 0');
  table.check('quantity >= 0');
  table.check("status IN ('active', 'cancelled')");
  ```

- [ ] **Indexes on frequently queried columns**
  - Foreign key columns (implicit in some DBs, not PostgreSQL)
  - Status columns used in WHERE clauses
  - Timestamp columns used for sorting

#### Multi-Tenant Specific
- [ ] **tenant_id column on all tenant-scoped tables**
- [ ] **tenant_id included in all unique constraints**
- [ ] **tenant_id indexed (usually part of composite index)**
- [ ] **Row Level Security policies defined**

#### Soft Delete Handling
- [ ] **If using soft deletes, partial unique indexes exist**
  ```javascript
  knex.raw(`
    CREATE UNIQUE INDEX idx_users_email_active 
    ON users (tenant_id, email) 
    WHERE deleted_at IS NULL
  `);
  ```

---

### 3.2 Repository/Model Layer Checklist

For each repository or data access file:

#### Transaction Usage
- [ ] **Multi-step operations wrapped in transactions**
  ```typescript
  // CORRECT
  await knex.transaction(async (trx) => {
    await trx('payments').insert(payment);
    await trx('tickets').update({ owner_id: userId });
  });
  ```

- [ ] **Transaction passed through to all operations**
  ```typescript
  // Check that trx is used, not knex
  async function createOrder(data: OrderData, trx: Knex.Transaction) {
    await trx('orders').insert(data); // ✓
    await knex('order_items').insert(items); // ✗ BUG!
  }
  ```

- [ ] **Proper error handling with rollback**
  ```typescript
  // Errors should propagate, causing automatic rollback
  await knex.transaction(async (trx) => {
    await trx('table').insert(data);
    throw new Error('Something failed'); // Transaction rolled back
  });
  ```

- [ ] **No external API calls inside transactions**
  ```typescript
  // WRONG - holds transaction open during API call
  await knex.transaction(async (trx) => {
    await trx('tickets').update(data);
    await stripeApi.charge(); // BAD!
  });
  ```

#### Locking
- [ ] **FOR UPDATE used for critical read-modify-write**
  ```typescript
  await trx('tickets')
    .where({ id: ticketId })
    .forUpdate()
    .first();
  ```

- [ ] **FOR UPDATE SKIP LOCKED for queue-like operations**
  ```typescript
  // Get next available ticket without blocking
  const ticket = await trx('tickets')
    .where({ status: 'available' })
    .forUpdate()
    .skipLocked()
    .first();
  ```

#### Query Patterns
- [ ] **Atomic updates instead of read-modify-write**
  ```typescript
  // CORRECT
  await knex('inventory')
    .where('event_id', eventId)
    .andWhere('available', '>', 0)
    .decrement('available', 1);
  
  // WRONG
  const inv = await knex('inventory').where('event_id', eventId).first();
  await knex('inventory').update({ available: inv.available - 1 });
  ```

- [ ] **Batch operations instead of loops**
  ```typescript
  // CORRECT
  await knex('tickets').whereIn('id', ticketIds).update({ status: 'sold' });
  
  // WRONG
  for (const id of ticketIds) {
    await knex('tickets').where({ id }).update({ status: 'sold' });
  }
  ```

- [ ] **Joins or batch loading for related data**
  ```typescript
  // Check for N+1 patterns:
  const events = await knex('events');
  for (const e of events) {
    e.venue = await knex('venues').where('id', e.venue_id); // N+1!
  }
  ```

#### Multi-Tenant
- [ ] **tenant_id included in all queries**
  ```typescript
  // Every query should filter by tenant
  await knex('tickets')
    .where({ tenant_id: ctx.tenantId, event_id: eventId });
  ```

- [ ] **RLS context set at request start**
  ```typescript
  // In middleware
  await knex.raw(`SET app.current_tenant_id = '${tenantId}'`);
  ```

---

### 3.3 Race Condition Checklist

For critical operations:

#### Ticket Purchase Flow
- [ ] Check inventory availability with lock
- [ ] Decrement inventory atomically
- [ ] Create ticket record in same transaction
- [ ] Handle serialization failures with retry
- [ ] Idempotency key to prevent double-purchase

```typescript
// Audit pattern:
async function purchaseTicket(eventId: string, userId: string, idempotencyKey: string) {
  // Check idempotency first
  const existing = await knex('idempotency_keys').where({ key: idempotencyKey }).first();
  if (existing) return existing.response;
  
  return knex.transaction({ isolationLevel: 'serializable' }, async (trx) => {
    // Lock inventory row
    const inventory = await trx('inventory')
      .where({ event_id: eventId })
      .forUpdate()
      .first();
    
    if (inventory.available < 1) {
      throw new SoldOutError();
    }
    
    // Atomic decrement
    await trx('inventory')
      .where({ event_id: eventId })
      .decrement('available', 1);
    
    // Create ticket
    const [ticket] = await trx('tickets')
      .insert({ event_id: eventId, owner_id: userId })
      .returning('*');
    
    // Store idempotency result
    await trx('idempotency_keys').insert({ 
      key: idempotencyKey, 
      response: { ticketId: ticket.id } 
    });
    
    return ticket;
  });
}
```

#### Resale Flow
- [ ] Lock original ticket before creating listing
- [ ] Verify ownership inside transaction
- [ ] Prevent double-listing (unique constraint on active listings)
- [ ] Calculate royalties with locked ticket price data

#### User Balance Operations
- [ ] Lock user row before balance check
- [ ] Atomic balance update
- [ ] Transaction log entry in same transaction

---

### 3.4 Specific Queries to Run

Run these queries to audit your current database state:

```sql
-- 1. Find tables without primary keys
SELECT table_name 
FROM information_schema.tables t
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE'
AND NOT EXISTS (
  SELECT 1 FROM information_schema.table_constraints tc
  WHERE tc.table_name = t.table_name
  AND tc.constraint_type = 'PRIMARY KEY'
);

-- 2. Find foreign key columns without indexes
SELECT
  tc.table_name,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND NOT EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE tablename = tc.table_name
  AND indexdef LIKE '%' || kcu.column_name || '%'
);

-- 3. Find orphaned records (template)
SELECT 'tickets without events' as issue, COUNT(*) as count
FROM tickets t LEFT JOIN events e ON t.event_id = e.id
WHERE e.id IS NULL
UNION ALL
SELECT 'resales without tickets', COUNT(*)
FROM resales r LEFT JOIN tickets t ON r.ticket_id = t.id
WHERE t.id IS NULL
UNION ALL
SELECT 'payments without users', COUNT(*)
FROM payments p LEFT JOIN users u ON p.user_id = u.id
WHERE u.id IS NULL;

-- 4. Find tables missing tenant_id (multi-tenant)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE'
AND table_name NOT IN ('migrations', 'knex_migrations', 'knex_migrations_lock')
AND NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE columns.table_name = tables.table_name
  AND column_name = 'tenant_id'
);

-- 5. Check for tables without RLS enabled
SELECT relname
FROM pg_class
WHERE relkind = 'r'
AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND NOT relrowsecurity;

-- 6. Find duplicate records that should be unique
-- Example: duplicate active tickets per event/seat
SELECT event_id, section, row, seat_number, COUNT(*)
FROM tickets
WHERE deleted_at IS NULL
GROUP BY event_id, section, row, seat_number
HAVING COUNT(*) > 1;

-- 7. Check constraint definitions
SELECT 
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_type;
```

---

### 3.5 Knex.js Specific Checks

#### knexfile.js / Configuration
- [ ] **Connection pool appropriately sized**
  ```javascript
  pool: {
    min: 2,
    max: 10, // Adjust based on service count
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000
  }
  ```

- [ ] **Statement timeout configured**
  ```javascript
  pool: {
    afterCreate: (conn, done) => {
      conn.query('SET statement_timeout = 30000', done);
    }
  }
  ```

#### Migration Patterns
- [ ] **Down migrations implemented and tested**
- [ ] **Migrations are idempotent where possible**
- [ ] **Large data migrations use batching**
  ```javascript
  // For large updates
  const batchSize = 1000;
  let affected;
  do {
    affected = await knex.raw(`
      UPDATE tickets SET new_column = computed_value
      WHERE id IN (
        SELECT id FROM tickets 
        WHERE new_column IS NULL 
        LIMIT ${batchSize}
      )
    `);
  } while (affected.rowCount > 0);
  ```

#### Query Builder Usage
- [ ] **Using .transacting(trx) when transaction exists**
- [ ] **Not mixing trx and knex in same operation**
- [ ] **Proper error codes handled (23505 unique, 23503 FK, 40001 serialization)**

---

## Summary: Critical Items for TicketToken

Given your ticketing platform specifics:

### Must Have (P0)
1. Foreign keys on all ticket → event, transaction → user relationships
2. Pessimistic locking (FOR UPDATE) on ticket purchase flow
3. Unique constraint on (event_id, section, row, seat) for reserved seating
4. tenant_id on all tables with RLS policies
5. Idempotency keys for payment/minting operations
6. Serializable isolation for balance/royalty operations

### Should Have (P1)
1. CHECK constraints on prices, quantities, percentages
2. Indexes on all foreign key columns
3. Atomic updates for inventory management
4. Proper transaction boundaries (no external calls inside)
5. N+1 query detection in development

### Nice to Have (P2)
1. Optimistic locking (version columns) for user-facing edits
2. Audit tables for all financial operations
3. Archive tables instead of soft deletes
4. Automated orphan detection jobs

---

---

## 07 - 07-idempotency

### Payment Flow Checklist (Stripe)

| # | Check | Status |
|---|-------|--------|
| 1 | All `stripe.paymentIntents.create()` calls include `idempotencyKey` option | ☐ |
| 2 | All `stripe.charges.create()` calls include `idempotencyKey` option | ☐ |
| 3 | All `stripe.refunds.create()` calls include `idempotencyKey` option | ☐ |
| 4 | Idempotency key is generated BEFORE any Stripe API call | ☐ |
| 5 | Idempotency key is stored in database with order/transaction record | ☐ |
| 6 | Key format includes tenant_id to prevent cross-tenant collisions | ☐ |
| 7 | Key uses UUID v4 or cryptographically random component | ☐ |
| 8 | Failed requests (non-retryable) generate new idempotency key on user retry | ☐ |
| 9 | Stripe error code 400 (invalid request) triggers new key generation | ☐ |
| 10 | Payment service handles Stripe's idempotency replay responses correctly | ☐ |

**Code Search Patterns:**
```bash
# Find Stripe calls without idempotencyKey
grep -rn "stripe\.\(paymentIntents\|charges\|refunds\)\.create" --include="*.ts" \
  | grep -v "idempotencyKey"

# Verify key generation before Stripe calls
grep -B5 "stripe\.paymentIntents\.create" --include="*.ts"
```

---

### Webhook Handler Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | Webhook signature verification happens FIRST before any processing | ☐ |
| 2 | `webhook_events` table exists with unique constraint on provider event ID | ☐ |
| 3 | Event ID is checked for duplicates before processing | ☐ |
| 4 | Processing status tracked (pending/processing/completed/failed) | ☐ |
| 5 | Handler returns 200 immediately, processes asynchronously | ☐ |
| 6 | Duplicate events return 200 (not error) to prevent provider retries | ☐ |
| 7 | Event payload stored for debugging/replay capability | ☐ |
| 8 | Cleanup job removes processed events after retention period | ☐ |
| 9 | Failed events are logged with error details for investigation | ☐ |
| 10 | Concurrent webhook handling prevented via locking | ☐ |

**Webhook Events Table Verification:**
```sql
-- Check table structure
\d webhook_events

-- Verify unique constraint exists
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'webhook_events' AND constraint_type = 'UNIQUE';

-- Check for missing index on event_id
SELECT indexname FROM pg_indexes WHERE tablename = 'webhook_events';
```

---

### Ticket Purchase Flow Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | Purchase endpoint accepts/requires `Idempotency-Key` header | ☐ |
| 2 | Idempotency key validated (format, length, uniqueness scope) | ☐ |
| 3 | Duplicate purchase attempts return original purchase result | ☐ |
| 4 | Inventory reservation is atomic (SELECT FOR UPDATE or equivalent) | ☐ |
| 5 | Recovery points tracked for multi-step purchase flow | ☐ |
| 6 | Partial failures can be resumed from last successful step | ☐ |
| 7 | Idempotency record includes tenant_id for multi-tenant isolation | ☐ |
| 8 | Concurrent purchase attempts for same key return 409 Conflict | ☐ |
| 9 | Different payload with same key returns 422 Unprocessable | ☐ |
| 10 | Idempotency key TTL matches business retry window (24-72 hours) | ☐ |

**Purchase Flow State Machine:**
```
started → inventory_reserved → payment_initiated → payment_confirmed 
        → ticket_created → nft_pending → nft_minted → completed
```

---

### NFT Minting Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | Minting operation uses unique idempotency key per ticket/NFT | ☐ |
| 2 | Idempotency key includes ticket_id to prevent duplicate mints | ☐ |
| 3 | Blockchain transaction hash stored and checked before retry | ☐ |
| 4 | Pending transactions monitored for confirmation before retry | ☐ |
| 5 | NFT metadata URI is deterministic (same input = same URI) | ☐ |
| 6 | Minting failures are distinguishable from network timeouts | ☐ |
| 7 | Successfully minted NFTs update ticket record atomically | ☐ |
| 8 | Duplicate mint attempts return existing NFT details | ☐ |
| 9 | Cross-chain operations (if any) have independent idempotency | ☐ |
| 10 | Gas estimation failures don't consume idempotency key | ☐ |

**NFT Idempotency Key Pattern:**
```typescript
// Recommended format for TicketToken
const mintIdempotencyKey = `mint:${tenantId}:${eventId}:${ticketId}:${version}`;

// Track minting status
interface MintRecord {
  idempotency_key: string;
  ticket_id: string;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  transaction_hash?: string;
  token_id?: string;
  created_at: Date;
  confirmed_at?: Date;
}
```

*Source: Thirdweb - Prevent duplicate blockchain transactions with Engine (https://blog.thirdweb.com/changelog/idempotency-keys-for/)*

---

### State-Changing Operations Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | All POST endpoints modifying data support idempotency | ☐ |
| 2 | Idempotency storage is persistent (not in-memory only) | ☐ |
| 3 | Idempotency checks are atomic (no race condition window) | ☐ |
| 4 | Response includes header indicating idempotent replay | ☐ |
| 5 | Idempotency keys scoped to tenant for multi-tenant safety | ☐ |
| 6 | Key collision probability is acceptably low (UUID v4 or better) | ☐ |
| 7 | Error responses are NOT cached (only successful operations) | ☐ |
| 8 | Retryable errors (5xx, timeout) allow same-key retry | ☐ |
| 9 | Non-retryable errors (4xx validation) require new key | ☐ |
| 10 | Monitoring/alerting exists for idempotency-related errors | ☐ |

---

---

## 08 - 08-rate-limiting

### Fastify Rate Limit Configuration

| # | Check | Status |
|---|-------|--------|
| 1 | `@fastify/rate-limit` plugin is registered | ☐ |
| 2 | Redis storage configured (not in-memory) for production | ☐ |
| 3 | `trustProxy` configured correctly if behind load balancer | ☐ |
| 4 | Global rate limit is set as baseline | ☐ |
| 5 | Route-specific limits for sensitive endpoints | ☐ |
| 6 | `skipOnError: true` set to fail open if Redis unavailable | ☐ |
| 7 | `keyGenerator` uses user ID for authenticated routes | ☐ |
| 8 | `onExceeded` callback logs rate limit violations | ☐ |
| 9 | Error response includes actionable information | ☐ |
| 10 | `ban` option configured for repeat offenders | ☐ |

**Configuration Verification:**
```typescript
// Verify Fastify rate limit configuration
await fastify.register(rateLimit, {
  global: true,                    // [1] Applied globally
  max: 100,                        // Default limit
  timeWindow: '1 minute',
  redis: redisClient,              // [2] Redis storage
  keyGenerator: (req) => req.userId || req.ip, // [7] User-based
  skipOnError: true,               // [6] Fail open
  ban: 3,                          // [10] Ban after 3 violations
  onExceeded: (req, key) => {      // [8] Logging
    logger.warn({ key, path: req.url }, 'Rate limit exceeded');
  }
});
```

---

### Redis Rate Limiting Infrastructure

| # | Check | Status |
|---|-------|--------|
| 1 | Redis Cluster or Sentinel configured for high availability | ☐ |
| 2 | Connection pooling configured with appropriate limits | ☐ |
| 3 | Redis connection timeout set (prevent blocking) | ☐ |
| 4 | Atomic operations used (Lua scripts or MULTI/EXEC) | ☐ |
| 5 | Key namespacing prevents collisions (`rate-limit:user:123`) | ☐ |
| 6 | TTL set on all rate limit keys (prevents memory leaks) | ☐ |
| 7 | Redis memory limits configured | ☐ |
| 8 | Fallback behavior defined if Redis unavailable | ☐ |
| 9 | Redis latency monitored (p95, p99) | ☐ |
| 10 | Separate Redis instance for rate limiting (recommended) | ☐ |

**Redis Configuration Check:**
```bash
# Verify Redis configuration
redis-cli CONFIG GET maxmemory
redis-cli CONFIG GET maxmemory-policy  # Should be volatile-lru or similar
redis-cli INFO clients                  # Check connection count
redis-cli SLOWLOG GET 10               # Check for slow operations
```

---

### Authentication Endpoints

| # | Check | Status |
|---|-------|--------|
| 1 | `/auth/login` has strict rate limit (5-10/minute) | ☐ |
| 2 | `/auth/register` rate limited to prevent spam | ☐ |
| 3 | `/auth/forgot-password` rate limited (3/hour) | ☐ |
| 4 | `/auth/reset-password` rate limited | ☐ |
| 5 | `/auth/verify-otp` has very strict limits (5/5-minutes) | ☐ |
| 6 | Rate limiting applies by username/email, not just IP | ☐ |
| 7 | Failed attempts tracked separately from successful | ☐ |
| 8 | Account lockout after N failed attempts | ☐ |
| 9 | CAPTCHA triggers after N failed attempts | ☐ |
| 10 | GraphQL batching attacks prevented | ☐ |

**Code Search Pattern:**
```bash
# Find auth endpoints and verify rate limit configuration
grep -rn "auth" --include="*.ts" | grep -E "(post|put|patch)" 
grep -rn "rateLimit" --include="*.ts" | grep -E "(login|register|password)"
```

---

### Payment Endpoints (Stripe)

| # | Check | Status |
|---|-------|--------|
| 1 | Payment creation endpoint rate limited | ☐ |
| 2 | Limits respect Stripe's 25 req/sec default | ☐ |
| 3 | PaymentIntent updates limited (1000/hour per PI) | ☐ |
| 4 | Refund endpoints have appropriate limits | ☐ |
| 5 | Concurrent request limiting for expensive operations | ☐ |
| 6 | Webhook endpoint rate limited per source | ☐ |
| 7 | Stripe rate limit headers monitored | ☐ |
| 8 | Exponential backoff on 429 from Stripe | ☐ |
| 9 | `Stripe-Rate-Limited-Reason` header logged | ☐ |
| 10 | Test mode has same limits as production | ☐ |

**Stripe Integration Check:**
```typescript
// Verify Stripe error handling includes rate limit detection
if (error.type === 'StripeRateLimitError') {
  const retryAfter = error.headers?.['retry-after'];
  logger.warn({ retryAfter }, 'Stripe rate limit hit');
  await delay(retryAfter * 1000 || 5000);
  // Retry with exponential backoff
}
```

---

### API Endpoints by Type

**Read Operations (GET):**
| # | Check | Status |
|---|-------|--------|
| 1 | List endpoints have higher limits than writes | ☐ |
| 2 | Search endpoints have lower limits (expensive) | ☐ |
| 3 | Export/report endpoints have strict limits | ☐ |
| 4 | Pagination limits enforced (max items per page) | ☐ |
| 5 | Caching reduces load on rate-limited resources | ☐ |

**Write Operations (POST/PUT/PATCH/DELETE):**
| # | Check | Status |
|---|-------|--------|
| 1 | Create operations have moderate limits | ☐ |
| 2 | Bulk operations have stricter per-item limits | ☐ |
| 3 | Delete operations rate limited | ☐ |
| 4 | Resource-intensive writes have concurrent limits | ☐ |
| 5 | Idempotency keys required for payment writes | ☐ |

---

### Response Header Verification

| # | Check | Status |
|---|-------|--------|
| 1 | `RateLimit-Limit` header present on all responses | ☐ |
| 2 | `RateLimit-Remaining` header present on all responses | ☐ |
| 3 | `RateLimit-Reset` header present on all responses | ☐ |
| 4 | `Retry-After` header present on 429 responses | ☐ |
| 5 | 429 response body includes machine-readable error code | ☐ |
| 6 | 429 response body includes retry timing | ☐ |
| 7 | 429 response body includes documentation link | ☐ |
| 8 | 503 used (instead of 429) for system overload | ☐ |

**Header Verification Test:**
```bash
# Test rate limit headers are present
curl -v https://api.tickettoken.com/api/events 2>&1 | grep -i ratelimit

# Test 429 response format
for i in {1..100}; do
  curl -s -w "%{http_code}" https://api.tickettoken.com/auth/login \
    -d '{"email":"test@test.com","password":"wrong"}' 
done
```

---

### Webhook Endpoints

| # | Check | Status |
|---|-------|--------|
| 1 | Inbound webhook endpoints have rate limits | ☐ |
| 2 | Rate limit checked AFTER signature verification | ☐ |
| 3 | Separate limits per webhook source (Stripe, Solana, etc.) | ☐ |
| 4 | Payload size limits enforced | ☐ |
| 5 | Async processing (queue) to meet response time requirements | ☐ |
| 6 | Idempotency prevents replay abuse | ☐ |
| 7 | Outbound webhooks rate limited per destination | ☐ |
| 8 | Circuit breaker on outbound webhook failures | ☐ |

---

### Header Manipulation Protection

| # | Check | Status |
|---|-------|--------|
| 1 | `X-Forwarded-For` not blindly trusted | ☐ |
| 2 | Trusted proxy list explicitly configured | ☐ |
| 3 | Rate limiting prefers user ID over IP when authenticated | ☐ |
| 4 | Rightmost IP used from forwarded header chain | ☐ |
| 5 | IP validation before use in rate limiting | ☐ |
| 6 | Test: spoofed `X-Forwarded-For` doesn't bypass limits | ☐ |
| 7 | Test: multiple `X-Forwarded-For` headers handled correctly | ☐ |

**Bypass Test:**
```bash
# Test X-Forwarded-For bypass (should still be rate limited)
for i in {1..10}; do
  curl -H "X-Forwarded-For: 192.168.1.$i" \
    https://api.tickettoken.com/auth/login \
    -d '{"email":"test@test.com","password":"wrong"}'
done
# Should see 429 after normal limit, not 10 successful requests
```

---

---

## 09 - 09-multi-tenancy

### PostgreSQL RLS Configuration

| # | Check | Status |
|---|-------|--------|
| 1 | RLS enabled on ALL tenant-scoped tables (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) | ☐ |
| 2 | `FORCE ROW LEVEL SECURITY` applied to prevent table owner bypass | ☐ |
| 3 | Application uses non-superuser database role | ☐ |
| 4 | Application role does NOT have `BYPASSRLS` privilege | ☐ |
| 5 | RLS policies use `current_setting('app.current_tenant_id')` | ☐ |
| 6 | Policies handle NULL tenant context safely (deny access) | ☐ |
| 7 | Both `USING` and `WITH CHECK` clauses defined for INSERT/UPDATE | ☐ |
| 8 | Separate database role for migrations/admin operations | ☐ |
| 9 | System operations use dedicated bypass connection | ☐ |
| 10 | Audit logging for cross-tenant system operations | ☐ |

**SQL Verification Commands:**

```sql
-- Check RLS is enabled on all tables
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- Check policies exist
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public';

-- Verify application role doesn't have bypass
SELECT rolname, rolsuper, rolbypassrls 
FROM pg_roles 
WHERE rolname = 'app_user';
```

---

### Knex Query Patterns

| # | Check | Status |
|---|-------|--------|
| 1 | All queries run within tenant context transaction | ☐ |
| 2 | `SET LOCAL app.current_tenant_id` called at transaction start | ☐ |
| 3 | No direct `knex()` calls - all through tenant-scoped wrapper | ☐ |
| 4 | JOIN queries filter both tables by tenant_id | ☐ |
| 5 | Subqueries include tenant_id filter | ☐ |
| 6 | INSERT statements include tenant_id (even with RLS) | ☐ |
| 7 | Raw SQL queries include tenant parameter | ☐ |
| 8 | Migrations run with separate admin connection | ☐ |
| 9 | No hardcoded tenant IDs in queries | ☐ |
| 10 | Query builder wrapper prevents dangerous patterns (TRUNCATE, DROP) | ☐ |

**Code Search Patterns:**

```bash
# Find queries that might be missing tenant_id
grep -rn "knex(" --include="*.ts" | grep -v "tenant_id"

# Find direct database access (should go through wrapper)
grep -rn "\.from\(" --include="*.ts" | head -20

# Find raw queries
grep -rn "\.raw\(" --include="*.ts"

# Find joins without tenant filter
grep -rn "\.join\(" --include="*.ts"

# Find subqueries
grep -rn "\.whereIn\(" --include="*.ts"
grep -rn "\.whereExists\(" --include="*.ts"
```

---

### JWT Claims & Middleware

| # | Check | Status |
|---|-------|--------|
| 1 | JWT contains `tenant_id` claim | ☐ |
| 2 | Tenant ID extracted from verified JWT only (not request body/headers) | ☐ |
| 3 | JWT signature verified before extracting claims | ☐ |
| 4 | Middleware sets tenant context before route handlers | ☐ |
| 5 | Missing tenant in JWT returns 401 | ☐ |
| 6 | Tenant ID format validated (UUID format check) | ☐ |
| 7 | URL tenant parameter validated against JWT tenant | ☐ |
| 8 | Request body tenant fields ignored (use JWT only) | ☐ |
| 9 | Multi-tenant users have tenant array in JWT | ☐ |
| 10 | Active tenant header validated against authorized tenants | ☐ |

**Middleware Verification:**

```typescript
// Test: Verify middleware rejects missing tenant
const response = await request(app)
  .get('/api/tickets')
  .set('Authorization', `Bearer ${tokenWithoutTenant}`);
expect(response.status).toBe(401);

// Test: Verify URL tenant mismatch is rejected
const response = await request(app)
  .get('/api/tenants/other-tenant-id/tickets')
  .set('Authorization', `Bearer ${tokenForTenantA}`);
expect(response.status).toBe(403);

// Test: Verify request body tenant is ignored
const response = await request(app)
  .post('/api/tickets')
  .set('Authorization', `Bearer ${tokenForTenantA}`)
  .send({ tenant_id: 'malicious-tenant-id', event_id: '123' });
// Created ticket should have tenant_id from JWT, not body
```

---

### Background Jobs

| # | Check | Status |
|---|-------|--------|
| 1 | All job payloads include `tenant_id` | ☐ |
| 2 | Job processor validates tenant_id presence | ☐ |
| 3 | Database context set before job execution | ☐ |
| 4 | Failed job doesn't leak tenant data in error messages | ☐ |
| 5 | Job retries maintain original tenant context | ☐ |
| 6 | Recurring jobs iterate tenants with proper isolation | ☐ |
| 7 | Job logs include tenant_id for debugging | ☐ |
| 8 | Queue names or routing include tenant for isolation | ☐ |
| 9 | Dead letter queue processing respects tenant context | ☐ |
| 10 | Job scheduling tied to tenant configuration (not global) | ☐ |

**Job Processor Template:**

```typescript
// Template for tenant-aware job processor
async function processJob<T extends { tenantId: string }>(
  job: Job<T>,
  processor: (data: T, tenantId: string) => Promise<void>
) {
  const { tenantId, ...rest } = job.data;
  
  // [CHECK 2] Validate tenant presence
  if (!tenantId) {
    throw new JobError('Job missing tenant context', { jobId: job.id });
  }
  
  // [CHECK 7] Include tenant in logs
  const logger = createLogger({ tenantId, jobId: job.id });
  
  try {
    // [CHECK 3] Set database context
    await withTenantContext(knex, tenantId, async () => {
      await processor(job.data, tenantId);
    });
  } catch (error) {
    // [CHECK 4] Sanitize error - don't leak cross-tenant info
    logger.error('Job failed', { 
      error: error.message,
      // Don't log full error.stack in production
    });
    throw error;
  }
}
```

---

### Shared Resources (Redis, S3, Elasticsearch)

| # | Check | Status |
|---|-------|--------|
| 1 | Redis keys prefixed with `tenant:{tenantId}:` | ☐ |
| 2 | S3 objects stored under `tenants/{tenantId}/` path | ☐ |
| 3 | Elasticsearch queries include `tenant_id` filter | ☐ |
| 4 | Cache invalidation scoped to tenant | ☐ |
| 5 | Presigned URLs include tenant path validation | ☐ |
| 6 | Message queue topics/routing include tenant | ☐ |
| 7 | Rate limiting applied per-tenant | ☐ |
| 8 | Resource quotas tracked per-tenant | ☐ |
| 9 | No global caches that could leak tenant data | ☐ |
| 10 | Elasticsearch indices separated by tenant (or filtered) | ☐ |

**Code Search for Shared Resource Issues:**

```bash
# Redis without tenant prefix
grep -rn "redis\." --include="*.ts" | grep -v "tenant"

# S3 paths without tenant
grep -rn "\.putObject\|\.upload" --include="*.ts" | grep -v "tenantId\|tenant_id"

# Elasticsearch without tenant filter
grep -rn "\.search\(" --include="*.ts"
```

---

### API Endpoints

| # | Check | Status |
|---|-------|--------|
| 1 | All authenticated routes use tenant middleware | ☐ |
| 2 | Error responses don't reveal cross-tenant data | ☐ |
| 3 | Pagination doesn't allow cross-tenant enumeration | ☐ |
| 4 | Search endpoints filter by tenant | ☐ |
| 5 | Bulk operations validate all items belong to tenant | ☐ |
| 6 | File downloads verify tenant ownership | ☐ |
| 7 | Webhooks validate tenant context | ☐ |
| 8 | GraphQL resolvers filter by tenant | ☐ |
| 9 | API rate limits applied per-tenant | ☐ |
| 10 | Admin endpoints have additional authorization | ☐ |

**API Security Test Cases:**

```typescript
describe('Multi-tenant API Security', () => {
  it('should not allow access to other tenant data via ID', async () => {
    // Create ticket in tenant A
    const ticket = await createTicket(tenantAToken);
    
    // Try to access from tenant B
    const response = await request(app)
      .get(`/api/tickets/${ticket.id}`)
      .set('Authorization', `Bearer ${tenantBToken}`);
    
    expect(response.status).toBe(404); // Not 403!
  });
  
  it('should not leak tenant info in error messages', async () => {
    const response = await request(app)
      .get('/api/tickets/nonexistent-id')
      .set('Authorization', `Bearer ${tenantAToken}`);
    
    expect(response.body.error).not.toContain('tenant');
    expect(response.body.error).not.toContain('other');
  });
  
  it('should filter search results by tenant', async () => {
    // Create tickets in both tenants
    await createTicket(tenantAToken, { title: 'Concert A' });
    await createTicket(tenantBToken, { title: 'Concert B' });
    
    // Search from tenant A
    const response = await request(app)
      .get('/api/tickets/search?q=Concert')
      .set('Authorization', `Bearer ${tenantAToken}`);
    
    expect(response.body.results).toHaveLength(1);
    expect(response.body.results[0].title).toBe('Concert A');
  });
});
```

---

### Data Export & Reporting

| # | Check | Status |
|---|-------|--------|
| 1 | Export functions filter by tenant | ☐ |
| 2 | Report generation scoped to tenant | ☐ |
| 3 | Analytics queries include tenant filter | ☐ |
| 4 | Audit logs filtered by tenant for users | ☐ |
| 5 | Backup/restore operations tenant-aware | ☐ |
| 6 | Data deletion (GDPR) scoped to tenant | ☐ |
| 7 | Cross-tenant reports require admin auth | ☐ |
| 8 | Export files include tenant in filename | ☐ |

---

---

## 10 - 10-testing

### 3.1 Jest Configuration Checklist

| Item | Required | Check |
|------|----------|-------|
| `jest.config.js` exists and properly configured | ✓ | ☐ |
| Test files use `.test.js` or `.spec.js` naming | ✓ | ☐ |
| Coverage thresholds configured (min 80%) | ✓ | ☐ |
| Coverage reports output to CI-readable format | ✓ | ☐ |
| `testEnvironment` set to `node` for backend tests | ✓ | ☐ |
| `setupFilesAfterEnv` configured for global setup | ✓ | ☐ |
| `maxWorkers` configured for CI performance | ✓ | ☐ |
| `testTimeout` appropriate (default 5000ms) | ✓ | ☐ |

**Recommended Jest Configuration**:

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js', '**/*.spec.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/migrations/**',
    '!src/seeds/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/services/payment/**': {
      branches: 90,
      functions: 90,
      lines: 90,
    },
  },
  setupFilesAfterEnv: ['./test/setup.js'],
  testTimeout: 10000,
  maxWorkers: process.env.CI ? 2 : '50%',
  // Prevent open handle issues
  forceExit: true,
  detectOpenHandles: true,
};
```

**Source:** [Fastify Documentation - Testing](https://fastify.dev/docs/latest/Guides/Testing/)

---

### 3.2 Fastify Testing Checklist

| Item | Required | Check |
|------|----------|-------|
| Uses `fastify.inject()` for HTTP testing | ✓ | ☐ |
| App is exportable without calling `listen()` | ✓ | ☐ |
| Server closes properly in `afterAll` | ✓ | ☐ |
| All routes have corresponding tests | ✓ | ☐ |
| Error responses tested (400, 401, 403, 404, 500) | ✓ | ☐ |
| Request validation tested | ✓ | ☐ |
| Response schema validated | ✓ | ☐ |
| Authentication/authorization tested | ✓ | ☐ |

**Fastify Test Pattern**:

```javascript
// test/routes/events.test.js
const { build } = require('../helper');

describe('GET /events/:id', () => {
  let app;

  beforeAll(async () => {
    app = await build();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns event for valid ID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/test-event-id',
      headers: {
        Authorization: 'Bearer valid-token',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'test-event-id',
      name: expect.any(String),
    });
  });

  it('returns 401 without auth header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/test-event-id',
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 for non-existent event', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/non-existent',
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(404);
  });
});
```

**Source:** [Fastify GitHub - Testing Guide](https://github.com/fastify/fastify/blob/main/docs/Guides/Testing.md)

---

### 3.3 Knex Database Testing Checklist

| Item | Required | Check |
|------|----------|-------|
| Separate test database configured | ✓ | ☐ |
| Migrations run before tests | ✓ | ☐ |
| Database cleaned between tests | ✓ | ☐ |
| Connection properly destroyed after tests | ✓ | ☐ |
| Transactions used for test isolation | ◐ | ☐ |
| Seeds available for test data | ◐ | ☐ |
| Multi-tenant queries tested | ✓ | ☐ |
| RLS policies verified | ✓ | ☐ |

**Database Test Setup**:

```javascript
// test/setup/database.js
const Knex = require('knex');
const config = require('../../knexfile').test;

let knex;

async function setupTestDatabase() {
  knex = Knex(config);
  await knex.migrate.latest();
  return knex;
}

async function teardownTestDatabase() {
  await knex.migrate.rollback(undefined, true);
  await knex.destroy();
}

async function cleanTables() {
  const tables = [
    'tickets',
    'orders',
    'events',
    'users',
    'tenants',
  ];
  
  for (const table of tables) {
    await knex(table).truncate();
  }
}

module.exports = {
  setupTestDatabase,
  teardownTestDatabase,
  cleanTables,
  getKnex: () => knex,
};
```

**Transaction-based Test Isolation**:

```javascript
// test/repositories/ticket.repository.test.js
describe('TicketRepository', () => {
  let trx;

  beforeEach(async () => {
    trx = await knex.transaction();
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('creates ticket with tenant isolation', async () => {
    // Set tenant context
    await trx.raw('SET app.current_tenant_id = ?', ['tenant-1']);

    await trx('tickets').insert({
      id: 'ticket-1',
      tenant_id: 'tenant-1',
      event_id: 'event-1',
      status: 'valid',
    });

    const tickets = await trx('tickets').select('*');
    expect(tickets).toHaveLength(1);
  });
});
```

**Source:** [Dev.to - End-to-end API Testing with Knex](https://dev.to/dinosa/end-to-end-api-testing-using-knex-migrations-4bje)

---

### 3.4 Stripe Test Mode Checklist

| Item | Required | Check |
|------|----------|-------|
| Using test API keys (`sk_test_`) | ✓ | ☐ |
| Test mode indicator in dashboard | ✓ | ☐ |
| Webhook signing secret for test mode | ✓ | ☐ |
| Stripe CLI installed for local testing | ✓ | ☐ |
| Test card scenarios covered | ✓ | ☐ |
| Webhook event handling tested | ✓ | ☐ |
| 3D Secure flows tested | ✓ | ☐ |
| Connect account flows tested | ✓ | ☐ |
| Subscription lifecycle tested | ◐ | ☐ |
| Refund handling tested | ✓ | ☐ |

**Stripe Test Scenarios**:

```javascript
describe('Stripe Payment Integration', () => {
  describe('Successful Payments', () => {
    it('processes payment with test card', async () => {
      const paymentIntent = await createPayment({
        amount: 5000,
        currency: 'usd',
        payment_method: 'pm_card_visa',
      });

      expect(paymentIntent.status).toBe('succeeded');
    });
  });

  describe('Failed Payments', () => {
    it('handles declined card', async () => {
      await expect(createPayment({
        amount: 5000,
        payment_method: 'pm_card_visa_chargeDeclined',
      })).rejects.toThrow('card_declined');
    });

    it('handles insufficient funds', async () => {
      await expect(createPayment({
        amount: 5000,
        payment_method: 'pm_card_visa_chargeDeclinedInsufficientFunds',
      })).rejects.toThrow('insufficient_funds');
    });
  });

  describe('Webhooks', () => {
    it('verifies webhook signature', async () => {
      const payload = JSON.stringify({ type: 'payment_intent.succeeded' });
      const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: process.env.STRIPE_WEBHOOK_SECRET,
      });

      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      expect(event.type).toBe('payment_intent.succeeded');
    });

    it('rejects invalid signature', () => {
      expect(() => {
        stripe.webhooks.constructEvent(
          '{}',
          'invalid-signature',
          process.env.STRIPE_WEBHOOK_SECRET
        );
      }).toThrow('Webhook signature verification failed');
    });
  });
});
```

**Source:** [Stripe Documentation - Testing](https://docs.stripe.com/testing/overview)

---

### 3.5 Solana Devnet Checklist

| Item | Required | Check |
|------|----------|-------|
| Devnet RPC endpoint configured | ✓ | ☐ |
| Test wallet with devnet SOL | ✓ | ☐ |
| Separate keypairs for tests | ✓ | ☐ |
| NFT minting tested | ✓ | ☐ |
| Token transfers tested | ✓ | ☐ |
| Program deployment tested | ◐ | ☐ |
| Transaction confirmation tested | ✓ | ☐ |
| Error handling tested | ✓ | ☐ |
| Local validator for unit tests | ◐ | ☐ |

**Solana Test Configuration**:

```javascript
// test/setup/solana.js
const { Connection, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const DEVNET_URL = 'https://api.devnet.solana.com';

async function setupSolanaTest() {
  const connection = new Connection(DEVNET_URL, 'confirmed');
  const payer = Keypair.generate();

  // Airdrop SOL for test transactions
  const airdropSig = await connection.requestAirdrop(
    payer.publicKey,
    2 * LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(airdropSig);

  return { connection, payer };
}

module.exports = { setupSolanaTest };
```

**NFT Minting Test**:

```javascript
describe('NFT Ticket Minting', () => {
  let connection;
  let payer;

  beforeAll(async () => {
    ({ connection, payer } = await setupSolanaTest());
  }, 30000);

  it('mints NFT ticket on devnet', async () => {
    const ticketData = {
      eventId: 'test-event-123',
      ticketId: 'ticket-456',
      seat: 'A1',
    };

    const { mint, metadata } = await mintTicketNFT({
      connection,
      payer,
      ticketData,
    });

    expect(mint).toBeDefined();
    
    // Verify on-chain
    const mintInfo = await getMint(connection, mint);
    expect(mintInfo.supply).toBe(1n);
    expect(mintInfo.decimals).toBe(0);
  }, 60000);

  it('prevents double-minting same ticket', async () => {
    const ticketData = { ticketId: 'unique-ticket' };
    
    await mintTicketNFT({ connection, payer, ticketData });
    
    await expect(
      mintTicketNFT({ connection, payer, ticketData })
    ).rejects.toThrow('Ticket already minted');
  });
});
```

**Source:** [Solana Cookbook - Getting Test SOL](https://solana.com/developers/cookbook/development/test-sol)

---

### 3.6 Coverage Requirements

#### Minimum Coverage by Service Type

| Service Category | Line | Branch | Function |
|-----------------|------|--------|----------|
| Payment Services | 90% | 85% | 90% |
| Authentication | 90% | 85% | 90% |
| Ticket Operations | 85% | 80% | 85% |
| NFT/Blockchain | 80% | 75% | 80% |
| Event Management | 80% | 75% | 80% |
| User Management | 80% | 75% | 80% |
| Notifications | 75% | 70% | 75% |
| Reporting | 70% | 65% | 70% |

#### Coverage Verification Commands

```bash
# Generate coverage report
npm run test -- --coverage

# Check coverage thresholds
npm run test -- --coverage --coverageThreshold='{"global":{"lines":80}}'

# Generate detailed HTML report
npm run test -- --coverage --coverageReporters=html

# Get uncovered lines
npm run test -- --coverage --coverageReporters=text-summary
```

---

### 3.7 Critical Integration Tests

These integration tests MUST exist and pass for each service:

#### Authentication Service

| Test | Priority |
|------|----------|
| Login with valid credentials | P0 |
| Login with invalid credentials | P0 |
| JWT token generation and validation | P0 |
| Token refresh flow | P0 |
| Multi-tenant authentication | P0 |
| Rate limiting on login attempts | P1 |
| Session invalidation on logout | P1 |

#### Ticket Service

| Test | Priority |
|------|----------|
| Purchase ticket (happy path) | P0 |
| Purchase ticket (sold out) | P0 |
| Purchase ticket (concurrent last ticket) | P0 |
| QR code generation | P0 |
| QR code validation | P0 |
| Ticket transfer between users | P1 |
| Ticket resale flow | P1 |
| Cross-tenant ticket access blocked | P0 |

#### Payment Service

| Test | Priority |
|------|----------|
| Successful payment | P0 |
| Payment failure handling | P0 |
| Webhook processing | P0 |
| Refund processing | P0 |
| Connect account payout | P1 |
| Payment reconciliation | P1 |

#### NFT Service

| Test | Priority |
|------|----------|
| NFT minting on purchase | P0 |
| NFT metadata correctness | P0 |
| NFT transfer on ticket transfer | P1 |
| Devnet/Mainnet environment isolation | P0 |

---

### 3.8 Security Tests Checklist

Based on OWASP API Security Top 10 2023:

| Vulnerability | Test Required | Check |
|---------------|---------------|-------|
| **API1:2023 - BOLA** | Verify user can't access other users' resources | ☐ |
| **API2:2023 - Broken Auth** | Test auth bypass attempts | ☐ |
| **API3:2023 - BOPLA** | Test property-level access control | ☐ |
| **API4:2023 - Unrestricted Resource** | Test rate limiting, file upload limits | ☐ |
| **API5:2023 - Broken Function Auth** | Test admin function access by regular users | ☐ |
| **API6:2023 - Mass Assignment** | Test unexpected property modification | ☐ |
| **API7:2023 - SSRF** | Test URL parameter validation | ☐ |
| **API8:2023 - Security Misconfig** | Test error messages, headers, CORS | ☐ |
| **API9:2023 - Improper Inventory** | Test deprecated endpoint access | ☐ |
| **API10:2023 - Unsafe API Consumption** | Test third-party data validation | ☐ |

**Source:** [OWASP API Security Top 10](https://owasp.org/API-Security/)

**Security Test Examples**:

```javascript
describe('API Security', () => {
  describe('BOLA (Broken Object Level Authorization)', () => {
    it('prevents access to other tenant events', async () => {
      const tenant1Token = await getTokenForTenant('tenant-1');
      const tenant2Event = await createEventForTenant('tenant-2');

      const response = await app.inject({
        method: 'GET',
        url: `/events/${tenant2Event.id}`,
        headers: { Authorization: `Bearer ${tenant1Token}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('prevents access to other user tickets', async () => {
      const user1Token = await getTokenForUser('user-1');
      const user2Ticket = await createTicketForUser('user-2');

      const response = await app.inject({
        method: 'GET',
        url: `/tickets/${user2Ticket.id}`,
        headers: { Authorization: `Bearer ${user1Token}` },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('Broken Authentication', () => {
    it('rejects expired JWT tokens', async () => {
      const expiredToken = generateToken({ exp: Date.now() / 1000 - 3600 });

      const response = await app.inject({
        method: 'GET',
        url: '/events',
        headers: { Authorization: `Bearer ${expiredToken}` },
      });

      expect(response.statusCode).toBe(401);
    });

    it('rate limits login attempts', async () => {
      const attempts = Array(10).fill().map(() =>
        app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email: 'test@test.com', password: 'wrong' },
        })
      );

      const responses = await Promise.all(attempts);
      const rateLimited = responses.filter(r => r.statusCode === 429);
      
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('SQL Injection', () => {
    it('sanitizes user input in queries', async () => {
      const response = await app.inject({
        method: 'GET',
        url: "/events?search='; DROP TABLE events; --",
        headers: { Authorization: `Bearer ${validToken}` },
      });

      // Should not error or expose SQL
      expect(response.statusCode).not.toBe(500);
      
      // Verify table still exists
      const events = await knex('events').select('*');
      expect(events).toBeDefined();
    });
  });
});
```

**Source:** [OWASP API Security Testing Framework](https://owasp.org/www-project-api-security-testing-framework/)

---

### 3.9 Per-Service Audit Template

Use this template for each of the 23 microservices:

```markdown
## Service: [SERVICE_NAME]

### Overview
- **Purpose**: 
- **Dependencies**: 
- **Criticality**: [P0/P1/P2]

### Test Inventory

| Test Type | Count | Passing | Coverage |
|-----------|-------|---------|----------|
| Unit | | | |
| Integration | | | |
| E2E | | | |

### Coverage Analysis

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Line | | 80% | |
| Branch | | 75% | |
| Function | | 80% | |

### Critical Tests Present

| Test | Status |
|------|--------|
| Happy path flow | ☐ |
| Error handling | ☐ |
| Auth/authz | ☐ |
| Input validation | ☐ |
| Multi-tenant isolation | ☐ |
| Rate limiting | ☐ |

### Integration Tests

| Dependency | Test Exists | Uses Real/Mock |
|------------|-------------|----------------|
| Database | ☐ | |
| Redis | ☐ | |
| Stripe | ☐ | |
| Solana | ☐ | |
| Other services | ☐ | |

### Security Tests

| OWASP Risk | Tested | Result |
|------------|--------|--------|
| BOLA | ☐ | |
| Broken Auth | ☐ | |
| Injection | ☐ | |

### Gaps Identified

1. 
2. 
3. 

### Remediation Plan

| Gap | Priority | Assignee | Due Date |
|-----|----------|----------|----------|
| | | | |
```

---

---

## 11 - 11-documentation

### 3.1 Documentation Existence Checklist

#### Project-Level Documentation

- [ ] **README.md** exists and is up-to-date
- [ ] **CONTRIBUTING.md** for contributor guidelines
- [ ] **CHANGELOG.md** tracking version history
- [ ] **LICENSE** file present
- [ ] **SECURITY.md** with vulnerability reporting process
- [ ] **.env.example** with all environment variables documented

#### Architecture Documentation

- [ ] **Architecture Decision Records (ADRs)** in `docs/decisions/`
  - [ ] Database selection documented
  - [ ] Framework choices documented
  - [ ] Infrastructure decisions documented
  - [ ] Security architecture documented
- [ ] **C4 Context Diagram** (Level 1) showing system boundaries
- [ ] **C4 Container Diagram** (Level 2) showing major components
- [ ] **Data flow diagrams** for sensitive data
- [ ] **Network architecture diagram** (for infrastructure)

#### API Documentation

- [ ] **OpenAPI/Swagger specification** exists
- [ ] **API documentation** accessible (Swagger UI, Redoc, or similar)
- [ ] **Authentication documentation** is complete
- [ ] **Versioning strategy** documented
- [ ] **Rate limiting** documented
- [ ] **Error codes** documented with descriptions

#### Operational Documentation

- [ ] **Runbooks** exist for critical operations
- [ ] **Incident response playbooks** defined
- [ ] **On-call rotation** documented
- [ ] **Escalation procedures** documented
- [ ] **Post-mortem templates** available

#### Onboarding Documentation

- [ ] **Onboarding guide** for new developers
- [ ] **Local development setup** instructions
- [ ] **Access request procedures** documented
- [ ] **Team glossary** of terms and acronyms
- [ ] **Architecture overview** (2-page summary)

---

### 3.2 API Documentation Audit Checklist

#### Specification Quality

- [ ] OpenAPI version 3.0+ used
- [ ] `info` section complete (title, version, description, contact)
- [ ] `servers` array populated with real URLs (not localhost)
- [ ] All paths have `operationId`
- [ ] All paths have `summary` and `description`
- [ ] All paths have `tags` for logical grouping

#### Request Documentation

- [ ] All parameters documented (query, path, header, cookie)
- [ ] Required vs optional parameters marked
- [ ] Parameter descriptions provided
- [ ] Parameter examples provided
- [ ] Request body schemas defined
- [ ] Request body examples provided
- [ ] Content types specified

#### Response Documentation

- [ ] All response codes documented (2xx, 4xx, 5xx)
- [ ] Response schemas defined for each status code
- [ ] Response examples provided
- [ ] Error response format consistent
- [ ] Error codes and messages documented

#### Security Documentation

- [ ] Security schemes defined (API key, OAuth2, JWT)
- [ ] Security requirements specified per endpoint
- [ ] Authentication examples provided
- [ ] Authorization (scopes/roles) documented

#### Usability

- [ ] Getting started guide available
- [ ] Code examples in multiple languages
- [ ] Interactive documentation (try it out) available
- [ ] Changelog/versioning visible
- [ ] Rate limits documented
- [ ] Pagination explained

---

### 3.3 Runbook Audit Checklist

#### Required Runbooks by Service

**For each critical service, verify runbooks exist for:**

- [ ] Service restart procedure
- [ ] Health check failure response
- [ ] Scaling procedure (up/down)
- [ ] Log access and analysis
- [ ] Configuration changes
- [ ] Deployment procedure
- [ ] Rollback procedure

#### Required Runbooks by System

**Database:**
- [ ] Connection pool exhaustion
- [ ] High CPU/memory usage
- [ ] Replication lag
- [ ] Backup verification
- [ ] Failover procedure
- [ ] Recovery from backup

**Cache (Redis/Memcached):**
- [ ] Cache invalidation
- [ ] Memory pressure
- [ ] Connection issues
- [ ] Cluster failover

**Message Queue (Kafka/RabbitMQ/SQS):**
- [ ] Queue backup/overflow
- [ ] Consumer lag
- [ ] Dead letter queue processing
- [ ] Partition rebalancing

**API Gateway/Load Balancer:**
- [ ] Traffic spike response
- [ ] Backend unhealthy
- [ ] SSL certificate renewal
- [ ] Rate limit adjustment

#### Runbook Quality Checklist

For each runbook, verify:
- [ ] Clear trigger condition defined
- [ ] Step-by-step procedures provided
- [ ] Expected outcomes for each step
- [ ] Verification steps included
- [ ] Rollback procedure documented
- [ ] Escalation path defined
- [ ] Owner and last update date visible
- [ ] Links to dashboards/logs included
- [ ] Access requirements listed

---

### 3.4 Incident Response Audit Checklist

#### Policy and Plan

- [ ] Incident Response Policy exists and is approved
- [ ] Incident Response Plan documented
- [ ] Roles and responsibilities defined
- [ ] Contact information current
- [ ] Communication templates prepared
- [ ] External notification requirements documented (legal, regulatory)

#### Playbooks

**Minimum required playbooks:**
- [ ] General security incident
- [ ] Data breach
- [ ] Ransomware attack
- [ ] DDoS attack
- [ ] Phishing attack
- [ ] Insider threat
- [ ] Service outage
- [ ] Third-party service failure

**For each playbook, verify:**
- [ ] Detection criteria defined
- [ ] Severity classification guidelines
- [ ] Immediate containment steps
- [ ] Investigation procedures
- [ ] Evidence preservation steps
- [ ] Recovery procedures
- [ ] Communication templates
- [ ] Post-incident review process

#### Testing and Training

- [ ] Tabletop exercises conducted (minimum 2x/year)
- [ ] Last exercise date recorded
- [ ] Lessons learned documented
- [ ] Playbooks updated after exercises
- [ ] Team training current

---

### 3.5 Environment Variables Audit Checklist

#### Documentation Requirements

- [ ] `.env.example` exists in repository
- [ ] All production variables present in `.env.example`
- [ ] Each variable has a description comment
- [ ] Required vs optional clearly marked
- [ ] Default values documented where applicable
- [ ] Example values provided (non-secret)
- [ ] Format/pattern documented for complex values

#### Security Requirements

- [ ] `.env` in `.gitignore`
- [ ] No secrets in `.env.example`
- [ ] Secrets stored in proper secrets manager (not files)
- [ ] Production secrets not accessible in development
- [ ] Secret rotation procedures documented
- [ ] Access to secrets audited

#### Validation Requirements

- [ ] Application validates required variables at startup
- [ ] Application fails fast on missing required variables
- [ ] Variables typed appropriately (not just strings)
- [ ] Sensitive variables masked in logs

#### Inventory Checklist

For each environment variable in production:
- [ ] Purpose documented
- [ ] Owner identified
- [ ] Still in use (not orphaned)
- [ ] Rotation schedule defined (if secret)
- [ ] Access appropriately restricted

---

### 3.6 README Audit Checklist

- [ ] **Project name** clear and descriptive
- [ ] **Description** explains what it does in 1-2 sentences
- [ ] **Status badges** (build, coverage, version) current
- [ ] **Prerequisites** listed completely
- [ ] **Installation steps** accurate and tested
- [ ] **Usage examples** that actually work
- [ ] **Configuration** documented (all options)
- [ ] **Environment variables** explained or linked
- [ ] **API reference** linked (if applicable)
- [ ] **Contributing guidelines** linked
- [ ] **License** specified
- [ ] **No broken links**
- [ ] **Last update** within 6 months
- [ ] **Screenshots/diagrams** current (if present)

---

### 3.7 Code Documentation Audit Checklist

#### Public API Documentation

- [ ] All public functions have docstrings
- [ ] All public classes have docstrings
- [ ] All public modules have docstrings
- [ ] Parameters documented with types
- [ ] Return values documented with types
- [ ] Exceptions/errors documented
- [ ] Usage examples for complex APIs

#### Comment Quality

- [ ] Comments explain "why" not "what"
- [ ] No commented-out code
- [ ] No TODO/FIXME without issue links
- [ ] Complex algorithms explained
- [ ] Workarounds documented with issue references
- [ ] Assumptions documented
- [ ] No outdated comments

#### Generated Documentation

- [ ] Documentation generation configured (JSDoc, Sphinx, etc.)
- [ ] Generated docs build successfully
- [ ] Generated docs published and accessible
- [ ] Generation runs in CI pipeline

---

---

## 12 - 12-health-checks

### 3.1 Fastify Application Health Check

#### Required Endpoints

| Endpoint | Purpose | What to Check | Timeout |
|----------|---------|---------------|---------|
| `GET /health/live` | Liveness probe | Event loop not blocked | < 100ms |
| `GET /health/ready` | Readiness probe | DB connected, Redis connected | < 500ms |
| `GET /health/startup` | Startup probe | All dependencies initialized | < 1s |

#### Fastify Implementation

```javascript
// Using fastify-healthcheck plugin
import Fastify from 'fastify';
import healthcheck from 'fastify-healthcheck';
import underPressure from '@fastify/under-pressure';

const fastify = Fastify({ logger: true });

// Register under-pressure for system health
await fastify.register(underPressure, {
  maxEventLoopDelay: 1000,           // 1 second max
  maxHeapUsedBytes: 1000000000,      // ~1GB
  maxRssBytes: 1500000000,           // ~1.5GB
  maxEventLoopUtilization: 0.98,     // 98%
  pressureHandler: (req, rep, type, value) => {
    rep.status(503).send({ 
      status: 'error', 
      reason: `${type} pressure: ${value}` 
    });
  }
});

// Register healthcheck
await fastify.register(healthcheck, {
  healthcheckUrl: '/health/live',
  exposeUptime: false,  // Don't expose uptime
  underPressureOptions: {}
});

// Custom readiness endpoint
fastify.get('/health/ready', async (request, reply) => {
  const checks = {};
  
  try {
    // Check PostgreSQL
    const dbStart = Date.now();
    await fastify.pg.query('SELECT 1');
    checks.postgresql = {
      status: 'pass',
      responseTime: Date.now() - dbStart
    };
  } catch (error) {
    checks.postgresql = { status: 'fail' };
    return reply.status(503).send({ status: 'error', checks });
  }
  
  try {
    // Check Redis
    const redisStart = Date.now();
    await fastify.redis.ping();
    checks.redis = {
      status: 'pass',
      responseTime: Date.now() - redisStart
    };
  } catch (error) {
    checks.redis = { status: 'fail' };
    return reply.status(503).send({ status: 'error', checks });
  }
  
  return { status: 'ok', checks };
});

// Startup endpoint
fastify.get('/health/startup', async (request, reply) => {
  // Verify all required configurations
  const required = ['DATABASE_URL', 'REDIS_URL'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    return reply.status(503).send({
      status: 'error',
      message: 'Missing configuration'
    });
  }
  
  return { status: 'ok' };
});
```

**Sources:**
- [npm - fastify-healthcheck](https://www.npmjs.com/package/fastify-healthcheck)
- [GitHub - fastify-custom-healthcheck](https://github.com/gkampitakis/fastify-custom-healthcheck)

#### Fastify Health Check Audit Checklist

```
□ Event loop monitoring configured (@fastify/under-pressure)
□ Liveness endpoint returns < 100ms
□ Readiness endpoint checks database and cache
□ No sensitive information in responses
□ Health endpoints don't require authentication
□ Proper HTTP status codes (200 healthy, 503 unhealthy)
□ Timeouts configured for all dependency checks
□ Graceful degradation when dependencies fail
```

### 3.2 PostgreSQL Health Check

#### What to Check

| Check | Query/Method | Timeout | Probe Type |
|-------|--------------|---------|------------|
| Connection alive | `SELECT 1` | 2s | Readiness |
| Can execute queries | Simple query | 3s | Readiness |
| Connection pool healthy | Pool stats | 1s | Readiness |
| Replication lag (if replica) | `pg_last_wal_receive_lsn()` | 2s | Readiness |

#### Implementation

```javascript
// PostgreSQL health check function
async function checkPostgres(pool) {
  const timeout = 2000; // 2 seconds
  
  try {
    const client = await Promise.race([
      pool.connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), timeout)
      )
    ]);
    
    try {
      // Execute simple query
      const result = await client.query('SELECT 1 as health');
      
      // Check pool stats
      const poolStats = {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      };
      
      return {
        status: 'pass',
        pool: poolStats,
        responseTime: result.duration || 0
      };
    } finally {
      client.release();
    }
  } catch (error) {
    return {
      status: 'fail',
      error: error.message  // Safe to expose error type, not details
    };
  }
}
```

#### PostgreSQL Health Check Audit Checklist

```
□ Connection pooling configured (pg-pool, knex)
□ Health check uses connection from pool (not new connection)
□ Query timeout configured (statement_timeout)
□ Connection timeout configured (connect_timeout)
□ Health check query is lightweight (SELECT 1)
□ Pool exhaustion detected (waitingCount monitoring)
□ No credentials in error messages
□ Replica lag monitoring (if using read replicas)
```

#### Recommended Timeouts

| Setting | Value | Purpose |
|---------|-------|---------|
| `connect_timeout` | 5s | Time to establish connection |
| `statement_timeout` | 3s | Maximum query execution time |
| `idle_timeout` | 10min | Release idle connections |
| `health_check_interval` | 30s | Pgpool health check frequency |

**Source:** [Pgpool Documentation - Health Check](https://www.pgpool.net/docs/latest/en/html/runtime-config-health-check.html)

### 3.3 Redis Health Check

#### What to Check

| Check | Command | Timeout | Probe Type |
|-------|---------|---------|------------|
| Connection alive | `PING` | 1s | Readiness |
| Memory usage | `INFO memory` | 2s | Monitoring |
| Replication status | `INFO replication` | 2s | Readiness (if replica) |

#### Implementation

```javascript
// Redis health check function
async function checkRedis(redis) {
  const timeout = 1000; // 1 second
  
  try {
    const start = Date.now();
    
    // PING is O(1) and fast
    const pong = await Promise.race([
      redis.ping(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis timeout')), timeout)
      )
    ]);
    
    if (pong !== 'PONG') {
      return { status: 'fail', reason: 'Unexpected response' };
    }
    
    return {
      status: 'pass',
      responseTime: Date.now() - start
    };
  } catch (error) {
    return {
      status: 'fail',
      error: error.message
    };
  }
}
```

#### Docker Compose Health Check

```yaml
redis:
  image: redis:7-alpine
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 3
    start_period: 5s
```

#### Redis Health Check Audit Checklist

```
□ PING command used for health check
□ Timeout configured (< 1s recommended)
□ Connection pooling in use
□ Health check interval configured (every 3-10s)
□ Keepalive configured for idle connections (< 10 minutes)
□ Error handling for connection failures
□ No sensitive data in health responses
□ Memory monitoring for eviction warnings
```

#### Recommended Settings

| Setting | Value | Purpose |
|---------|-------|---------|
| `health_check_interval` | 3s | Redis client health check |
| `socket_connect_timeout` | 5s | Connection establishment |
| `socket_timeout` | 5s | Command timeout |
| `keepalive` | 300s | Keepalive for idle connections |

**Source:** [Redis Documentation - Production usage](https://redis.io/docs/latest/develop/clients/redis-py/produsage/)

### 3.4 External Services: Stripe

#### What NOT to Check

**⚠️ Do NOT include Stripe API health in your liveness or readiness probes.**

**Reasons:**
1. Stripe API issues shouldn't restart your pods
2. Network latency to Stripe varies
3. Stripe rate limits could fail your health checks
4. You cannot fix Stripe outages by restarting

#### Recommended Approach

```javascript
// ❌ BAD - Don't do this in health checks
app.get('/health/ready', async (req, res) => {
  await stripe.balance.retrieve(); // Don't check Stripe!
});

// ✅ GOOD - Check Stripe status separately for monitoring
async function checkStripeStatus() {
  // Use Stripe's official status page for monitoring
  // https://status.stripe.com/
  
  // Or check if YOUR Stripe integration is configured
  try {
    // Just verify API key is set, don't call Stripe
    if (!process.env.STRIPE_SECRET_KEY) {
      return { status: 'warn', reason: 'API key not configured' };
    }
    return { status: 'pass', note: 'API key configured' };
  } catch (error) {
    return { status: 'warn', error: error.message };
  }
}
```

#### Stripe Integration Monitoring Checklist

```
□ API key configured in environment
□ Webhook endpoint accessible
□ Webhook signature verification working
□ Error handling for Stripe API failures
□ Circuit breaker pattern for Stripe calls
□ Monitoring for Stripe error rates (400, 429, 500)
□ Alerts configured for Stripe status page
□ Stripe NOT included in liveness/readiness probes
```

#### External Status Monitoring

Monitor Stripe status externally:
- **Status Page:** https://status.stripe.com/
- **Health Alerts:** Available with Premium/Enterprise support plans
- **Workbench Health Tab:** Real-time monitoring in Stripe Dashboard

**Source:** [Stripe Documentation - Health alerts](https://docs.stripe.com/health-alerts)

### 3.5 External Services: Solana RPC

#### Solana RPC Health Endpoints

| Endpoint | Method | Response | Use Case |
|----------|--------|----------|----------|
| `GET /health` | HTTP GET | `ok`, `behind`, `unknown` | Load balancer checks |
| `getHealth` | JSON-RPC | `ok` or error | Application health |

#### What to Check

```javascript
// Solana RPC health check
async function checkSolanaRPC(rpcUrl) {
  const timeout = 5000; // 5 seconds
  
  try {
    // Option 1: HTTP health endpoint (preferred for basic checks)
    const healthResponse = await fetch(`${rpcUrl}/health`, {
      signal: AbortSignal.timeout(timeout)
    });
    const healthStatus = await healthResponse.text();
    
    if (healthStatus === 'ok') {
      return { status: 'pass' };
    } else if (healthStatus.startsWith('behind')) {
      // Node is behind but operational
      return { status: 'warn', reason: healthStatus };
    } else {
      return { status: 'fail', reason: healthStatus };
    }
  } catch (error) {
    return { status: 'fail', error: error.message };
  }
}

// Option 2: JSON-RPC getHealth
async function checkSolanaRPCJsonRpc(rpcUrl) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getHealth'
    }),
    signal: AbortSignal.timeout(5000)
  });
  
  const data = await response.json();
  return data.result === 'ok' 
    ? { status: 'pass' } 
    : { status: 'fail', reason: data.error };
}
```

#### Solana RPC Health Check Audit Checklist

```
□ RPC endpoint URL configured
□ Timeout configured (5-10s for RPC calls)
□ Health check uses GET /health or getHealth
□ "behind" status handled appropriately
□ Multiple RPC endpoints configured (failover)
□ Circuit breaker for RPC failures
□ Rate limiting awareness
□ NOT included in liveness probe
□ Included in readiness only if Solana is critical path
```

#### Recommended Solana RPC Timeouts

| Operation | Timeout | Notes |
|-----------|---------|-------|
| Health check | 5s | Simple status check |
| getBalance | 10s | Account lookup |
| sendTransaction | 30s | Transaction submission |
| confirmTransaction | 60s | Block confirmation |

**Sources:**
- [Solana Docs - RPC HTTP Methods](https://solana.com/docs/rpc/http)
- [Helius Docs - getHealth](https://www.helius.dev/docs/rpc/guides/gethealth)

---

---

## 13 - 13-graceful-degradation

### 3.1 Fastify Server

#### Graceful Shutdown
- [ ] SIGTERM handler registered
- [ ] SIGINT handler registered (for local dev)
- [ ] `fastify.close()` called on shutdown signal
- [ ] Delay before close (allow LB drain): 5-10 seconds recommended
- [ ] In-flight requests complete before exit
- [ ] Database connections closed in `onClose` hook
- [ ] Redis connections closed in `onClose` hook
- [ ] Maximum shutdown time configured (terminationGracePeriodSeconds)

```typescript
// Verify these are configured:
import closeWithGrace from 'close-with-grace';

closeWithGrace({ delay: 10000 }, async ({ signal }) => {
  await fastify.close();
});
```

#### Health Checks
- [ ] Liveness endpoint exists (`/health/live`)
- [ ] Readiness endpoint exists (`/health/ready`)
- [ ] Readiness returns 503 during shutdown
- [ ] Health check timeouts configured in Kubernetes

#### Request Handling
- [ ] Request timeout configured: `connectionTimeout`, `keepAliveTimeout`
- [ ] Body size limits: `bodyLimit`
- [ ] Rate limiting plugin installed

**Recommended Fastify Configuration:**
```typescript
const fastify = Fastify({
  logger: true,
  connectionTimeout: 10000,       // 10 seconds
  keepAliveTimeout: 72000,        // 72 seconds (> ALB 60s)
  bodyLimit: 1048576,             // 1MB
  requestTimeout: 30000,          // 30 seconds
});
```

---

### 3.2 HTTP Clients

#### Timeout Configuration
- [ ] Connection timeout configured: 3-10 seconds
- [ ] Request/read timeout configured: 5-30 seconds
- [ ] Timeout values documented per service

```typescript
// Using undici (Node.js built-in)
import { request } from 'undici';

const response = await request(url, {
  headersTimeout: 5000,      // Time to receive headers
  bodyTimeout: 30000,        // Time to receive body
  connect: {
    timeout: 5000            // Connection timeout
  }
});

// Using axios
const client = axios.create({
  timeout: 10000,            // Total request timeout
  timeoutErrorMessage: 'Request timed out'
});
```

#### Retry Logic
- [ ] Retries implemented for transient errors
- [ ] Exponential backoff configured
- [ ] Jitter added to backoff
- [ ] Max retries limited (3-5)
- [ ] Idempotency keys for POST requests

```typescript
// Verify retry configuration
const retryConfig = {
  retries: 3,
  retryDelay: (retryCount) => {
    const baseDelay = 1000;
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);
    const jitter = Math.random() * 1000;
    return exponentialDelay + jitter;
  },
  retryCondition: (error) => {
    return error.code === 'ECONNRESET' || 
           error.response?.status >= 500 ||
           error.response?.status === 429;
  }
};
```

#### Circuit Breaker
- [ ] Circuit breaker wraps external calls
- [ ] Failure threshold configured (40-60%)
- [ ] Recovery timeout configured (15-60s)
- [ ] Fallback method defined
- [ ] Circuit breaker metrics exposed

---

### 3.3 Stripe Integration

#### SDK Configuration
- [ ] API timeout configured

```typescript
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  timeout: 30000,              // 30 seconds
  maxNetworkRetries: 2,        // SDK handles retries
});
```

#### Idempotency
- [ ] Idempotency keys used for all POST requests
- [ ] Keys generated uniquely per logical operation
- [ ] Keys stored for retry scenarios

```typescript
// Correct idempotency key usage
const paymentIntent = await stripe.paymentIntents.create(
  {
    amount: 1000,
    currency: 'usd',
  },
  {
    idempotencyKey: `order-${orderId}-payment`,  // Tied to business operation
  }
);
```

#### Error Handling
- [ ] Network errors trigger retry with same idempotency key
- [ ] Card declines handled (do NOT retry)
- [ ] Rate limit errors handled (honor Retry-After)
- [ ] API errors logged with request ID

**Stripe Error Categories:**
| Error Type | Retry? | New Idempotency Key? |
|------------|--------|----------------------|
| Network/timeout | Yes | No (same key) |
| 500 server error | Yes | No (same key) |
| 429 rate limit | Yes (with delay) | No (same key) |
| Card declined | No | Yes (if retrying) |
| Invalid request | No | Yes (if fixing params) |

#### Circuit Breaker
- [ ] **DO NOT** include Stripe in health checks
- [ ] Circuit breaker configured for Stripe calls
- [ ] Fallback: queue for later processing or graceful error

> **Sources:**  
> - https://docs.stripe.com/error-low-level  
> - https://docs.stripe.com/api/idempotent_requests  
> - https://stripe.com/blog/idempotency

---

### 3.4 Solana RPC

#### Connection Configuration
- [ ] Multiple RPC endpoints configured (failover)
- [ ] Connection timeout: 5-10 seconds
- [ ] Request timeout varies by operation type

**Recommended Timeouts:**
| Operation | Timeout |
|-----------|---------|
| `getHealth` | 5s |
| `getBalance` | 10s |
| `getTransaction` | 15s |
| `sendTransaction` | 30s |
| `confirmTransaction` | 60s |

#### Retry Logic
- [ ] Custom retry logic implemented (don't rely on RPC defaults)
- [ ] `maxRetries: 0` for transactions (handle manually)
- [ ] Blockhash expiry checked before retry
- [ ] Never re-sign until blockhash confirmed expired

```typescript
const { blockhash, lastValidBlockHeight } = 
  await connection.getLatestBlockhash();

// Monitor blockhash validity
while (await connection.getBlockHeight() <= lastValidBlockHeight) {
  // Safe to retry with same signature
  await connection.sendRawTransaction(serializedTx, {
    skipPreflight: true,
    maxRetries: 0
  });
  await sleep(2000);
}
// Blockhash expired - must re-sign transaction
```

#### Rate Limiting
- [ ] Rate limits understood per endpoint
- [ ] 429 errors handled with exponential backoff
- [ ] Consider premium RPC provider for production

**Solana Public RPC Limits:**
| Network | Limit |
|---------|-------|
| Mainnet | 100 req/10s per IP |
| Devnet | 100 req/10s per IP |
| Testnet | 100 req/10s per IP |

#### Health Checks
- [ ] **DO NOT** include RPC health in liveness probe
- [ ] Readiness can check RPC if critical path
- [ ] Handle "behind" status gracefully

> **Sources:**  
> - https://solana.com/developers/guides/advanced/retry  
> - https://docs.solana.com/cluster/rpc-endpoints  
> - https://helius.dev/docs/sending-transactions/optimizing-transactions

---

### 3.5 Redis

#### Client Configuration (ioredis)
- [ ] Command timeout configured
- [ ] Connection timeout configured
- [ ] Retry strategy defined
- [ ] `maxRetriesPerRequest` set (not null in production)

```typescript
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  
  // Timeouts
  connectTimeout: 10000,           // Initial connection: 10s
  commandTimeout: 5000,            // Per-command timeout: 5s
  
  // Retry configuration
  maxRetriesPerRequest: 3,         // Fail after 3 retries (default: 20)
  retryStrategy: (times) => {
    if (times > 10) return null;   // Stop retrying
    return Math.min(times * 100, 3000);  // Exponential backoff, max 3s
  },
  
  // Reconnection
  reconnectOnError: (err) => {
    return err.message.includes('READONLY');
  },
});
```

#### Error Handling
- [ ] Error event listener registered
- [ ] Connection failures don't crash app
- [ ] Fallback for cache misses during outage

```typescript
redis.on('error', (err) => {
  logger.error('Redis error', err);
  // Don't crash - degrade gracefully
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('reconnecting', () => logger.warn('Redis reconnecting'));
```

#### Graceful Shutdown
- [ ] `redis.quit()` called on shutdown (waits for pending commands)
- [ ] NOT `redis.disconnect()` (immediate, loses pending)

#### Health Checks
- [ ] PING used for health check
- [ ] Timeout on health check: 1-2 seconds
- [ ] Fallback behavior when Redis unavailable

> **Sources:**  
> - https://redis.github.io/ioredis/interfaces/CommonRedisOptions.html  
> - https://github.com/redis/ioredis  
> - https://redis.io/docs/latest/develop/clients/nodejs/produsage/

---

### 3.6 PostgreSQL (via Knex.js)

#### Pool Configuration
- [ ] `pool.min` set to 0 (allows idle connection cleanup)
- [ ] `pool.max` appropriate for workload
- [ ] Pool size formula: `pool.max × instances ≤ max_connections`

```typescript
const knex = require('knex')({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  pool: {
    min: 0,                        // Allow full cleanup
    max: 10,                       // Based on workload
    
    // Timeouts
    acquireTimeoutMillis: 30000,   // Wait for connection: 30s
    createTimeoutMillis: 10000,    // Create connection: 10s
    idleTimeoutMillis: 30000,      // Idle before release: 30s
    
    // Validation
    propagateCreateError: false,   // Don't crash on create failure
  },
  acquireConnectionTimeout: 30000,  // Knex-level timeout
});
```

#### Query Timeouts
- [ ] Statement timeout configured per-query or globally
- [ ] Long-running queries have appropriate limits

```typescript
// Per-query timeout
await knex.raw('SET statement_timeout = 5000');  // 5 seconds
await knex('large_table').select('*');

// Or use afterCreate hook for all connections
pool: {
  afterCreate: (conn, done) => {
    conn.query('SET statement_timeout = 30000', (err) => {
      done(err, conn);
    });
  }
}
```

#### Transaction Handling
- [ ] Transactions have timeout limits
- [ ] All queries in transaction use `.transacting(trx)`
- [ ] Transaction released on error (rollback)

```typescript
// Correct transaction pattern
await knex.transaction(async (trx) => {
  await trx('users').insert({ name: 'test' });
  await trx('logs').insert({ action: 'user_created' });
  // Commits automatically, rolls back on error
});
```

#### Graceful Shutdown
- [ ] `knex.destroy()` called on shutdown
- [ ] Wait for active queries before destroy

```typescript
process.on('SIGTERM', async () => {
  try {
    await knex.destroy();
    console.log('Database pool closed');
  } catch (error) {
    console.error('Error closing database', error);
  }
});
```

#### Error Handling
- [ ] Connection errors don't crash app
- [ ] "Pool full" errors monitored
- [ ] Query errors logged with context

> **Sources:**  
> - https://knexjs.org/guide/  
> - https://cloud.google.com/sql/docs/postgres/samples/cloud-sql-postgres-knex-timeout  
> - https://www.kmaschta.me/blog/2023/02/26/db-connections-pool-configuration

---

---

## 14 - 14-file-handling

### 3.1 Fastify Multipart Configuration

#### Plugin Registration
```javascript
fastify.register(require('@fastify/multipart'), {
  limits: {
    fieldNameSize: 100,     // Max field name size
    fieldSize: 1000000,     // Max field value size (1MB)
    fields: 10,             // Max non-file fields
    fileSize: 5242880,      // Max file size (5MB)
    files: 1,               // Max files per request
    headerPairs: 2000,      // Max header key-value pairs
    parts: 1000             // Max total parts
  }
});
```

#### Fastify Upload Handler Checklist
- [ ] `limits.fileSize` set appropriately (default is 1MB)
- [ ] `limits.files` set to expected maximum
- [ ] File stream consumed or properly destroyed
- [ ] Extension validated against allowlist
- [ ] Magic bytes verified using `file-type` package
- [ ] Filename sanitized (use `path.basename()`)
- [ ] Random filename generated for storage
- [ ] Error handling for `FilesLimitError`
- [ ] Temporary files cleaned up on error

#### Secure Upload Handler Example
```javascript
fastify.post('/upload', async (request, reply) => {
  const data = await request.file();
  
  if (!data) {
    return reply.code(400).send({ error: 'No file uploaded' });
  }
  
  // 1. Validate extension
  const ext = path.extname(data.filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    // Consume and discard the stream
    await data.file.resume();
    return reply.code(400).send({ error: 'Invalid file type' });
  }
  
  // 2. Read to buffer for validation
  const chunks = [];
  for await (const chunk of data.file) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  
  // 3. Validate magic bytes
  const fileType = await fileTypeFromBuffer(buffer);
  if (!fileType || !ALLOWED_MIME_TYPES.includes(fileType.mime)) {
    return reply.code(400).send({ error: 'Invalid file content' });
  }
  
  // 4. Generate secure filename
  const secureFilename = `${randomUUID()}${ext}`;
  
  // 5. Process image (sanitize)
  const processed = await sharp(buffer)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  
  // 6. Virus scan
  const scanResult = await clamscan.scanBuffer(processed);
  if (scanResult.isInfected) {
    return reply.code(400).send({ error: 'File rejected' });
  }
  
  // 7. Upload to S3
  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: `uploads/${secureFilename}`,
    Body: processed,
    ContentType: fileType.mime
  }));
  
  return { success: true, filename: secureFilename };
});
```

---

### 3.2 S3 Storage Security

#### Bucket Configuration Checklist
- [ ] Block Public Access enabled (account and bucket level)
- [ ] Default encryption enabled (SSE-S3 or SSE-KMS)
- [ ] Bucket versioning enabled
- [ ] HTTPS enforced via bucket policy
- [ ] Access logging enabled to separate bucket
- [ ] Lifecycle rules for cleanup/archival
- [ ] CORS configured with specific origins (not `*`)

#### IAM Policy (Least Privilege)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::bucket-name/uploads/*"
    }
  ]
}
```

#### Presigned URL Security
- [ ] Short expiration times (5-60 minutes typical)
- [ ] Content-Type specified in presigned URL
- [ ] Content-Disposition set to attachment
- [ ] Generated server-side only
- [ ] User authentication before generating
- [ ] Unique key per upload (include UUID)
- [ ] Validate file key format before generating URL

#### S3 Upload Configuration
```javascript
// Generate presigned URL for upload
const command = new PutObjectCommand({
  Bucket: process.env.S3_BUCKET,
  Key: `uploads/${userId}/${randomUUID()}.jpg`,
  ContentType: 'image/jpeg',
  // Metadata for tracking
  Metadata: {
    'uploaded-by': userId,
    'upload-timestamp': Date.now().toString()
  }
});

const presignedUrl = await getSignedUrl(s3Client, command, {
  expiresIn: 300  // 5 minutes
});
```

---

### 3.3 Image Upload for Events (Application-Specific)

#### Event Image Requirements
Typical requirements for event images:
- Supported formats: JPEG, PNG, WebP
- Maximum size: 5-10 MB
- Maximum dimensions: 4096x4096
- Output format: JPEG/WebP for web delivery
- Storage: S3 with CDN (CloudFront)

#### Processing Pipeline
```javascript
async function processEventImage(buffer, eventId) {
  // 1. Validate format
  const type = await fileTypeFromBuffer(buffer);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type?.mime)) {
    throw new Error('Invalid image format');
  }
  
  // 2. Get metadata and validate dimensions
  const metadata = await sharp(buffer).metadata();
  if (metadata.width > 4096 || metadata.height > 4096) {
    throw new Error('Image dimensions too large');
  }
  
  // 3. Generate variants
  const variants = await Promise.all([
    // Thumbnail (200x200)
    sharp(buffer)
      .resize(200, 200, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer(),
    
    // Preview (800x600)
    sharp(buffer)
      .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer(),
    
    // Full size (max 1920px)
    sharp(buffer)
      .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer()
  ]);
  
  // 4. Upload all variants
  const imageId = randomUUID();
  const uploads = [
    { key: `events/${eventId}/${imageId}_thumb.jpg`, body: variants[0] },
    { key: `events/${eventId}/${imageId}_preview.jpg`, body: variants[1] },
    { key: `events/${eventId}/${imageId}_full.jpg`, body: variants[2] }
  ];
  
  await Promise.all(uploads.map(u => 
    s3Client.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: u.key,
      Body: u.body,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000'
    }))
  ));
  
  return imageId;
}
```

#### Event Image Checklist
- [ ] Validate image format (JPEG, PNG, WebP only)
- [ ] Check dimensions before processing
- [ ] Strip EXIF data (privacy concern)
- [ ] Generate multiple sizes (thumb, preview, full)
- [ ] Use consistent naming convention
- [ ] Set appropriate Cache-Control headers
- [ ] Store image reference in database with event
- [ ] Implement cleanup when event deleted
- [ ] Serve via CDN with proper headers

---

---

## 15 - 15-notifications

### 3.1 Email Infrastructure Audit

#### Authentication Configuration
- [ ] SPF record published and valid (use `dig TXT yourdomain.com`)
- [ ] SPF record under 10 DNS lookups
- [ ] SPF uses `~all` not `-all` or `+all`
- [ ] DKIM signing enabled for all sending domains
- [ ] DKIM keys are 2048-bit
- [ ] DKIM key rotation schedule defined (≤6 months)
- [ ] DMARC record published with reporting enabled
- [ ] DMARC alignment configured (relaxed or strict)
- [ ] Separate DKIM keys per third-party sender
- [ ] TLS enforced for SMTP connections

#### Sending Infrastructure
- [ ] Transactional and marketing emails use separate IPs/subdomains
- [ ] Dedicated IP warming completed for new IPs
- [ ] Reverse DNS (PTR) records configured
- [ ] Sending domain not on blocklists (check MXToolbox)
- [ ] Google Postmaster Tools configured for monitoring

#### Provider Integration (AWS SES/SendGrid/etc.)
- [ ] Production access granted (not sandbox mode)
- [ ] Sending limits appropriate for expected volume
- [ ] Bounce notification webhook configured
- [ ] Complaint notification webhook configured
- [ ] Delivery notification webhook configured (optional)
- [ ] Suppression list synced with provider

---

### 3.2 Notification Service Code Audit

#### Input Validation
- [ ] Email addresses validated before sending
- [ ] Phone numbers validated (E.164 format)
- [ ] CRLF characters stripped from all header fields
- [ ] Nodemailer version ≥6.6.1 (CVE-2021-23400 fix)
- [ ] User input never directly used in template compilation
- [ ] URL parameters in emails use signed/encrypted tokens

#### Asynchronous Processing
- [ ] All notification sending is queued (not synchronous)
- [ ] Queue uses persistent storage (not in-memory only)
- [ ] Workers are idempotent (can safely retry)
- [ ] Distributed lock prevents duplicate processing
- [ ] Queue depth monitoring and alerting configured

#### Retry Logic
- [ ] Exponential backoff implemented
- [ ] Jitter added to prevent thundering herd
- [ ] Maximum retry count defined per notification type
- [ ] Dead-letter queue configured for exhausted retries
- [ ] DLQ monitoring and alerting in place
- [ ] Manual DLQ reprocessing capability exists

#### Rate Limiting
- [ ] Outbound rate limiting per channel implemented
- [ ] Rate limits respect provider limits (SES, Twilio, FCM)
- [ ] Burst protection for high-volume events (ticket drops)
- [ ] Per-user rate limiting to prevent abuse

---

### 3.3 Template Audit

#### Security
- [ ] Template engine version current (security patches applied)
- [ ] Logic-less templates used for any user-editable content
- [ ] No user input in template compilation step
- [ ] HTML output encoding applied to all variables
- [ ] Handlebars: `noPrototypeProperties` option enabled (or v4.6.0+)
- [ ] Templates stored in version control, not database
- [ ] Template preview doesn't execute on server

#### Content
- [ ] All templates include unsubscribe link (marketing emails)
- [ ] All templates include company contact info (CAN-SPAM)
- [ ] Plain-text version exists for all HTML templates
- [ ] Mobile-responsive design implemented
- [ ] Dynamic content uses secure token URLs (not user IDs)
- [ ] No sensitive data in subject lines
- [ ] QR codes/tickets use time-limited tokens

#### Branding
- [ ] Consistent branding across all notification types
- [ ] White-label support for venue-specific templates
- [ ] Template inheritance/partials for maintainability

---

### 3.4 Delivery Tracking Audit

#### Email Tracking
- [ ] Sent events logged with message ID
- [ ] Delivery status tracked (delivered/bounced/deferred)
- [ ] Bounce type (hard/soft) captured and processed
- [ ] Spam complaints captured and processed
- [ ] Open tracking implemented (optional, privacy considerations)
- [ ] Click tracking implemented (optional)
- [ ] Delivery status queryable per message

#### SMS Tracking (Twilio)
- [ ] StatusCallback URL configured in all send requests
- [ ] All status events logged (queued, sent, delivered, failed)
- [ ] Error codes captured for failed messages
- [ ] Delivery receipts monitored (where available)

#### Push Notification Tracking
- [ ] Send success/failure logged per device
- [ ] Invalid token responses processed (remove stale tokens)
- [ ] FCM/APNs error codes logged
- [ ] Delivery metrics exported (FCM BigQuery optional)

---

### 3.5 Bounce/Complaint Handling Audit

#### Bounce Processing
- [ ] Hard bounces immediately add to suppression list
- [ ] Soft bounces tracked with retry count
- [ ] Soft bounces converted to suppression after threshold
- [ ] Suppression list checked before every send
- [ ] Suppression list shared across all notification types
- [ ] Database schema supports bounce reason storage

#### Complaint Processing
- [ ] Complaints immediately add to suppression list
- [ ] Complaint feedback loop (FBL) configured with major ISPs
- [ ] Complaint patterns analyzed for content issues
- [ ] Complaint rate monitored (<0.1% threshold)

---

### 3.6 Unsubscribe Handling Audit

#### Marketing Emails
- [ ] List-Unsubscribe header included
- [ ] List-Unsubscribe-Post header included (RFC 8058)
- [ ] Unsubscribe endpoint handles POST requests
- [ ] Unsubscribe endpoint uses HTTPS
- [ ] No redirects in unsubscribe response
- [ ] Unsubscribe processed within 2 days (recommend: immediate)
- [ ] Visible unsubscribe link in email footer
- [ ] Unsubscribe works without login
- [ ] Preference center available (optional)

#### Transactional Emails
- [ ] Notification preferences link included
- [ ] Users can opt out of non-critical notifications
- [ ] Order confirmations always sent (can't opt out)

---

### 3.7 SMS Specific Audit

#### Compliance
- [ ] TCPA consent captured before sending (US)
- [ ] Opt-out keyword handling (STOP, UNSUBSCRIBE)
- [ ] Opt-out processed within 24 hours
- [ ] Message includes sender identification
- [ ] A2P 10DLC registration complete (US long codes)

#### Provider Configuration
- [ ] Messaging Service configured for number pooling
- [ ] Status callback webhook configured
- [ ] Error handling for carrier filtering
- [ ] Rate limiting respects MPS limits

---

### 3.8 Push Notification Specific Audit

#### Token Management
- [ ] Token refresh on every app launch
- [ ] Token changes synced to server immediately
- [ ] Stale tokens removed after inactivity period (30 days)
- [ ] Invalid token responses trigger immediate removal
- [ ] Token-to-user mapping supports multiple devices

#### Provider Configuration
- [ ] FCM server key/credentials securely stored
- [ ] APNs auth key uploaded to FCM (for iOS via FCM)
- [ ] APNs direct integration if using (production vs sandbox)
- [ ] HTTP/2 connection pooling for APNs
- [ ] Error response handling for all error codes

#### Content
- [ ] Payload size under 4KB (FCM/APNs limit)
- [ ] Collapse keys used for updatable notifications
- [ ] Priority correctly set (high for time-sensitive)
- [ ] TTL set appropriately (not too long for stale content)

---

### 3.9 TicketToken-Specific Checks

#### Ticket Confirmation Emails
- [ ] QR code/ticket tokens are time-limited or signed
- [ ] PDF ticket attachments scanned for injection
- [ ] Order details don't expose full payment info
- [ ] Event details dynamically pulled (not stale cached)
- [ ] Calendar file (.ics) attachment generated securely

#### Event Notifications
- [ ] Venue-specific templates support white-label branding
- [ ] Event cancellation notifications use high-priority channel
- [ ] Last-minute changes use push + SMS (not just email)
- [ ] Notifications include event ID for deep linking

#### Secondary Marketplace (Resale) Notifications
- [ ] Seller notified of listing status changes
- [ ] Buyer notified of purchase confirmation
- [ ] Royalty recipients notified of payout
- [ ] Price alerts respect user notification preferences

#### QR Code Delivery
- [ ] QR codes contain signed tokens, not user IDs
- [ ] QR codes have expiration tied to event date
- [ ] Refresh mechanism for compromised QR codes
- [ ] Backup delivery channel if primary fails

---

---

## 16 - 16-caching

### 3.1 Redis Infrastructure Security

| # | Check | Status | Notes |
|---|-------|--------|-------|
| R1 | Redis not exposed to public internet | ☐ | |
| R2 | Redis AUTH enabled with strong password | ☐ | |
| R3 | ACLs configured for application users (Redis 6+) | ☐ | |
| R4 | TLS encryption enabled for data in transit | ☐ | |
| R5 | Dangerous commands disabled/renamed (FLUSHALL, CONFIG, DEBUG) | ☐ | |
| R6 | `maxmemory` limit configured | ☐ | |
| R7 | Eviction policy set appropriately | ☐ | |
| R8 | Redis deployed in private subnet/VPC | ☐ | |
| R9 | Firewall rules restrict access to app servers only | ☐ | |
| R10 | Redis version is current (security patches) | ☐ | |
| R11 | Persistence configured appropriately (RDB/AOF) | ☐ | |
| R12 | High availability setup (Sentinel/Cluster) for production | ☐ | |
| R13 | Monitoring and alerting configured | ☐ | |
| R14 | Connection pooling implemented in application | ☐ | |
| R15 | Credentials stored securely (not in code) | ☐ | |

---

### 3.2 Multi-Tenant Data Isolation

| # | Check | Status | Notes |
|---|-------|--------|-------|
| MT1 | Tenant ID included in all cache keys | ☐ | |
| MT2 | Key prefix enforced at framework/middleware level | ☐ | |
| MT3 | No cross-tenant data access possible | ☐ | |
| MT4 | ACLs restrict users to tenant key patterns | ☐ | |
| MT5 | SCAN/KEYS operations scoped to tenant prefix | ☐ | |
| MT6 | Tenant isolation verified with integration tests | ☐ | |
| MT7 | Bulk operations (FLUSHDB) disabled for app users | ☐ | |
| MT8 | Tenant data cannot leak through error messages | ☐ | |
| MT9 | Cache key generation centralized (not scattered) | ☐ | |
| MT10 | Noisy neighbor protection (memory/rate limits) | ☐ | |

---

### 3.3 Session Data Security

| # | Check | Status | Notes |
|---|-------|--------|-------|
| S1 | Session IDs are cryptographically random | ☐ | |
| S2 | Session TTL configured (not infinite) | ☐ | |
| S3 | Session invalidation on logout implemented | ☐ | |
| S4 | Session data encrypted at rest (if sensitive) | ☐ | |
| S5 | Session fixation prevention in place | ☐ | |
| S6 | Session regeneration after privilege changes | ☐ | |
| S7 | Inactive session timeout configured | ☐ | |
| S8 | Concurrent session limits enforced (if required) | ☐ | |
| S9 | Session data minimized (no unnecessary PII) | ☐ | |
| S10 | Session store failures handled gracefully | ☐ | |
| S11 | Session keys prefixed uniquely per application | ☐ | |
| S12 | Session data serialization is secure (no injection) | ☐ | |
| S13 | Remote session invalidation capability exists | ☐ | |
| S14 | Session activity logging for security audit | ☐ | |

---

### 3.4 API Response Caching

| # | Check | Status | Notes |
|---|-------|--------|-------|
| A1 | Cache-Control headers set appropriately | ☐ | |
| A2 | Private data uses `Cache-Control: private` | ☐ | |
| A3 | Sensitive data uses `Cache-Control: no-store` | ☐ | |
| A4 | ETag or Last-Modified headers implemented | ☐ | |
| A5 | Conditional requests (304) supported | ☐ | |
| A6 | Vary header used for content negotiation | ☐ | |
| A7 | Only GET/HEAD responses cached | ☐ | |
| A8 | Cache key includes all relevant parameters | ☐ | |
| A9 | User-specific data not in shared cache | ☐ | |
| A10 | Cache invalidation triggered on mutations | ☐ | |
| A11 | CDN cache-control directives configured | ☐ | |
| A12 | Error responses not cached (or short TTL) | ☐ | |
| A13 | API versioning reflected in cache keys | ☐ | |

---

### 3.5 Cache Implementation Verification

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C1 | All cache entries have TTL set | ☐ | |
| C2 | TTLs appropriate for data volatility | ☐ | |
| C3 | TTL jitter implemented to prevent stampedes | ☐ | |
| C4 | Cache stampede prevention in place | ☐ | |
| C5 | Cache key naming convention documented | ☐ | |
| C6 | Cache key generation centralized | ☐ | |
| C7 | Keys normalized (case, encoding, ordering) | ☐ | |
| C8 | Cache failures don't crash application | ☐ | |
| C9 | Fallback to database on cache miss | ☐ | |
| C10 | Circuit breaker for cache failures | ☐ | |
| C11 | Cache hit/miss metrics collected | ☐ | |
| C12 | Cache size/memory monitored | ☐ | |
| C13 | Serialization format efficient and secure | ☐ | |
| C14 | Large values handled appropriately | ☐ | |

---

### 3.6 Cache Invalidation Verification

| # | Check | Status | Notes |
|---|-------|--------|-------|
| I1 | Invalidation triggered on CREATE operations | ☐ | |
| I2 | Invalidation triggered on UPDATE operations | ☐ | |
| I3 | Invalidation triggered on DELETE operations | ☐ | |
| I4 | Cascading invalidation for related entities | ☐ | |
| I5 | Event-driven invalidation for real-time needs | ☐ | |
| I6 | TTL backup for missed invalidation events | ☐ | |
| I7 | Invalidation covers all write paths | ☐ | |
| I8 | Out-of-band updates trigger invalidation | ☐ | |
| I9 | Batch operations invalidate affected keys | ☐ | |
| I10 | Invalidation logged for debugging | ☐ | |

---

### 3.7 Data That Should NEVER Be Cached

| Data Type | Reason | Alternative |
|-----------|--------|-------------|
| Passwords/hashes | Security risk | Never store in cache |
| Full credit card numbers | PCI compliance | Token only |
| CVV/security codes | PCI compliance | Never persist |
| Social Security Numbers | Regulatory compliance | Encrypt if needed |
| Private encryption keys | Security risk | Secure key store |
| Health records (PHI) | HIPAA compliance | Encrypt + strict access |
| Unencrypted PII | Privacy regulations | Encrypt or tokenize |
| Session tokens in shared cache | Security risk | Private cache only |
| One-time passwords | Security risk | Short TTL if any |
| Internal system credentials | Security risk | Vault/secrets manager |

---

### 3.8 Invalidation Triggers to Verify

For each cached entity, verify invalidation occurs on:

**User Data:**
- [ ] User profile update
- [ ] User deletion
- [ ] Password change
- [ ] Role/permission change
- [ ] Account suspension/activation

**Product/Inventory Data:**
- [ ] Price update
- [ ] Stock level change
- [ ] Product creation/deletion
- [ ] Category reassignment
- [ ] Availability status change

**Order/Transaction Data:**
- [ ] Order status update
- [ ] Payment confirmation
- [ ] Refund processing
- [ ] Order cancellation

**Configuration Data:**
- [ ] System settings change
- [ ] Feature flag toggle
- [ ] Rate limit adjustment

**Multi-Service Invalidation:**
- [ ] Cross-service data updates
- [ ] Event-driven sync between services
- [ ] Database replication lag handling

---

### 3.9 TicketToken-Specific Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| TT1 | Event data cache invalidated on updates | ☐ | |
| TT2 | Ticket availability cached with short TTL | ☐ | |
| TT3 | QR codes not cached (generated fresh) | ☐ | |
| TT4 | Price data invalidated on changes | ☐ | |
| TT5 | Seat maps cached with invalidation on booking | ☐ | |
| TT6 | User wallet balance not stale-cached | ☐ | |
| TT7 | NFT ownership data synchronized | ☐ | |
| TT8 | Secondary market listings updated in real-time | ☐ | |
| TT9 | Tenant branding cached with proper invalidation | ☐ | |
| TT10 | Rate limiting counters use appropriate TTL | ☐ | |
| TT11 | Search results cached with reasonable TTL | ☐ | |
| TT12 | Payment tokens NEVER cached | ☐ | |

---

---

## 17 - 17-queues-background-jobs

### 3.1 Job Definition Checklist

#### General Job Configuration

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Every job has explicit `attempts` configured | ☐ | |
| 2 | Every job has appropriate `backoff` strategy | ☐ | |
| 3 | Jobs have sensible `timeout` values | ☐ | |
| 4 | `removeOnComplete` configured (not unlimited) | ☐ | |
| 5 | `removeOnFail` preserves failures for debugging | ☐ | |
| 6 | Job priority set appropriately | ☐ | |
| 7 | Job IDs are deterministic when idempotency needed | ☐ | |
| 8 | Job data is JSON-serializable | ☐ | |
| 9 | Sensitive data encrypted or excluded from job payload | ☐ | |
| 10 | Job payload size is reasonable (< 100KB) | ☐ | |

#### Idempotency Verification

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 11 | Job handler checks for prior completion | ☐ | |
| 12 | External API calls include idempotency keys | ☐ | |
| 13 | Database operations use transactions | ☐ | |
| 14 | State changes are absolute, not incremental | ☐ | |
| 15 | Duplicate processing produces same result | ☐ | |

---

### 3.2 Worker Configuration Checklist

#### Core Worker Settings

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 16 | `concurrency` appropriate for workload type | ☐ | |
| 17 | `lockDuration` >= longest expected job time | ☐ | |
| 18 | `stalledInterval` configured | ☐ | |
| 19 | `maxStalledCount` set (1-3 recommended) | ☐ | |
| 20 | Error handler attached (`worker.on('error')`) | ☐ | |
| 21 | Failed handler attached for DLQ | ☐ | |
| 22 | Graceful shutdown on SIGTERM/SIGINT | ☐ | |
| 23 | Unhandled rejection handler installed | ☐ | |
| 24 | Worker auto-restarts on crash (PM2/systemd) | ☐ | |
| 25 | Connection retry strategy configured | ☐ | |

#### Resource Management

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 26 | Redis connection pooling configured | ☐ | |
| 27 | Memory limits appropriate | ☐ | |
| 28 | CPU-intensive work uses sandboxed processors | ☐ | |
| 29 | External connections have timeouts | ☐ | |
| 30 | Database connections released after use | ☐ | |

---

### 3.3 Monitoring & Alerting Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 31 | Queue depth (waiting jobs) monitored | ☐ | |
| 32 | Active job count monitored | ☐ | |
| 33 | Failed job rate monitored | ☐ | |
| 34 | Stalled job events tracked | ☐ | |
| 35 | Job processing duration tracked | ☐ | |
| 36 | Dead letter queue size monitored | ☐ | |
| 37 | Worker count/health monitored | ☐ | |
| 38 | Redis memory usage monitored | ☐ | |
| 39 | Alert on high queue depth | ☐ | |
| 40 | Alert on stalled jobs | ☐ | |
| 41 | Alert on high failure rate | ☐ | |
| 42 | Alert on no active workers | ☐ | |
| 43 | Alert on DLQ accumulation | ☐ | |
| 44 | Dashboard for queue visualization | ☐ | |
| 45 | Logs include job ID for tracing | ☐ | |

---

### 3.4 NFT Minting Jobs Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 46 | Idempotency key based on mint request ID | ☐ | |
| 47 | Check if NFT already minted before processing | ☐ | |
| 48 | Blockchain transaction nonce managed properly | ☐ | |
| 49 | Gas estimation with buffer included | ☐ | |
| 50 | Transaction timeout appropriate for network | ☐ | |
| 51 | Retry handles "nonce too low" errors | ☐ | |
| 52 | Failed mints don't leave orphaned records | ☐ | |
| 53 | Metadata upload to IPFS is idempotent | ☐ | |
| 54 | Wallet balance checked before minting | ☐ | |
| 55 | Priority set higher for user-initiated mints | ☐ | |
| 56 | Batch minting jobs are resumable | ☐ | |
| 57 | Gas price spikes handled gracefully | ☐ | |
| 58 | Network congestion triggers appropriate backoff | ☐ | |
| 59 | Mint confirmation waited before completion | ☐ | |
| 60 | Webhook/notification sent on mint success | ☐ | |

---

### 3.5 Email Jobs Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 61 | Idempotency key prevents duplicate sends | ☐ | |
| 62 | Email provider's idempotency used (if available) | ☐ | |
| 63 | Rate limiting respects provider limits | ☐ | |
| 64 | Bounce handling updates user records | ☐ | |
| 65 | Unsubscribe checked before sending | ☐ | |
| 66 | Template rendering errors caught | ☐ | |
| 67 | Large attachments handled separately | ☐ | |
| 68 | Email content logged (without sensitive data) | ☐ | |
| 69 | Retry backoff respects rate limits | ☐ | |
| 70 | Failed emails tracked for analysis | ☐ | |
| 71 | Priority appropriate (transactional vs marketing) | ☐ | |
| 72 | Timeout set for SMTP connections | ☐ | |

---

### 3.6 Payment Processing Jobs Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 73 | **Idempotency key always included in payment API calls** | ☐ | CRITICAL |
| 74 | Payment status checked before processing | ☐ | |
| 75 | Database record created before external call | ☐ | |
| 76 | Payment provider webhook reconciliation | ☐ | |
| 77 | Duplicate charge detection in place | ☐ | |
| 78 | Failed payments trigger customer notification | ☐ | |
| 79 | Refund jobs also idempotent | ☐ | |
| 80 | Currency and amount validation | ☐ | |
| 81 | Payment provider errors categorized (retry vs fatal) | ☐ | |
| 82 | Card decline doesn't retry indefinitely | ☐ | |
| 83 | Fraud check results respected | ☐ | |
| 84 | Payment tokens never logged | ☐ | |
| 85 | PCI compliance maintained in job data | ☐ | |
| 86 | Concurrent payment prevention per order | ☐ | |
| 87 | Settlement reconciliation jobs scheduled | ☐ | |

---

### 3.7 Redis Configuration Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 88 | `maxmemory-policy` set to `noeviction` | ☐ | CRITICAL |
| 89 | `maxmemory` configured appropriately | ☐ | |
| 90 | Persistence configured (RDB/AOF) | ☐ | |
| 91 | High availability setup (Sentinel/Cluster) | ☐ | |
| 92 | TLS encryption enabled | ☐ | |
| 93 | Authentication (AUTH/ACLs) configured | ☐ | |
| 94 | Connection limits appropriate | ☐ | |
| 95 | Backup schedule in place | ☐ | |

---

### 3.8 Infrastructure Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 96 | Workers run on separate processes/containers | ☐ | |
| 97 | Auto-scaling based on queue depth | ☐ | |
| 98 | Health checks configured | ☐ | |
| 99 | Log aggregation in place | ☐ | |
| 100 | Deployment doesn't kill active jobs | ☐ | |
| 101 | Rolling deployment strategy | ☐ | |
| 102 | Disaster recovery plan documented | ☐ | |

---

---

## 18 - 18-search

### 3.1 Elasticsearch Cluster Security

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | `xpack.security.enabled: true` in elasticsearch.yml | ☐ | CRITICAL |
| 2 | TLS enabled for HTTP layer (`xpack.security.http.ssl.enabled: true`) | ☐ | CRITICAL |
| 3 | TLS enabled for transport layer | ☐ | |
| 4 | Elasticsearch bound to private network only (not 0.0.0.0) | ☐ | CRITICAL |
| 5 | Ports 9200/9300 not exposed to public internet | ☐ | CRITICAL |
| 6 | All built-in user passwords changed from defaults | ☐ | |
| 7 | Audit logging enabled for security events | ☐ | |
| 8 | Anonymous access disabled | ☐ | |
| 9 | API keys rotated regularly (< 90 days) | ☐ | |
| 10 | Elasticsearch version is current (security patches) | ☐ | |
| 11 | Scripting disabled or restricted to stored scripts only | ☐ | |
| 12 | `index.max_result_window` not increased beyond 10,000 | ☐ | |

### 3.2 Application Architecture

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 13 | Elasticsearch not directly accessible from frontend | ☐ | CRITICAL |
| 14 | All ES requests go through application backend | ☐ | |
| 15 | Application authenticates to ES with minimal-privilege credentials | ☐ | |
| 16 | ES connection strings not exposed to clients | ☐ | |
| 17 | Rate limiting on search endpoints | ☐ | |
| 18 | Request timeout configured (< 30s for user-facing) | ☐ | |
| 19 | Circuit breaker pattern for ES failures | ☐ | |
| 20 | Health checks don't expose ES details | ☐ | |

### 3.3 Query Construction Security

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 21 | User input never interpolated into query strings | ☐ | CRITICAL |
| 22 | Search templates used with double-brace escaping | ☐ | |
| 23 | Allowed query fields whitelisted | ☐ | |
| 24 | Query structure validated before execution | ☐ | |
| 25 | No user control over `_source`, `script`, `aggs` | ☐ | |
| 26 | Sort fields limited to allowed list | ☐ | |
| 27 | Highlight fields restricted | ☐ | |
| 28 | Query logging (without PII) for security review | ☐ | |

### 3.4 Multi-Tenant Isolation

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 29 | **Every search query includes tenant filter** | ☐ | CRITICAL |
| 30 | Tenant ID validated from authenticated session | ☐ | CRITICAL |
| 31 | Tenant ID not accepted from user input | ☐ | |
| 32 | Filtered aliases used for tenant isolation | ☐ | |
| 33 | Cross-tenant queries explicitly forbidden | ☐ | |
| 34 | Tenant isolation tested with automated tests | ☐ | |
| 35 | Audit log captures tenant context | ☐ | |
| 36 | Data export respects tenant boundaries | ☐ | |

### 3.5 Permission-Based Result Filtering

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 37 | Permission filters applied at query level (not post-query) | ☐ | CRITICAL |
| 38 | Document-level security configured for sensitive indices | ☐ | |
| 39 | Field-level security hides sensitive fields | ☐ | |
| 40 | Public/private visibility enforced in query | ☐ | |
| 41 | Owner/creator permissions checked | ☐ | |
| 42 | Group-based permissions supported | ☐ | |
| 43 | Permission inheritance handled correctly | ☐ | |
| 44 | Admin/superuser queries logged separately | ☐ | |

### 3.6 Pagination & Result Limits

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 45 | Default page size enforced (e.g., 20) | ☐ | |
| 46 | Maximum page size enforced (e.g., 100) | ☐ | |
| 47 | Deep pagination blocked (from + size > 10,000) | ☐ | |
| 48 | `search_after` used for deep pagination needs | ☐ | |
| 49 | Scroll context TTL limited (< 5 minutes) | ☐ | |
| 50 | Total hits count capped (`track_total_hits`: 10000) | ☐ | |
| 51 | Returned fields limited (`_source` filtering) | ☐ | |
| 52 | Query timeout enforced | ☐ | |

### 3.7 Event Search Specific

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 53 | Event search includes tenant filter | ☐ | |
| 54 | Draft/unpublished events filtered for non-admins | ☐ | |
| 55 | Cancelled events handled appropriately | ☐ | |
| 56 | Future events only shown if published | ☐ | |
| 57 | Event visibility (public/private) enforced | ☐ | |
| 58 | Price/capacity data protected if sensitive | ☐ | |
| 59 | Venue coordinates don't leak private venues | ☐ | |
| 60 | Event search results don't expose organizer PII | ☐ | |

### 3.8 Ticket Search Specific

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 61 | Ticket search includes owner filter | ☐ | CRITICAL |
| 62 | Users can only search their own tickets | ☐ | CRITICAL |
| 63 | Admins can search all tickets with audit | ☐ | |
| 64 | Ticket codes/secrets never in search results | ☐ | |
| 65 | Transfer history protected | ☐ | |
| 66 | Payment details excluded from search | ☐ | |
| 67 | Buyer PII not exposed in resale listings | ☐ | |
| 68 | Blockchain wallet addresses handled per privacy policy | ☐ | |

### 3.9 Index Configuration

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 69 | Indices use appropriate shard count | ☐ | |
| 70 | Tenant ID field is `keyword` type (not analyzed) | ☐ | |
| 71 | Sensitive fields not analyzed (no inverted index) | ☐ | |
| 72 | PII fields excluded from `_all` / `copy_to` | ☐ | |
| 73 | Index templates enforce security mappings | ☐ | |
| 74 | Alias naming conventions followed | ☐ | |
| 75 | Index lifecycle policy configured | ☐ | |
| 76 | Old data deleted per retention policy | ☐ | |

### 3.10 Monitoring & Incident Response

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 77 | Search latency monitored | ☐ | |
| 78 | Query error rates tracked | ☐ | |
| 79 | Slow query log enabled | ☐ | |
| 80 | Failed authentication attempts alerted | ☐ | |
| 81 | Unusual query patterns detected | ☐ | |
| 82 | Cross-tenant access attempts logged | ☐ | |
| 83 | Backup strategy for ES data | ☐ | |
| 84 | Disaster recovery tested | ☐ | |
| 85 | Incident response plan includes ES breaches | ☐ | |

---

---

## 19 - 19-configuration-management

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

---

## 20 - 20-deployment-cicd

### 3.1 CI/CD Pipeline Configuration

#### Source Code Management (SCM)
- [ ] Branch protection enabled on main/production branches
- [ ] Require pull request reviews (minimum 1-2 reviewers)
- [ ] Require status checks to pass before merging
- [ ] Signed commits required or encouraged
- [ ] No direct pushes to protected branches

#### Pipeline Security
- [ ] Pipeline configuration is version controlled
- [ ] No hardcoded secrets in workflow files
- [ ] Secrets stored in platform secret management (not env files)
- [ ] OIDC used instead of long-lived credentials where possible
- [ ] Third-party actions pinned to full SHA (not tags)
- [ ] `GITHUB_TOKEN` permissions set to minimum required
- [ ] Self-hosted runners secured (if used)
- [ ] Build artifacts signed and verified

#### Secret Management
- [ ] All secrets encrypted at rest and in transit
- [ ] Secrets scoped to specific environments (dev/staging/prod)
- [ ] Secret rotation schedule documented and followed
- [ ] Secret detection in pre-commit hooks
- [ ] Secret scanning in CI pipeline
- [ ] No organizational secrets accessible to all repositories
- [ ] Audit log review for secret access

#### Security Scanning Integration
- [ ] SAST (Static Application Security Testing) enabled
- [ ] DAST (Dynamic Application Security Testing) in staging
- [ ] Dependency vulnerability scanning (SCA)
- [ ] Container image scanning with severity thresholds
- [ ] IaC scanning (Terraform, CloudFormation, Kubernetes manifests)
- [ ] Pipeline fails on critical/high vulnerabilities

### 3.2 Dockerfile Security

#### Base Image
- [ ] Using official or verified publisher images
- [ ] Base image version pinned (not `latest`)
- [ ] Minimal base image used (Alpine, Distroless, Scratch)
- [ ] Base image regularly updated (monthly minimum)
- [ ] Base image scanned before use

#### Build Security
- [ ] Multi-stage builds to minimize final image size
- [ ] No secrets in build arguments or environment variables
- [ ] `.dockerignore` excludes sensitive files (.env, .git, credentials)
- [ ] `COPY` preferred over `ADD` (unless extracting archives)
- [ ] Single `RUN` commands to reduce layers
- [ ] Package manager cache cleared after install

#### Runtime Security
- [ ] Non-root user defined with explicit UID/GID
- [ ] `USER` instruction present before `ENTRYPOINT`/`CMD`
- [ ] No SUID/SGID binaries unless required
- [ ] Read-only root filesystem where possible
- [ ] Only required ports exposed
- [ ] Health check defined

#### Dockerfile Checklist Script
```bash
# Quick Dockerfile audit
grep -E "^FROM.*:latest" Dockerfile && echo "WARNING: Using :latest tag"
grep -E "^USER root|^USER 0" Dockerfile && echo "WARNING: Running as root"
grep -E "ADD http|ADD https" Dockerfile && echo "WARNING: ADD from URL (use curl/wget)"
grep -E "ENV.*PASSWORD|ENV.*SECRET|ENV.*KEY" Dockerfile && echo "CRITICAL: Possible hardcoded secret"
grep -E "^EXPOSE" Dockerfile || echo "INFO: No ports exposed"
grep -E "^HEALTHCHECK" Dockerfile || echo "WARNING: No healthcheck defined"
```

### 3.3 Deployment Safeguards

#### Environment Controls
- [ ] Production environment requires approval
- [ ] Different secrets per environment (dev/staging/prod)
- [ ] Environment-specific configurations validated
- [ ] Production access limited to specific teams/individuals
- [ ] Deployment history tracked and auditable

#### Deployment Strategy
- [ ] Deployment strategy documented (rolling/blue-green/canary)
- [ ] Health checks configured for deployment validation
- [ ] Rollback procedure documented and tested
- [ ] Database migration strategy includes rollback
- [ ] Feature flags used for gradual rollouts

#### Monitoring & Alerting
- [ ] Deployment alerts configured
- [ ] Error rate monitoring post-deployment
- [ ] Latency monitoring post-deployment
- [ ] Resource utilization monitoring
- [ ] Automatic rollback on health check failures

#### Kubernetes-Specific
- [ ] Pod Security Standards enforced (restricted)
- [ ] Network policies defined and enforced
- [ ] Resource limits and requests set
- [ ] Liveness and readiness probes configured
- [ ] Service accounts with minimal permissions
- [ ] Secrets mounted as files (not env vars) where possible

### 3.4 GitHub Actions Specific Checklist

```yaml
# Security-hardened workflow template
name: Secure Build and Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# Restrict default permissions
permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      id-token: write  # For OIDC
    
    steps:
      - name: Checkout
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # v4.1.1 pinned
        
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@f95db51fddba0c2d1ec667646a06c2ce06100226  # v3.0.0 pinned
        
      # OIDC authentication - no stored credentials
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@e3dd6a429d7300a6a4c196c26e071d42e0343502  # v4.0.2 pinned
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1
          
      - name: Scan for secrets
        uses: trufflesecurity/trufflehog@main  # Secret scanning
        with:
          path: ./
          
      - name: Build image
        run: |
          docker build -t $IMAGE_NAME:${{ github.sha }} .
          
      - name: Scan image with Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: '${{ env.IMAGE_NAME }}:${{ github.sha }}'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'
          
      - name: Sign image with Cosign
        env:
          COSIGN_EXPERIMENTAL: 'true'
        run: cosign sign --yes $IMAGE_NAME@$DIGEST

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: production  # Requires approval
    
    steps:
      - name: Deploy to Kubernetes
        run: |
          # Deployment commands
```

### 3.5 Quick Reference: What to Verify

| Component | Must Have | Red Flags |
|-----------|-----------|-----------|
| **Workflows** | Pinned action SHAs, minimal permissions | `@main` tags, `permissions: write-all` |
| **Secrets** | Environment-scoped, rotated regularly | Org-wide secrets, never rotated |
| **Images** | Scanned, signed, non-root | No scanning, root user, `:latest` tag |
| **Deployments** | Approval gates, rollback plan | Auto-deploy to prod, no monitoring |
| **IaC** | Scanned, state encrypted | Hardcoded secrets, local state |
| **Logs** | Secrets masked | Credentials visible in output |

---

---

## 21 - 21-database-migrations

### 3.1 Migration File Checklist

#### File Structure & Naming
- [ ] Migration files use timestamp prefix (e.g., `20241220143022_`)
- [ ] File names are descriptive (`add_user_email_index` not `update_1`)
- [ ] One logical change per migration file
- [ ] Files are in correct directory (`migrations/` or configured path)

#### Up Function
- [ ] `exports.up` function exists and returns a Promise
- [ ] Uses `knex.schema` methods (not raw SQL unless necessary)
- [ ] Handles errors appropriately
- [ ] Does not contain hardcoded environment-specific values

```javascript
// ✅ Good
exports.up = function(knex) {
  return knex.schema.createTable('tickets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('event_name').notNullable();
    table.timestamps(true, true);
  });
};

// ❌ Bad - hardcoded values, raw SQL without reason
exports.up = function(knex) {
  return knex.raw(`
    INSERT INTO settings VALUES ('api_key', 'sk-live-abc123')
  `);
};
```

#### Down Function
- [ ] `exports.down` function exists
- [ ] Down function reverses the up function
- [ ] Irreversible migrations throw descriptive error
- [ ] Down function tested

```javascript
// ✅ Good - reversible
exports.down = function(knex) {
  return knex.schema.dropTable('tickets');
};

// ✅ Good - documented irreversible
exports.down = function(knex) {
  throw new Error(
    'Cannot reverse: data transformation from legacy_status to status enum. ' +
    'Restore from backup if rollback needed.'
  );
};

// ❌ Bad - empty down
exports.down = function(knex) {};
```

#### Data Safety
- [ ] No `DROP TABLE` without archiving important data
- [ ] No `DROP COLUMN` on columns with important data
- [ ] Column type changes don't truncate data
- [ ] `NOT NULL` constraints have defaults or data backfill
- [ ] Foreign keys use `RESTRICT` not `CASCADE` (unless intentional)

#### Performance & Locking
- [ ] Large table operations use `CONCURRENTLY` where available
- [ ] Data migrations process in batches
- [ ] `lock_timeout` set for operations on busy tables
- [ ] Index creation uses `CREATE INDEX CONCURRENTLY`

```javascript
// ✅ Good - concurrent index
exports.up = function(knex) {
  return knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_user_id 
    ON orders(user_id)
  `);
};
exports.config = { transaction: false };

// ❌ Bad - blocks writes
exports.up = function(knex) {
  return knex.schema.table('orders', (t) => t.index('user_id'));
};
```

### 3.2 Migration Process Checklist

#### Version Control
- [ ] All migrations committed to git
- [ ] Migrations included in code review process
- [ ] No migrations modified after being applied to shared environments
- [ ] Migration order matches expected deployment order

#### Testing
- [ ] Migrations tested in CI pipeline
- [ ] Up migration tested
- [ ] Down migration tested
- [ ] Idempotency tested (running twice doesn't error)
- [ ] Tested with production-like data volume
- [ ] Tested with production-like data patterns

#### CI/CD Integration
- [ ] Migrations run automatically in pipeline
- [ ] Pipeline fails if migration fails
- [ ] Staging migrations run before production
- [ ] Production requires approval gate
- [ ] Deployment order: migrate → deploy code

```yaml
# Verify CI config includes:
- Migration test stage
- Staging deployment with migrations
- Production approval requirement
- Rollback procedure documented
```

#### Environment Configuration
- [ ] `knexfile.js` has correct configuration per environment
- [ ] Connection strings use environment variables
- [ ] No credentials hardcoded
- [ ] Migration directory correctly specified

```javascript
// ✅ Good knexfile.js
module.exports = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL || {
      host: 'localhost',
      database: 'tickettoken_dev',
    },
    migrations: { directory: './migrations' },
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: { directory: './migrations' },
    pool: { min: 2, max: 10 },
  },
};
```

### 3.3 Safeguards Checklist

#### Backup & Recovery
- [ ] Automated backup before production migrations
- [ ] Backup tested and verified restorable
- [ ] Point-in-time recovery enabled (PostgreSQL WAL archiving)
- [ ] Backup retention policy documented
- [ ] Recovery time objective (RTO) defined

```bash
# Verify backup exists and is recent
pg_dump -Fc production_db > backup_$(date +%Y%m%d_%H%M%S).dump

# Test restore
pg_restore -d test_restore backup.dump
```

#### Monitoring & Alerting
- [ ] Database monitoring in place (connections, locks, query time)
- [ ] Alerts for long-running queries during migration
- [ ] Error rate monitoring after deployment
- [ ] Deployment notification to team

#### Access Control
- [ ] Migration credentials are separate from application credentials
- [ ] Production database access limited to CI/CD service account
- [ ] No developer direct access to production database
- [ ] Audit logging enabled for DDL statements

```sql
-- PostgreSQL: Check for DDL audit logging
SHOW log_statement;  -- Should be 'ddl' or 'all'
```

#### Rollback Readiness
- [ ] Rollback procedure documented
- [ ] Rollback tested in staging
- [ ] Team knows who can authorize rollback
- [ ] Communication plan for rollback scenario

### 3.4 Knex-Specific Checks

#### Configuration
```bash
# Verify knex is properly configured
npx knex migrate:status

# Expected output shows all migrations and their status
```

- [ ] `knex_migrations` table exists in database
- [ ] `knex_migrations_lock` table exists
- [ ] Migration directory matches knexfile.js configuration
- [ ] TypeScript configuration correct (if using TS)

#### Commands Knowledge
```bash
# Essential commands team should know:
npx knex migrate:make <name>    # Create new migration
npx knex migrate:latest         # Run pending migrations
npx knex migrate:rollback       # Rollback last batch
npx knex migrate:rollback --all # Rollback all
npx knex migrate:status         # Show migration status
npx knex migrate:list           # List migrations
```

#### Transaction Handling
- [ ] Migrations run in transactions by default
- [ ] `CREATE INDEX CONCURRENTLY` migrations disable transactions
- [ ] Long-running data migrations consider transaction scope

```javascript
// Disable transaction for concurrent operations
exports.up = function(knex) {
  return knex.raw('CREATE INDEX CONCURRENTLY ...');
};
exports.config = { transaction: false };
```

### 3.5 PostgreSQL-Specific Checks

#### Lock Safety
- [ ] `lock_timeout` configured for DDL operations
- [ ] No `ACCESS EXCLUSIVE` locks held for extended periods
- [ ] Index creation uses `CONCURRENTLY`
- [ ] Long-running queries monitored during migrations

```sql
-- Check for blocking queries before migration
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - pg_stat_activity.query_start > interval '5 minutes';

-- Check for locks during migration
SELECT relation::regclass, mode, granted
FROM pg_locks
WHERE NOT granted;
```

#### Data Types
- [ ] Use appropriate PostgreSQL types (UUID, JSONB, TIMESTAMPTZ)
- [ ] Consider using `SERIAL` vs `IDENTITY` (PG 10+)
- [ ] Enum types created via `CREATE TYPE` not CHECK constraints
- [ ] Arrays and JSONB indexed appropriately

```javascript
// ✅ Good - PostgreSQL-native types
exports.up = function(knex) {
  return knex.schema.createTable('events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.specificType('tags', 'text[]');
    table.jsonb('metadata');
    table.timestamp('event_date', { useTz: true });
  });
};
```

#### Extensions
- [ ] Required extensions enabled (`uuid-ossp`, `pgcrypto`, etc.)
- [ ] Extension availability verified before migration

```javascript
// Enable required extension
exports.up = async function(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  // Now can use gen_random_uuid()
};
```

---

---

## 22 - 22-api-versioning

### 3.1 Versioning Strategy Checklist

#### Strategy Selection
- [ ] **Versioning strategy chosen and documented** (URL path, header, query, or media type)
- [ ] **Consistent strategy across all APIs** in the organization
- [ ] **Version format defined** (v1, v2 or date-based like 2024-01-01)
- [ ] **Default version behavior documented** (what happens if no version specified?)

#### Implementation
- [ ] **All endpoints include version** in chosen location
- [ ] **Version routing implemented** correctly in API gateway/framework
- [ ] **Version visible in API documentation** (OpenAPI spec)
- [ ] **Version included in SDK/client libraries**

#### Version Management
- [ ] **Current version clearly identified** in documentation
- [ ] **Supported versions listed** with support timelines
- [ ] **Version discovery endpoint available** (`GET /api/versions`)
- [ ] **Version tracked in monitoring/analytics**

```javascript
// Example: Version discovery endpoint
GET /api/versions
{
  "versions": {
    "v1": { "status": "deprecated", "sunset": "2025-06-30" },
    "v2": { "status": "current" },
    "v3": { "status": "beta" }
  },
  "latest": "v2",
  "documentation": "https://docs.example.com/api"
}
```

---

### 3.2 Deprecation Process Checklist

#### Policy Definition
- [ ] **Deprecation policy documented** and published
- [ ] **Minimum deprecation notice period defined** (recommended: 12 months)
- [ ] **Sunset timeline defined** (time between deprecation and removal)
- [ ] **Communication channels identified** (email, headers, portal)

#### Implementation
- [ ] **RFC 9745 Deprecation header implemented** on deprecated endpoints
- [ ] **RFC 8594 Sunset header implemented** with specific date
- [ ] **Link header points to successor** version/documentation
- [ ] **Deprecation warnings included** in response body

```http
# Required headers for deprecated endpoints
Deprecation: @1735689599
Sunset: Wed, 31 Dec 2025 23:59:59 GMT
Link: </api/v2/users>; rel="successor-version"
Link: </docs/migration/v2>; rel="deprecation"; type="text/html"
```

#### Communication
- [ ] **Changelog updated** with deprecation notice
- [ ] **Email sent to affected developers** (multiple reminders)
- [ ] **Developer portal updated** with deprecation status
- [ ] **Migration guide created** with code examples
- [ ] **Sandbox environment available** for testing new version

#### Monitoring
- [ ] **Usage tracked for deprecated endpoints** to identify stragglers
- [ ] **Alerts configured** for high usage of deprecated endpoints near sunset
- [ ] **Individual client outreach** for major consumers on deprecated versions

---

### 3.3 Backwards Compatibility Checklist

#### Design Principles
- [ ] **New fields are optional** (never add required fields to existing endpoints)
- [ ] **Fields are never removed** without version bump
- [ ] **Field types are never changed** without version bump
- [ ] **Field semantics are never changed** (meaning stays consistent)
- [ ] **Default values provided** for new optional fields

#### Testing
- [ ] **Contract tests implemented** (e.g., Pact)
- [ ] **Backwards compatibility tests run in CI/CD**
- [ ] **API specification diffing** to detect breaking changes
- [ ] **Consumer-driven contracts** validated before deployment

```yaml
# CI/CD Pipeline Check
- name: Check API Compatibility
  run: |
    openapi-diff previous-spec.yaml current-spec.yaml
    pact-verifier --provider-version=$VERSION
```

#### Response Format Stability
- [ ] **Error format consistent** (recommend RFC 7807)
- [ ] **Pagination format consistent** across endpoints
- [ ] **Date/time format consistent** (ISO 8601)
- [ ] **Null handling documented** and consistent

---

### 3.4 Breaking Change Management Checklist

#### Identification
- [ ] **Breaking change definition documented** (what counts as breaking)
- [ ] **Change review process established** (who decides if change is breaking)
- [ ] **Automated detection tools configured** (spectral, openapi-diff)

#### When Breaking Change is Necessary
- [ ] **New major version created** (never break existing version)
- [ ] **Both versions deployed** simultaneously
- [ ] **Migration guide written** with before/after examples
- [ ] **SDK updated** with new version support
- [ ] **Deprecation timeline announced** for old version

#### Common Breaking Changes Checklist

| Change Type | Breaking? | Action Required |
|-------------|-----------|-----------------|
| Remove endpoint | ✅ Yes | New version required |
| Remove field | ✅ Yes | New version required |
| Add required parameter | ✅ Yes | New version required |
| Change field type | ✅ Yes | New version required |
| Rename field | ✅ Yes | New version required |
| Change error codes | ✅ Yes | New version required |
| Add optional field | ❌ No | Document in changelog |
| Add new endpoint | ❌ No | Document in changelog |
| Improve performance | ❌ No | Document in changelog |

---

### 3.5 API Lifecycle Checklist

#### Design Phase
- [ ] **API versioning strategy included** in initial design
- [ ] **OpenAPI specification created** before implementation
- [ ] **API design review conducted** by team/architect
- [ ] **Backwards compatibility strategy documented**

#### Development Phase
- [ ] **Version routing implemented** correctly
- [ ] **Deprecation middleware available** for future use
- [ ] **Logging includes version information**
- [ ] **Health checks are version-aware**

#### Deployment Phase
- [ ] **Version deployed to API gateway** correctly
- [ ] **Documentation published** to developer portal
- [ ] **Changelog updated** with new version info
- [ ] **Monitoring configured** per version

#### Maintenance Phase
- [ ] **Usage analytics tracked** per version
- [ ] **Security patches applied** to all active versions
- [ ] **Bug fixes applied** according to version support policy
- [ ] **Deprecation reviews conducted** quarterly

#### Retirement Phase
- [ ] **Deprecation announcement made** (12+ months in advance)
- [ ] **Migration support provided** to affected clients
- [ ] **Sunset date communicated** clearly
- [ ] **Post-sunset handling configured** (410 Gone with migration info)

---

### 3.6 Communication Checklist

#### Documentation
- [ ] **API versioning documented** in developer guide
- [ ] **Changelog maintained** and easily accessible
- [ ] **Migration guides available** for each version upgrade
- [ ] **Version lifecycle clearly displayed** (current, deprecated, sunset)

#### Notifications
- [ ] **Email list for API announcements** maintained
- [ ] **Multiple notification channels** used (email, portal, social)
- [ ] **Notification timeline established** (when to send reminders)

```
Notification Timeline:
- Day 0: Initial deprecation announcement
- Month 3: First reminder
- Month 6: Second reminder, sunset date confirmed
- Month 9: Final warning
- Month 11: Last call
- Month 12: Sunset
```

#### Developer Experience
- [ ] **Sandbox environment** for testing new versions
- [ ] **SDK/client libraries** support multiple versions
- [ ] **Error messages helpful** and include migration guidance
- [ ] **Support channels available** for migration assistance

---

### 3.7 Microservices Consistency Checklist

#### Organization-Wide Standards
- [ ] **Single versioning strategy** adopted across all services
- [ ] **Shared API guidelines document** maintained
- [ ] **Standard error format** (RFC 7807) used by all services
- [ ] **Consistent deprecation policy** across all teams

#### Implementation
- [ ] **Shared libraries/middleware** for versioning
- [ ] **API gateway handles version routing** centrally
- [ ] **Contract testing between services** implemented
- [ ] **Schema registry** used for data contracts (if applicable)

#### Governance
- [ ] **API review board** or design authority established
- [ ] **Automated compliance checking** in CI/CD
- [ ] **Cross-team coordination** for deprecation timelines
- [ ] **Centralized API catalog** with version information

---

---

## 23 - 23-webhooks-outbound

### 3.1 Webhook Sender Checklist

#### Security & Authentication

- [ ] **Payload signing implemented** using HMAC-SHA256
- [ ] **Unique secret per subscription** (not shared across customers)
- [ ] **Timestamp included in signature** to prevent replay attacks
- [ ] **HTTPS enforced** for all webhook URLs
- [ ] **Secret rotation supported** with zero-downtime capability
- [ ] **Secrets never logged** or exposed in error messages

```javascript
// Verify: Signature generation
const signature = crypto
  .createHmac('sha256', secret)
  .update(`${timestamp}.${rawBody}`)
  .digest('hex');
```

#### Delivery & Reliability

- [ ] **Asynchronous delivery** via message queue (not blocking main request)
- [ ] **Retry mechanism implemented** with exponential backoff
- [ ] **Jitter added to retries** to prevent thundering herd
- [ ] **Maximum retry limit defined** (e.g., 8 attempts over 24 hours)
- [ ] **Dead Letter Queue (DLQ)** for failed events after retry exhaustion
- [ ] **Unique event IDs** included in every payload
- [ ] **Idempotency keys** available for consumers
- [ ] **Event ordering** documented (typically not guaranteed)

```javascript
// Verify: Retry configuration
{
  maxAttempts: 8,
  backoff: 'exponential',
  baseDelay: 5000,
  maxDelay: 86400000,
  jitter: true
}
```

#### Timeout Configuration

- [ ] **Connection timeout set** (3-5 seconds recommended)
- [ ] **Response timeout set** (10-30 seconds recommended)
- [ ] **Total timeout limit** enforced
- [ ] **Timeout values documented** for consumers
- [ ] **Redirect following disabled** (SSRF prevention)

#### SSRF Prevention

- [ ] **URL validation at registration** (block private IPs, localhost)
- [ ] **DNS re-validation at send time** (prevent DNS rebinding)
- [ ] **HTTPS required** for all webhook URLs
- [ ] **Own domains blocked** from webhook URLs
- [ ] **Metadata endpoints blocked** (169.254.169.254)
- [ ] **Webhook workers network-isolated** from internal services
- [ ] **Egress proxy used** (recommended: Smokescreen, webhook-sentry)
- [ ] **Redirect following disabled** in HTTP client

```javascript
// Verify: SSRF blocks
const blockedRanges = [
  '10.0.0.0/8',
  '172.16.0.0/12', 
  '192.168.0.0/16',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '::1/128'
];
```

#### Logging & Monitoring

- [ ] **Delivery attempts logged** (timestamp, status, latency)
- [ ] **Success/failure metrics tracked** per endpoint
- [ ] **Sensitive data redacted** from logs
- [ ] **Alerts configured** for high failure rates
- [ ] **Dashboard available** for delivery health visibility
- [ ] **Delivery logs accessible** to customers

#### Payload Design

- [ ] **Minimal sensitive data** in payloads (use skinny payloads)
- [ ] **Event ID included** for deduplication
- [ ] **Timestamp included** for ordering context
- [ ] **Event type clearly specified** in payload
- [ ] **Schema versioning** implemented
- [ ] **No credentials or passwords** ever included

```json
// Verify: Payload structure
{
  "id": "evt_unique123",
  "type": "resource.action",
  "created_at": "2024-12-20T10:30:00Z",
  "data": { /* minimal, non-sensitive */ }
}
```

---

### 3.2 Webhook Registration & Management Checklist

- [ ] **CRUD API available** for webhook subscriptions
- [ ] **Event filtering supported** (subscribe to specific events only)
- [ ] **URL ownership verification** implemented
- [ ] **Test endpoint available** to send sample events
- [ ] **Delivery logs exposed** to customers
- [ ] **Manual replay capability** for failed events
- [ ] **Auto-disable on persistent failure** with notification
- [ ] **Webhook limits per customer** enforced
- [ ] **IP allowlist option** available for customers
- [ ] **Multiple environments supported** (dev, staging, prod)

---

### 3.3 Consumer-Side Requirements (Documentation)

Document these requirements for your webhook consumers:

- [ ] **Signature verification instructions** with code samples
- [ ] **Expected response times** (return 200 within X seconds)
- [ ] **Async processing recommendation** (queue then acknowledge)
- [ ] **Idempotency requirement** explained with examples
- [ ] **Retry schedule documented** (timing, max attempts)
- [ ] **Event types listed** with payload examples
- [ ] **Secret rotation process** documented
- [ ] **Test endpoint usage** instructions
- [ ] **Failure handling** best practices
- [ ] **Event ordering** caveats explained

---

### 3.4 Delivery Guarantee Verification

| Check | Expected | Verified |
|-------|----------|----------|
| Delivery semantics documented | At-least-once | [ ] |
| Events persisted before acknowledgment | Yes | [ ] |
| Unique event IDs provided | Yes | [ ] |
| Retry on 5xx responses | Yes | [ ] |
| Retry on timeouts | Yes | [ ] |
| No retry on 4xx (except 429) | Yes | [ ] |
| DLQ for exhausted retries | Yes | [ ] |
| Manual replay available | Yes | [ ] |

---

### 3.5 Quick Security Audit Commands

```bash
# Check if secrets are in logs
grep -r "whsec_" /var/log/app/ 

# Verify HTTPS enforcement
curl -I http://api.example.com/webhooks  # Should redirect or fail

# Test SSRF protection
# Try to register these URLs (should all fail)
curl -X POST /api/webhooks -d '{"url": "http://localhost/admin"}'
curl -X POST /api/webhooks -d '{"url": "http://169.254.169.254/"}'
curl -X POST /api/webhooks -d '{"url": "http://10.0.0.1/"}'

# Verify signature validation
# Send request without signature (should return 401)
curl -X POST https://test-endpoint.com/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

---

---

## 24 - 24-scheduled-jobs-cron

### 3.1 Job Definition Checklist

For each scheduled job in TicketToken, verify:

#### Job Configuration

- [ ] **Job has unique identifier** - Each job has a distinct name/ID for tracking
- [ ] **Cron expression is documented** - Human-readable comment explaining schedule
- [ ] **Timezone is explicitly set** - Uses UTC or has documented timezone
- [ ] **Schedule avoids DST transition hours** - Not scheduled during 1-3 AM local time
- [ ] **Job purpose is documented** - Clear description of what job does and why

#### Execution Context

- [ ] **Timeout is configured** - Maximum execution time is set
- [ ] **Memory limits are set** - Container/process memory limits defined
- [ ] **Retry policy is defined** - Number of retries and backoff strategy documented
- [ ] **Dependencies are documented** - External services/databases required

### 3.2 Locking Verification Checklist

For Redis-based distributed locking:

#### Lock Implementation

- [ ] **Lock acquired before job execution** - Job does not run without lock
- [ ] **Lock key is unique per job type** - Different jobs use different lock keys
- [ ] **Lock TTL exceeds maximum job duration** - With buffer for safety
- [ ] **Lock is released in finally block** - Ensures release on success or failure
- [ ] **Lock extension implemented for long jobs** - Prevents premature lock expiration

#### Failure Scenarios

- [ ] **Job handles lock acquisition failure** - Graceful skip if lock held
- [ ] **Lock release failure is logged** - Alert on orphaned locks
- [ ] **Redis connection failure handled** - Job behavior defined when Redis unavailable

#### Code Review Points

```javascript
// Verify this pattern exists:
const lock = await redlock.acquire([`job:${jobName}`], ttl);
try {
  // Job logic here
} finally {
  await lock.release();
}
```

### 3.3 Monitoring Requirements Checklist

#### Heartbeat Monitoring

- [ ] **Each job sends start signal** - Ping sent when job begins
- [ ] **Each job sends completion signal** - Ping sent when job ends successfully
- [ ] **Failure signals are sent** - Explicit failure notification on error
- [ ] **Grace period is configured** - Matches expected job duration
- [ ] **Monitoring service is external** - Not dependent on same infrastructure

#### Alerting Configuration

- [ ] **Alerts configured for missed schedules** - Detect jobs that never start
- [ ] **Alerts configured for failures** - Detect jobs that start but fail
- [ ] **Alerts configured for duration regression** - Detect unusually slow jobs
- [ ] **Alert routing is correct** - Right team receives alerts
- [ ] **Escalation policy exists** - Alerts escalate if not acknowledged

#### Dashboard Requirements

- [ ] **Job execution history visible** - Last N executions with status
- [ ] **Duration trends tracked** - Historical performance data
- [ ] **Failure rates monitored** - Success/failure ratio over time
- [ ] **Cross-job correlation available** - View all jobs in system

### 3.4 Idempotency Verification Checklist

For each job, verify idempotent design:

#### State Management

- [ ] **Unique execution ID per run** - Used for deduplication
- [ ] **Pre-execution state check** - Verify item not already processed
- [ ] **Atomic state transitions** - Use database transactions
- [ ] **Upserts instead of inserts** - Where applicable

#### TicketToken-Specific Checks

| Job Type | Idempotency Check |
|----------|-------------------|
| NFT Minting | Check if NFT already exists for ticket before minting |
| Royalty Payout | Verify payout not already sent for transaction ID |
| Email Notifications | Check notification log before sending |
| Stripe Sync | Use Stripe idempotency keys for API calls |
| Elasticsearch Indexing | Use document IDs for upsert operations |

#### Testing

- [ ] **Double-run test** - Job can run twice without side effects
- [ ] **Crash recovery test** - Job handles restart mid-execution
- [ ] **Concurrent execution test** - Verify locking prevents duplicates

### 3.5 Error Handling Checklist

#### Exception Management

- [ ] **All jobs wrapped in try/catch** - No unhandled exceptions
- [ ] **Errors are logged with context** - Include execution ID, job name, stack trace
- [ ] **Errors trigger alerts** - Automatic notification on failure
- [ ] **Partial progress is tracked** - Know how much completed before failure

#### Retry Configuration

- [ ] **Retry count is configured** - Maximum attempts defined
- [ ] **Exponential backoff implemented** - Increasing delays between retries
- [ ] **Retryable vs non-retryable errors distinguished** - Don't retry permanent failures
- [ ] **Dead letter queue exists** - Failed jobs captured for manual review

#### Graceful Shutdown

- [ ] **SIGTERM handled** - Jobs complete current work before shutdown
- [ ] **In-progress jobs tracked** - State preserved for recovery
- [ ] **Lock cleanup on shutdown** - Release locks when process terminates

### 3.6 Node.js Specific Checklist

#### Scheduler Library

- [ ] **Using production-grade library** - Bull, Agenda, or BullMQ recommended
- [ ] **Library version is current** - No known security vulnerabilities
- [ ] **Persistence configured** - Jobs survive restarts (if using Bull/Agenda)

#### Memory Management

- [ ] **Large datasets streamed** - Not loaded entirely into memory
- [ ] **Memory usage monitored** - Alerts on excessive consumption
- [ ] **Garbage collection not blocked** - Long-running loops yield periodically

#### Process Isolation

- [ ] **Jobs run in separate workers** - Don't block main event loop
- [ ] **Worker threads for CPU-intensive jobs** - Prevent scheduler blocking
- [ ] **Child process timeout** - Kill hung worker processes

### 3.7 Multi-Instance Deployment Checklist

For TicketToken's 23 microservices:

#### Coordination

- [ ] **Single execution guaranteed** - Only one instance runs each job
- [ ] **No reliance on sticky sessions** - Jobs work regardless of routing
- [ ] **Instance ID tracked in logs** - Know which instance executed job

#### Failover

- [ ] **Leader election has failover** - Another instance takes over on failure
- [ ] **Lock timeout enables recovery** - Crashed instance doesn't block forever
- [ ] **Health checks detect stuck instances** - Kubernetes/orchestrator aware

#### Scaling

- [ ] **Job execution scales independently** - Can add workers without adding schedulers
- [ ] **Resource contention prevented** - Jobs don't compete for same resources
- [ ] **Database connection pooling configured** - Prevent pool exhaustion

---

## Quick Reference Card

### Critical Items for TicketToken

| Priority | Item | Risk if Missing |
|----------|------|-----------------|
| 🔴 P0 | Distributed locking | Duplicate NFT mints, double payments |
| 🔴 P0 | Idempotent payment jobs | Customer overcharges, compliance issues |
| 🟡 P1 | Heartbeat monitoring | Missed payouts undetected |
| 🟡 P1 | Error alerting | Silent failures in royalty distribution |
| 🟢 P2 | Structured logging | Difficult debugging and audit trail |
| 🟢 P2 | UTC timezone usage | Inconsistent execution times |

### Recommended Tools for Stack

| Purpose | Tool | Integration |
|---------|------|-------------|
| Job Queue | Bull or BullMQ | Redis (existing) |
| Distributed Lock | node-redlock | Redis (existing) |
| Monitoring | Healthchecks.io or Cronitor | HTTP webhooks |
| Logging | Pino or Winston | Elasticsearch (existing) |

---

---

## 25 - 25-compliance-legal

### 3.1 GDPR Requirements Applicability

**Determine if GDPR Applies:**

- [ ] Do you process personal data of EU/EEA residents?
- [ ] Do you offer goods/services to EU/EEA residents (even if free)?
- [ ] Do you monitor behavior of EU/EEA residents?
- [ ] Do you have an establishment in the EU/EEA?

*If YES to any above, GDPR applies regardless of your location.*

**Determine Your Role:**

- [ ] **Data Controller** — You determine purposes and means of processing
- [ ] **Data Processor** — You process on behalf of a controller
- [ ] **Both** — Common for SaaS (controller for your users, processor for customer data)

**Data Protection Officer Requirement:**

- [ ] Do you systematically monitor data subjects on a large scale?
- [ ] Do you process special categories of data (health, biometric, etc.) at scale?
- [ ] Are you a public authority?

*If YES to any above, DPO appointment is mandatory.*

---

### 3.2 Data Retention Policy Checklist

**Policy Documentation:**

- [ ] Documented retention periods for ALL personal data categories
- [ ] Legal basis justifying each retention period
- [ ] Regular review schedule (at least annual)
- [ ] Clear ownership and responsibility assignment
- [ ] Exception procedures (legal holds, disputes)
- [ ] Deletion/anonymization procedures documented

**Technical Implementation:**

- [ ] Automated deletion for expired data
- [ ] Retention rules enforced in all systems (including backups)
- [ ] Data inventory maps all personal data locations
- [ ] Anonymization procedures where deletion not feasible
- [ ] Audit trail of deletions maintained
- [ ] Regular testing of deletion procedures

**Recommended Retention Schedule:**

| Data Type | Max Retention | Notes |
|-----------|---------------|-------|
| Account data | Active + 30 days | Delete on account closure |
| Financial records | 7 years | Tax/accounting requirements |
| Support tickets | 3 years | Dispute resolution |
| Security logs | 12 months | Security monitoring |
| Marketing consent | Withdrawal + 1 year | Proof of consent |
| Analytics | 90 days or anonymize | Data minimization |
| Session data | 24 hours | Unless explicit consent |
| Backup data | 90 days | Rotate or exclude deleted records |

---

### 3.3 User Rights Support Checklist

**Process & Response:**

- [ ] Designated process for receiving rights requests
- [ ] Identity verification procedures
- [ ] Response within 30 days (extendable to 90 for complex requests)
- [ ] Free of charge (unless manifestly unfounded/excessive)
- [ ] Documented refusal reasons when applicable
- [ ] Communication in user's preferred format

**Right of Access (Article 15):**

- [ ] Ability to export all user data
- [ ] Includes processing purposes, categories, recipients
- [ ] Machine-readable format available
- [ ] Copy of data provided within timeline

**Right to Rectification (Article 16):**

- [ ] Users can update their personal data
- [ ] Corrections propagated to third parties
- [ ] Documentation of corrections maintained

**Right to Erasure (Article 17):**

- [ ] Complete deletion workflow implemented
- [ ] All data locations mapped and included
- [ ] Third-party notification process
- [ ] Backup handling procedures
- [ ] Deletion confirmation provided
- [ ] Audit trail maintained (without deleted data)

**Right to Data Portability (Article 20):**

- [ ] Export in machine-readable format (JSON, CSV)
- [ ] Commonly used, structured format
- [ ] Direct transfer to another controller (where feasible)

**Right to Object (Article 21):**

- [ ] Opt-out from marketing processing
- [ ] Opt-out from profiling
- [ ] Objection handling within 30 days

**Right to Restrict Processing (Article 18):**

- [ ] Ability to pause processing
- [ ] Data retained but not processed
- [ ] User notification when restriction lifted

---

### 3.4 Consent Management Checklist

**Consent Collection:**

- [ ] Consent is freely given (no forced acceptance)
- [ ] Consent is specific (separate for different purposes)
- [ ] Consent is informed (clear explanation provided)
- [ ] Consent is unambiguous (affirmative action required)
- [ ] No pre-checked boxes
- [ ] Equal prominence for accept/reject options

**Consent Records:**

- [ ] Timestamp of consent recorded
- [ ] Version of privacy policy/terms at consent time
- [ ] What specifically was consented to
- [ ] Method of consent (checkbox, button, etc.)
- [ ] IP address or session identifier
- [ ] Consent records retained for compliance period

**Consent Withdrawal:**

- [ ] Easy mechanism to withdraw consent
- [ ] Withdrawal is as easy as giving consent
- [ ] Processing stops promptly after withdrawal
- [ ] Withdrawal does not affect prior lawful processing
- [ ] User informed of withdrawal consequences

**Cookie Consent (if applicable):**

- [ ] Consent banner displayed before non-essential cookies
- [ ] Granular category controls available
- [ ] "Reject All" option with equal prominence
- [ ] No tracking until consent received
- [ ] Consent persisted appropriately (max 12 months)
- [ ] Easy preference modification

---

### 3.5 Data Processing Agreement Checklist

**For Your Vendors (You as Controller):**

- [ ] DPA in place with every processor
- [ ] All Article 28(3) elements included
- [ ] Sub-processor list maintained and current
- [ ] Notification process for sub-processor changes
- [ ] Security measures documented
- [ ] Audit rights included
- [ ] Breach notification within 72 hours
- [ ] Data handling at contract termination defined

**For Your Customers (You as Processor):**

- [ ] Standard DPA template available
- [ ] Processing only on documented instructions
- [ ] Confidentiality obligations on personnel
- [ ] Security measures documented
- [ ] Sub-processor authorization and list
- [ ] Support for data subject rights
- [ ] Breach notification procedures
- [ ] Deletion/return at contract end
- [ ] Audit support provisions

**Sub-Processor Management:**

- [ ] Current list of all sub-processors
- [ ] Locations of all sub-processors documented
- [ ] DPAs with all sub-processors
- [ ] Change notification process defined
- [ ] Objection procedure established

---

### 3.6 International Transfer Checklist

**Transfer Mapping:**

- [ ] All international data flows documented
- [ ] Recipient countries identified
- [ ] Transfer mechanisms for each flow identified
- [ ] Sub-processors and their locations documented

**Transfer Mechanisms:**

- [ ] Adequacy decision verification (check current list)
- [ ] Standard Contractual Clauses (SCCs) executed where needed
- [ ] EU-US Data Privacy Framework certification verified for US vendors
- [ ] Transfer Impact Assessments conducted
- [ ] Supplementary measures implemented if required
- [ ] Binding Corporate Rules (for intra-group transfers)

**Documentation:**

- [ ] Transfer records maintained
- [ ] TIA documentation available
- [ ] SCC annexes completed
- [ ] Regular review of transfer adequacy

---

### 3.7 Security & Technical Measures Checklist

**Data Protection:**

- [ ] Encryption at rest (AES-256 or equivalent)
- [ ] Encryption in transit (TLS 1.2+)
- [ ] Pseudonymization where appropriate
- [ ] Data minimization in collection and processing

**Access Controls:**

- [ ] Role-based access controls implemented
- [ ] Principle of least privilege enforced
- [ ] Multi-factor authentication for sensitive access
- [ ] Regular access reviews conducted
- [ ] Immediate access revocation on departure

**Audit Logging:**

- [ ] All access to personal data logged
- [ ] Modifications tracked with before/after
- [ ] Logs include who, what, when, why
- [ ] Log integrity protected
- [ ] Centralized log management
- [ ] Real-time security monitoring
- [ ] Log retention defined and enforced

**Incident Response:**

- [ ] Breach detection capabilities
- [ ] Incident response plan documented
- [ ] 72-hour notification procedure
- [ ] Communication templates ready
- [ ] Regular breach response testing

---

### 3.8 Privacy by Design Checklist

**Design Principles:**

- [ ] Privacy considered in all new features
- [ ] Data Protection Impact Assessment (DPIA) process defined
- [ ] DPIA conducted for high-risk processing
- [ ] Privacy settings default to most protective
- [ ] Data minimization in feature design
- [ ] Third-party integrations vetted for privacy

**Development Practices:**

- [ ] Security in development lifecycle
- [ ] Privacy requirements in specifications
- [ ] Regular security testing
- [ ] Code review for privacy issues
- [ ] Dependency scanning for vulnerabilities

---

### 3.9 Documentation Checklist

**Core Documents:**

- [ ] Privacy Policy (current, complete, accessible)
- [ ] Cookie Policy (if using cookies)
- [ ] Terms of Service (consistent with privacy policy)
- [ ] Data Processing Agreement template
- [ ] Records of Processing Activities (ROPA)
- [ ] Data Retention Policy

**Operational Documents:**

- [ ] Data Subject Request procedures
- [ ] Breach notification procedures
- [ ] DPIA templates and completed assessments
- [ ] Transfer Impact Assessments
- [ ] Consent records
- [ ] Vendor/sub-processor list

**Training & Awareness:**

- [ ] Staff GDPR training records
- [ ] Regular training updates
- [ ] Role-specific training for data handlers

---

---

## 26 - 26-blockchain-operations

### 3.1 Transaction Handling

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| TX-01 | All mint operations wait for 'confirmed' before updating DB | CRITICAL | Code review |
| TX-02 | Payment operations wait for 'finalized' before completing | CRITICAL | Code review |
| TX-03 | Transaction retry logic implemented with exponential backoff | HIGH | Code review |
| TX-04 | Fresh blockhash obtained on each retry attempt | HIGH | Code review |
| TX-05 | Blockhash expiration checked before retry | MEDIUM | Code review |
| TX-06 | Transaction timeout configured (60-90 seconds) | MEDIUM | Code review |
| TX-07 | Failed transactions logged with signature and error | HIGH | Log review |
| TX-08 | Priority fees dynamically calculated based on network | HIGH | Code review |
| TX-09 | Compute units estimated via simulation | MEDIUM | Code review |
| TX-10 | Idempotency keys used for retryable operations | HIGH | Code review |

**Verification Commands:**
```bash
# Check for missing confirmation waits
grep -rn "sendTransaction" --include="*.ts" | grep -v "confirmTransaction"

# Find hardcoded priority fees
grep -rn "setComputeUnitPrice" --include="*.ts" | grep -E "[0-9]{4,}"

# Check for proper retry logic
grep -rn "maxRetries\|retryCount\|exponentialBackoff" --include="*.ts"
```

### 3.2 RPC Configuration

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| RPC-01 | Multiple RPC endpoints configured (minimum 3) | CRITICAL | Config review |
| RPC-02 | Automatic failover implemented | HIGH | Code review |
| RPC-03 | No public RPC endpoints in production | CRITICAL | Config review |
| RPC-04 | RPC health checks running | HIGH | Monitoring review |
| RPC-05 | RPC credentials stored in secrets manager | HIGH | Config review |
| RPC-06 | Rate limiting handled gracefully | MEDIUM | Code review |
| RPC-07 | DAS API endpoint configured for cNFT operations | HIGH | Config review |
| RPC-08 | WebSocket connections have reconnection logic | MEDIUM | Code review |

**Verification Commands:**
```bash
# Check for public RPC endpoints
grep -rn "api.mainnet-beta.solana.com\|api.devnet.solana.com" --include="*.ts" --include="*.json"

# Verify multiple endpoints configured
grep -rn "RPC_URL\|rpcEndpoint" --include="*.ts" --include="*.env*"
```

### 3.3 Wallet Security

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| WAL-01 | Private keys NOT in source code | CRITICAL | Code scan |
| WAL-02 | Private keys NOT in plain environment variables | CRITICAL | Config review |
| WAL-03 | Keys loaded from secrets manager or HSM | HIGH | Code review |
| WAL-04 | Separate wallets for different operations | HIGH | Architecture review |
| WAL-05 | Hot wallet spending limits implemented | HIGH | Code review |
| WAL-06 | Cold storage used for treasury (97%+) | HIGH | Wallet audit |
| WAL-07 | Multisig for high-value operations | HIGH | Architecture review |
| WAL-08 | Key rotation capability exists | MEDIUM | Process review |
| WAL-09 | Wallet addresses whitelisted where applicable | MEDIUM | Code review |
| WAL-10 | Transaction signing is local (keys never sent over network) | CRITICAL | Code review |

**Verification Commands:**
```bash
# Scan for hardcoded keys (base58 patterns)
grep -rn "[1-9A-HJ-NP-Za-km-z]\{87,88\}" --include="*.ts" --include="*.js"

# Check for Keypair.fromSecretKey with inline data
grep -rn "fromSecretKey.*\[" --include="*.ts"

# Verify secrets manager usage
grep -rn "SecretsManager\|Vault\|KMS" --include="*.ts"
```

### 3.4 Compressed NFT (cNFT) Operations

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| CNFT-01 | DAS API used for fetching cNFT data | HIGH | Code review |
| CNFT-02 | Merkle proofs verified before transfers | CRITICAL | Code review |
| CNFT-03 | Asset ownership verified before operations | CRITICAL | Code review |
| CNFT-04 | Collection authority properly set | HIGH | On-chain verification |
| CNFT-05 | Merkle tree sized appropriately for collection | MEDIUM | On-chain verification |
| CNFT-06 | Canopy depth sufficient for operations | MEDIUM | On-chain verification |
| CNFT-07 | Tree creator key secured | CRITICAL | Key audit |
| CNFT-08 | Metadata URI points to permanent storage (Arweave) | HIGH | Metadata review |
| CNFT-09 | Batch minting limited to 15 simultaneous transactions | MEDIUM | Code review |
| CNFT-10 | Finalized commitment used for mint confirmation before asset ID retrieval | HIGH | Code review |

**Verification Commands:**
```bash
# Check for DAS API usage
grep -rn "getAsset\|getAssetsByOwner\|getAssetProof" --include="*.ts"

# Verify merkle proof verification
grep -rn "getAssetWithProof\|proof.*verify" --include="*.ts"

# Check metadata storage
grep -rn "arweave.net\|ipfs.io\|metadata.*uri" --include="*.ts"
```

### 3.5 State Reconciliation

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| REC-01 | Periodic reconciliation job exists | HIGH | Code review |
| REC-02 | Stale transaction detection (>2 min pending) | HIGH | Code review |
| REC-03 | Transaction status re-checked on reconciliation | HIGH | Code review |
| REC-04 | Failed transactions properly marked and handled | HIGH | Code review |
| REC-05 | Asset ownership verification capability | HIGH | Code review |
| REC-06 | Full audit trail of blockchain operations | MEDIUM | Log review |
| REC-07 | Alerting on reconciliation failures | MEDIUM | Monitoring review |
| REC-08 | Manual reconciliation tools available | MEDIUM | Tool review |

**Verification Commands:**
```bash
# Check for reconciliation jobs
grep -rn "reconcil\|sync.*blockchain\|verify.*state" --include="*.ts"

# Look for signature status checks
grep -rn "getSignatureStatus\|searchTransactionHistory" --include="*.ts"
```

### 3.6 Metaplex Integration

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| MPX-01 | Using official @metaplex-foundation packages | HIGH | Package review |
| MPX-02 | Bubblegum program ID correctly configured | CRITICAL | Code review |
| MPX-03 | Token Metadata program ID correctly configured | CRITICAL | Code review |
| MPX-04 | Collection verified on minted NFTs | HIGH | On-chain verification |
| MPX-05 | Creator verification signing implemented | MEDIUM | Code review |
| MPX-06 | Royalty basis points correctly set | MEDIUM | Metadata review |
| MPX-07 | Update authority properly secured | HIGH | Key audit |
| MPX-08 | Metadata follows Metaplex JSON standard | HIGH | Schema validation |

**Verification Commands:**
```bash
# Verify package versions
grep -rn "@metaplex-foundation" package.json

# Check program IDs
grep -rn "BUBBLEGUM_PROGRAM_ID\|TOKEN_METADATA_PROGRAM" --include="*.ts"

# Validate metadata schema
# Use JSON schema validator against metadata files
```

---

---

## 27 - 27-ticket-lifecycle

### 3.1 Ticket States Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| ST-01 | All ticket states are explicitly defined in code | CRITICAL | Code review |
| ST-02 | States match between database schema and code | CRITICAL | Schema comparison |
| ST-03 | States are synchronized between database and blockchain | CRITICAL | Integration test |
| ST-04 | Terminal states (USED, BURNED, REVOKED) cannot transition | CRITICAL | Unit test |
| ST-05 | Initial state (MINTED) is set atomically with creation | HIGH | Code review |
| ST-06 | State enum is exhaustive (no undefined/null states possible) | HIGH | Type checking |
| ST-07 | Expired state is automatically applied after event end | MEDIUM | Scheduled job review |
| ST-08 | State is stored redundantly (DB + blockchain) for critical states | MEDIUM | Architecture review |

**Verification Commands:**
```bash
# Find all state definitions
grep -rn "enum.*State\|status.*=\|TicketState" --include="*.ts" --include="*.sol"

# Check for undefined state handling
grep -rn "undefined\|null" --include="*.ts" | grep -i "state\|status"

# Find state update functions
grep -rn "setState\|updateStatus\|status\s*=" --include="*.ts"
```

---

### 3.2 State Transitions Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| TR-01 | All valid transitions are explicitly defined | CRITICAL | Code review |
| TR-02 | Invalid transitions throw errors/revert | CRITICAL | Unit test |
| TR-03 | Transition validation occurs before state update | CRITICAL | Code review |
| TR-04 | Transitions are atomic (no partial updates) | CRITICAL | Transaction test |
| TR-05 | Terminal states have no outgoing transitions | CRITICAL | Unit test |
| TR-06 | Transition history is logged | HIGH | Audit log review |
| TR-07 | Transitions require appropriate authorization | HIGH | Permission test |
| TR-08 | Transition timestamps are recorded | MEDIUM | Schema review |
| TR-09 | Transition reasons are captured | MEDIUM | Schema review |
| TR-10 | Concurrent transitions are handled (race conditions) | HIGH | Concurrency test |

**Verification Commands:**
```bash
# Find transition validation
grep -rn "canTransition\|isValidTransition\|VALID_TRANSITIONS" --include="*.ts"

# Check for authorization before transition
grep -rn "require\|assert\|if.*owner\|if.*admin" --include="*.sol" --include="*.ts" -B 5 | grep -i "transition\|state"

# Find atomic transaction patterns
grep -rn "beginTransaction\|startTransaction\|@Transactional" --include="*.ts"
```

---

### 3.3 Validation Rules Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| VL-01 | Ticket authenticity verified against blockchain | CRITICAL | Integration test |
| VL-02 | Ticket ownership verified before operations | CRITICAL | Unit test |
| VL-03 | Ticket status checked before check-in | CRITICAL | Unit test |
| VL-04 | Duplicate scan detection implemented | CRITICAL | Integration test |
| VL-05 | Time window validation enforced | HIGH | Unit test |
| VL-06 | Event ID matches ticket's event | HIGH | Unit test |
| VL-07 | Transfer count validated against limit | HIGH | Unit test |
| VL-08 | Resale price validated against maximum | MEDIUM | Unit test |
| VL-09 | Validation errors are descriptive | MEDIUM | Code review |
| VL-10 | Validation is performed atomically | HIGH | Transaction test |

**Verification Commands:**
```bash
# Find validation functions
grep -rn "validate\|isValid\|verify" --include="*.ts" | grep -i "ticket"

# Check for duplicate prevention
grep -rn "duplicate\|already.*scanned\|previous.*scan" --include="*.ts"

# Find time validation
grep -rn "Date.now\|timestamp\|validFrom\|validUntil\|expired" --include="*.ts" | grep -i "ticket\|check"
```

---

### 3.4 Transfer Restrictions Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| XF-01 | Transfer limit is enforced | HIGH | Unit test |
| XF-02 | Non-transferable tickets cannot transfer | CRITICAL | Unit test |
| XF-03 | Transfer freeze period is enforced | HIGH | Integration test |
| XF-04 | Original owner's access revoked after transfer | CRITICAL | Integration test |
| XF-05 | New owner receives valid credentials | CRITICAL | Integration test |
| XF-06 | Transfer price limits enforced (if applicable) | MEDIUM | Unit test |
| XF-07 | Royalties distributed on resale | MEDIUM | Unit test |
| XF-08 | Transfer history recorded on-chain | HIGH | Blockchain verification |
| XF-09 | KYC requirements enforced (if applicable) | MEDIUM | Integration test |
| XF-10 | Marketplace restrictions enforced | MEDIUM | Integration test |

**Verification Commands:**
```bash
# Find transfer functions
grep -rn "transfer\|sendTo\|changeOwner" --include="*.ts" --include="*.sol"

# Check for transfer restrictions
grep -rn "canTransfer\|transfersRemaining\|isTransferable" --include="*.ts"

# Find royalty logic
grep -rn "royalty\|percentage\|resale" --include="*.sol" --include="*.ts"
```

---

### 3.5 Revocation Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| RV-01 | Revocation reasons are enumerated and required | HIGH | Schema review |
| RV-02 | Revoked tickets cannot be used | CRITICAL | Integration test |
| RV-03 | Revocation updates both database and blockchain | CRITICAL | Integration test |
| RV-04 | Ticket holder is notified of revocation | MEDIUM | Notification test |
| RV-05 | Refund logic triggered for applicable revocations | HIGH | Integration test |
| RV-06 | Admin authorization required for revocation | HIGH | Permission test |
| RV-07 | Revocation is logged with full context | HIGH | Audit log review |
| RV-08 | Revoked tickets cannot be transferred | CRITICAL | Unit test |
| RV-09 | Bulk revocation is supported (event cancellation) | MEDIUM | Integration test |
| RV-10 | Revocation can only be performed by authorized roles | CRITICAL | Permission test |

**Verification Commands:**
```bash
# Find revocation logic
grep -rn "revoke\|cancel\|invalidate" --include="*.ts" | grep -i "ticket"

# Check for authorization
grep -rn "onlyAdmin\|onlyOrganizer\|require.*role" --include="*.sol" --include="*.ts" -B 3 | grep -i "revoke"

# Find notification triggers
grep -rn "notify\|email\|alert" --include="*.ts" | grep -i "revoke\|cancel"
```

---

### 3.6 State Consistency Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| SC-01 | Database updates wait for blockchain finalization | CRITICAL | Code review |
| SC-02 | Reconciliation job runs periodically | HIGH | Job schedule review |
| SC-03 | Discrepancies are logged and alerted | HIGH | Alert configuration |
| SC-04 | Resolution strategy defined for each discrepancy type | MEDIUM | Documentation review |
| SC-05 | Idempotent operations prevent duplicate updates | HIGH | Unit test |
| SC-06 | Offline scanning devices sync correctly | HIGH | Integration test |
| SC-07 | Transaction ID used for deduplication | HIGH | Code review |
| SC-08 | Failed transactions are retried appropriately | HIGH | Error handling review |
| SC-09 | Eventual consistency is acceptable only for non-critical states | MEDIUM | Architecture review |
| SC-10 | Manual reconciliation tools available | MEDIUM | Tool review |

**Verification Commands:**
```bash
# Find finalization waits
grep -rn "finalized\|confirmed\|waitFor" --include="*.ts" | grep -i "transaction\|commit"

# Check for reconciliation
grep -rn "reconcile\|sync\|consistency" --include="*.ts"

# Find idempotency patterns
grep -rn "idempotent\|transactionId\|dedupe" --include="*.ts"
```

---

### 3.7 Audit Trail Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| AU-01 | All state changes are logged | CRITICAL | Code review |
| AU-02 | Logs include who, what, when, where | CRITICAL | Log schema review |
| AU-03 | Logs are immutable (append-only) | CRITICAL | Storage configuration |
| AU-04 | Logs are retained per compliance requirements | HIGH | Retention policy review |
| AU-05 | Logs are searchable and filterable | MEDIUM | Query capability test |
| AU-06 | Critical actions logged to blockchain | HIGH | Code review |
| AU-07 | Log access is restricted and audited | HIGH | Access control review |
| AU-08 | Log integrity is verifiable (hashing/signing) | MEDIUM | Implementation review |
| AU-09 | Log entries include transaction correlation ID | MEDIUM | Log schema review |
| AU-10 | Deletion is prohibited or requires approval workflow | HIGH | Policy review |

**Verification Commands:**
```bash
# Find logging statements
grep -rn "auditLog\|logger\|logEvent" --include="*.ts" | grep -i "state\|status\|transition"

# Check for immutable storage patterns
grep -rn "append\|readonly\|immutable" --include="*.ts" | grep -i "log\|audit"

# Find log retention configuration
grep -rn "retention\|ttl\|expire" --include="*.ts" --include="*.json" --include="*.yaml"
```

---

### 3.8 Security Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| SE-01 | State changes require cryptographic signatures | CRITICAL | Code review |
| SE-02 | Admin functions are protected by multi-sig or RBAC | CRITICAL | Permission test |
| SE-03 | Rate limiting prevents brute force attacks | HIGH | Load test |
| SE-04 | Input validation prevents injection attacks | HIGH | Security scan |
| SE-05 | QR codes/tokens are time-limited | HIGH | Implementation review |
| SE-06 | Replay attacks prevented (nonce/timestamp) | HIGH | Security review |
| SE-07 | Cross-site request forgery prevented | HIGH | Security scan |
| SE-08 | Sensitive operations logged for forensics | HIGH | Audit log review |
| SE-09 | Failed validation attempts are rate-limited | MEDIUM | Implementation review |
| SE-10 | Emergency pause/freeze capability exists | HIGH | Feature review |

**Verification Commands:**
```bash
# Find signature verification
grep -rn "verify.*signature\|ecrecover\|signedBy" --include="*.sol" --include="*.ts"

# Check for rate limiting
grep -rn "rateLimit\|throttle\|cooldown" --include="*.ts"

# Find admin protections
grep -rn "onlyOwner\|onlyAdmin\|requireRole" --include="*.sol" --include="*.ts"
```

---

---

## 28 - 28-event-state-management

### 3.1 Event States Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| ES-01 | All event states are explicitly defined in code/schema | CRITICAL | Code review |
| ES-02 | DRAFT state exists as initial state | HIGH | Schema inspection |
| ES-03 | CANCELLED state exists as terminal state | CRITICAL | Schema inspection |
| ES-04 | ENDED state exists as terminal state | CRITICAL | Schema inspection |
| ES-05 | POSTPONED state is separate from CANCELLED | HIGH | Schema inspection |
| ES-06 | RESCHEDULED state tracks new date separately | HIGH | Schema inspection |
| ES-07 | Sales status is tracked separately from event status | HIGH | Schema inspection |
| ES-08 | State enum prevents invalid/undefined states | HIGH | Type checking |
| ES-09 | State is stored with timestamp of last change | MEDIUM | Schema inspection |
| ES-10 | State history/audit trail is maintained | HIGH | Database review |

**Verification Commands:**
```bash
# Find all event state definitions
grep -rn "EventStatus\|EventState\|event.*status" --include="*.ts" --include="*.sol"

# Check for enum completeness
grep -rn "enum.*Event" --include="*.ts" -A 20

# Find state update functions
grep -rn "updateStatus\|setState\|transition" --include="*.ts" | grep -i event
```

---

### 3.2 State Transitions Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| TR-01 | All valid transitions are explicitly defined | CRITICAL | Code review |
| TR-02 | Invalid transitions throw errors/are rejected | CRITICAL | Unit test |
| TR-03 | DRAFT can only transition to SCHEDULED or deleted | HIGH | Unit test |
| TR-04 | ENDED cannot transition to any other state | CRITICAL | Unit test |
| TR-05 | CANCELLED cannot transition to any other state | CRITICAL | Unit test |
| TR-06 | ON_SALE → STARTED requires SALES_ENDED intermediate | HIGH | Unit test |
| TR-07 | Automatic transitions occur at correct times | HIGH | Integration test |
| TR-08 | Manual transitions require authorization | HIGH | Permission test |
| TR-09 | Transition timestamps are recorded | MEDIUM | Audit log review |
| TR-10 | Transition reasons are captured for manual actions | MEDIUM | Schema review |

**Verification Commands:**
```bash
# Find transition validation logic
grep -rn "canTransition\|isValidTransition\|VALID_TRANSITIONS" --include="*.ts"

# Check for state machine implementation
grep -rn "stateMachine\|workflow\|transition" --include="*.ts" | grep -i event

# Find automatic transition schedulers
grep -rn "cron\|schedule\|interval" --include="*.ts" | grep -i "event\|state"
```

---

### 3.3 Operations per State Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| OP-01 | Ticket sales blocked in DRAFT state | CRITICAL | Integration test |
| OP-02 | Ticket sales blocked in CANCELLED state | CRITICAL | Integration test |
| OP-03 | Ticket sales blocked in ENDED state | CRITICAL | Integration test |
| OP-04 | Ticket sales require ON_SALE state | CRITICAL | Unit test |
| OP-05 | Event editing restricted after sales start | HIGH | Integration test |
| OP-06 | Protected fields require confirmation to modify | HIGH | UI/API test |
| OP-07 | Refunds blocked for ENDED events | HIGH | Integration test |
| OP-08 | Resale blocked for STARTED events | HIGH | Integration test |
| OP-09 | Check-in only allowed for STARTED/SALES_ENDED events | HIGH | Integration test |
| OP-10 | Deletion blocked after ticket sales | CRITICAL | Integration test |

**Verification Commands:**
```bash
# Find ticket sale validation
grep -rn "createOrder\|sellTicket\|purchaseTicket" --include="*.ts" -A 20 | grep -i "status\|state"

# Check for operation guards
grep -rn "canEdit\|canSell\|canRefund\|canResale" --include="*.ts"

# Find protected field definitions
grep -rn "protected\|restricted\|locked" --include="*.ts" | grep -i "field\|property"
```

---

### 3.4 Event Modification Controls

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| MD-01 | Date/time changes after sales trigger notification | HIGH | Integration test |
| MD-02 | Venue changes after sales trigger notification | HIGH | Integration test |
| MD-03 | Major modifications open refund window | HIGH | Integration test |
| MD-04 | Modification audit trail exists | HIGH | Database review |
| MD-05 | Modification requires authorization | HIGH | Permission test |
| MD-06 | Protected fields identified and enforced | HIGH | Code review |
| MD-07 | Ticket holders notified of changes | HIGH | Notification test |
| MD-08 | Original event data preserved for reference | MEDIUM | Schema review |
| MD-09 | Modification severity auto-calculated | MEDIUM | Unit test |
| MD-10 | Sales paused during major modifications | HIGH | Integration test |

**Verification Commands:**
```bash
# Find modification tracking
grep -rn "modif\|change.*track\|audit" --include="*.ts" | grep -i event

# Check for notification triggers
grep -rn "notify\|email\|alert" --include="*.ts" | grep -i "change\|modif\|update"

# Find field protection logic
grep -rn "protected.*field\|restrict.*edit\|lock.*change" --include="*.ts"
```

---

### 3.5 Cancellation Workflow Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| CN-01 | Cancellation stops ticket sales immediately | CRITICAL | Integration test |
| CN-02 | Cancellation triggers automatic refunds | CRITICAL | Integration test |
| CN-03 | All ticket holders notified of cancellation | HIGH | Notification test |
| CN-04 | Cancellation reason is required and stored | HIGH | Schema review |
| CN-05 | Cancellation timestamp recorded | HIGH | Schema review |
| CN-06 | Cancelled event page shows cancellation notice | HIGH | UI test |
| CN-07 | Tickets invalidated upon cancellation | CRITICAL | Integration test |
| CN-08 | Resale listings cancelled | HIGH | Integration test |
| CN-09 | Cancellation report generated | MEDIUM | Feature test |
| CN-10 | Refund timeline communicated to attendees | HIGH | Communication test |

**Verification Commands:**
```bash
# Find cancellation workflow
grep -rn "cancel.*event\|event.*cancel" --include="*.ts" -A 30

# Check for refund triggers
grep -rn "refund\|reimburse" --include="*.ts" | grep -i cancel

# Find notification logic
grep -rn "notif\|email\|commun" --include="*.ts" | grep -i cancel
```

---

### 3.6 Timing Enforcement Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| TM-01 | Sales start time enforced automatically | HIGH | Integration test |
| TM-02 | Sales end time enforced automatically | HIGH | Integration test |
| TM-03 | Event start triggers state change | HIGH | Integration test |
| TM-04 | Event end triggers state change | HIGH | Integration test |
| TM-05 | Timezone handling is consistent | HIGH | Unit test |
| TM-06 | Server time synchronized (NTP) | MEDIUM | Infrastructure check |
| TM-07 | Scheduled jobs run reliably | HIGH | Job monitoring |
| TM-08 | Manual override requires authorization | HIGH | Permission test |
| TM-09 | Time-based validation on all ticket operations | CRITICAL | Code review |
| TM-10 | Resale cutoff time enforced | HIGH | Integration test |

**Verification Commands:**
```bash
# Find time validation
grep -rn "Date\|time\|now\(\)" --include="*.ts" | grep -i "event\|ticket\|sale"

# Check for scheduled jobs
grep -rn "cron\|schedule\|setInterval\|setTimeout" --include="*.ts"

# Find timezone handling
grep -rn "timezone\|tz\|UTC\|local" --include="*.ts"
```

---

### 3.7 Resale Control Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| RS-01 | Resale disabled for STARTED events | CRITICAL | Integration test |
| RS-02 | Resale disabled for ENDED events | CRITICAL | Integration test |
| RS-03 | Resale disabled for CANCELLED events | CRITICAL | Integration test |
| RS-04 | Resale cutoff time enforced | HIGH | Integration test |
| RS-05 | Used tickets cannot be listed for resale | CRITICAL | Integration test |
| RS-06 | Resale listings cancelled on event cancellation | HIGH | Integration test |
| RS-07 | Resale listings cancelled on event start | HIGH | Integration test |
| RS-08 | Transfer blocked after event start | HIGH | Integration test |
| RS-09 | Resale marketplace notified of state changes | HIGH | Integration test |
| RS-10 | Price caps enforced on resale (if applicable) | MEDIUM | Integration test |

**Verification Commands:**
```bash
# Find resale validation
grep -rn "resale\|resell\|secondary" --include="*.ts" | grep -i "valid\|check\|allow"

# Check for event state in resale logic
grep -rn "resale\|transfer" --include="*.ts" -B 5 -A 5 | grep -i "status\|state"

# Find cutoff logic
grep -rn "cutoff\|deadline\|freeze" --include="*.ts" | grep -i resale
```

---

### 3.8 Audit Trail Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| AU-01 | All state changes logged | CRITICAL | Code review |
| AU-02 | State change actor recorded | HIGH | Schema review |
| AU-03 | State change timestamp recorded | HIGH | Schema review |
| AU-04 | State change reason recorded (for manual) | HIGH | Schema review |
| AU-05 | Event modifications logged | HIGH | Code review |
| AU-06 | Cancellation details logged | HIGH | Code review |
| AU-07 | Audit log is immutable | HIGH | Storage configuration |
| AU-08 | Audit log searchable/filterable | MEDIUM | Feature test |
| AU-09 | Audit log retention meets compliance | MEDIUM | Policy review |
| AU-10 | Audit log includes previous/new state values | MEDIUM | Schema review |

**Verification Commands:**
```bash
# Find audit logging
grep -rn "audit\|log.*change\|track" --include="*.ts" | grep -i event

# Check for state in audit entries
grep -rn "AuditLog\|EventLog\|ChangeLog" --include="*.ts" -A 20

# Find immutable storage patterns
grep -rn "append\|immutable\|readonly" --include="*.ts" | grep -i log
```

---

---

## 29 - 29-resale-business-rules

### 3.1 Price Controls Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| PC-01 | Price cap enforcement by jurisdiction implemented | CRITICAL | Code review + test |
| PC-02 | Face value stored and accessible for each ticket | HIGH | Schema inspection |
| PC-03 | Artist/venue price policies integrated | HIGH | Integration test |
| PC-04 | Price validation occurs server-side | CRITICAL | API security test |
| PC-05 | Price cap applies to total including fees | HIGH | Transaction review |
| PC-06 | Ireland face value cap enforced | CRITICAL | Geo-filtered test |
| PC-07 | Massachusetts $2 cap enforced | HIGH | State-filtered test |
| PC-08 | Price override requires admin approval | MEDIUM | Permission test |
| PC-09 | Price cap changes logged in audit trail | HIGH | Audit log review |
| PC-10 | Service fees disclosed separately | HIGH | UI/API review |

**Verification Commands:**
```bash
# Find price validation logic
grep -rn "validatePrice\|priceLimit\|maxMarkup" --include="*.ts"

# Check for jurisdiction-based rules
grep -rn "jurisdiction\|country\|state" --include="*.ts" | grep -i price

# Find price cap configurations
grep -rn "FACE_VALUE\|PRICE_CAP\|MAX_MARKUP" --include="*.ts" --include="*.json"
```

---

### 3.2 Timing Rules Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| TR-01 | Resale cutoff time configurable per event | HIGH | Admin UI review |
| TR-02 | Automatic cutoff triggers at event start | CRITICAL | Integration test |
| TR-03 | Post-event listings automatically cancelled | CRITICAL | State transition test |
| TR-04 | Transfer cutoff enforced | HIGH | API test |
| TR-05 | Purchase cutoff validates delivery time | HIGH | Flow test |
| TR-06 | Timezone handling correct for event location | HIGH | Unit test |
| TR-07 | Grace period for post-start listings documented | MEDIUM | Policy review |
| TR-08 | Cutoff times displayed to users | MEDIUM | UI review |
| TR-09 | Server time synchronized (NTP) | HIGH | Infrastructure check |
| TR-10 | Manual cutoff override requires authorization | HIGH | Permission test |

**Verification Commands:**
```bash
# Find timing validation
grep -rn "cutoff\|deadline\|eventStart\|eventEnd" --include="*.ts"

# Check for automated state transitions
grep -rn "cron\|schedule\|setInterval" --include="*.ts" | grep -i "resale\|listing"

# Find timezone handling
grep -rn "timezone\|tz\|UTC" --include="*.ts" | grep -i event
```

---

### 3.3 Transfer Limit Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| TL-01 | Transfer count tracked per ticket | CRITICAL | Schema inspection |
| TL-02 | Maximum transfer limit enforced | HIGH | Integration test |
| TL-03 | Transfer history maintained | HIGH | Database review |
| TL-04 | Non-transferable flag respected | CRITICAL | API test |
| TL-05 | Cooldown period between transfers enforced | MEDIUM | Flow test |
| TL-06 | Transfer chain visible to admin | MEDIUM | Admin UI test |
| TL-07 | Original purchaser identified in chain | HIGH | Data review |
| TL-08 | Transfer recipient identity verified | HIGH | Flow test |
| TL-09 | Transfer limits displayed to users | MEDIUM | UI review |
| TL-10 | State law transfer requirements met | HIGH | Compliance review |

**Verification Commands:**
```bash
# Find transfer tracking
grep -rn "transferCount\|transferHistory\|maxTransfers" --include="*.ts"

# Check for transfer validation
grep -rn "validateTransfer\|canTransfer\|isTransferable" --include="*.ts"

# Find transfer limit configuration
grep -rn "TRANSFER_LIMIT\|MAX_TRANSFER\|NON_TRANSFERABLE" --include="*.ts" --include="*.json"
```

---

### 3.4 Anti-Scalping Measures Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| AS-01 | Bot detection implemented on purchase flow | CRITICAL | Security test |
| AS-02 | CAPTCHA or equivalent challenge present | HIGH | UI test |
| AS-03 | Purchase limits per account enforced | HIGH | API test |
| AS-04 | Rate limiting on ticket endpoints | HIGH | Load test |
| AS-05 | Device fingerprinting active | MEDIUM | Technical review |
| AS-06 | Behavioral analysis for bot patterns | MEDIUM | Analytics review |
| AS-07 | Speculative ticket listing prevented | HIGH | Data validation |
| AS-08 | Duplicate listing detection | HIGH | Integration test |
| AS-09 | Bulk purchase alerts configured | MEDIUM | Monitoring review |
| AS-10 | Account linking detection (same person, multiple accounts) | HIGH | Analysis |

**Verification Commands:**
```bash
# Find bot detection
grep -rn "captcha\|recaptcha\|bot\|fingerprint" --include="*.ts"

# Check for rate limiting
grep -rn "rateLimit\|throttle\|requestLimit" --include="*.ts"

# Find purchase limits
grep -rn "purchaseLimit\|maxTickets\|ticketLimit" --include="*.ts"
```

---

### 3.5 Seller Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| SV-01 | Identity verification required before listing | HIGH | Flow test |
| SV-02 | Email verification enforced | HIGH | Registration test |
| SV-03 | Phone verification enforced | HIGH | Registration test |
| SV-04 | ID document verification available | MEDIUM | Feature review |
| SV-05 | Payment method verification required | HIGH | Payment flow test |
| SV-06 | Tax ID collected for high-volume sellers | MEDIUM | Compliance review |
| SV-07 | Verification level affects listing privileges | MEDIUM | Permission test |
| SV-08 | Seller history tracked | HIGH | Data review |
| SV-09 | Dispute rate affects seller status | MEDIUM | Analytics review |
| SV-10 | Account suspension for fraud | CRITICAL | Policy review |

**Verification Commands:**
```bash
# Find seller verification
grep -rn "verifySeller\|sellerVerification\|kyc" --include="*.ts"

# Check for identity requirements
grep -rn "idVerification\|identityCheck\|documentVerify" --include="*.ts"

# Find seller trust levels
grep -rn "sellerLevel\|trustScore\|sellerStatus" --include="*.ts"
```

---

### 3.6 Venue/Artist Policy Compliance

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| VP-01 | Resale approval status captured per event | CRITICAL | Schema inspection |
| VP-02 | Approved resale channels enforced | HIGH | Integration test |
| VP-03 | Artist policy integrated into listing flow | HIGH | Flow test |
| VP-04 | Non-transferable events block all resale | CRITICAL | API test |
| VP-05 | Venue restrictions respected | HIGH | Integration test |
| VP-06 | Policy changes propagate to active listings | HIGH | State transition test |
| VP-07 | Ticket invalidation supported | HIGH | Feature review |
| VP-08 | Entry denial integration available | HIGH | Integration review |
| VP-09 | Refund policy aligned with venue | MEDIUM | Policy review |
| VP-10 | Artist notification of resale activity | MEDIUM | Integration review |

**Verification Commands:**
```bash
# Find venue/artist policy integration
grep -rn "venuePolicy\|artistPolicy\|resaleApproval" --include="*.ts"

# Check for policy enforcement
grep -rn "allowResale\|resaleEnabled\|canResell" --include="*.ts"

# Find approved channel checks
grep -rn "approvedPlatform\|authorizedReseller" --include="*.ts"
```

---

### 3.7 Jurisdictional Compliance

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| JC-01 | User location detection implemented | HIGH | Geo test |
| JC-02 | Event jurisdiction captured | HIGH | Schema inspection |
| JC-03 | Applicable laws determined per transaction | CRITICAL | Code review |
| JC-04 | Ireland Sale of Tickets Act compliance | CRITICAL | Ireland-specific test |
| JC-05 | UK pending legislation readiness | HIGH | Gap analysis |
| JC-06 | US state-specific rules implemented | HIGH | State-by-state test |
| JC-07 | BOTS Act compliance (no bot sales) | CRITICAL | Security audit |
| JC-08 | Refund guarantee requirements met | HIGH | Policy review |
| JC-09 | Disclosure requirements satisfied | HIGH | UI review |
| JC-10 | License requirements checked for sellers | HIGH | Compliance review |

**Verification Commands:**
```bash
# Find jurisdiction handling
grep -rn "jurisdiction\|geoLocation\|country\|state" --include="*.ts" | grep -i "resale\|price\|law"

# Check for specific jurisdictions
grep -rn "Ireland\|Massachusetts\|UK\|Minnesota" --include="*.ts"

# Find compliance flags
grep -rn "compliant\|regulated\|legal" --include="*.ts" --include="*.json"
```

---

### 3.8 Fraud Prevention

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| FP-01 | Duplicate ticket detection | CRITICAL | Integration test |
| FP-02 | Stolen ticket reporting mechanism | HIGH | Feature review |
| FP-03 | Ticket authenticity verification | CRITICAL | Integration test |
| FP-04 | Seller credit card on file for chargebacks | HIGH | Payment review |
| FP-05 | Buyer protection guarantee implemented | HIGH | Policy review |
| FP-06 | Suspicious activity monitoring | HIGH | Analytics review |
| FP-07 | Multi-account detection | HIGH | Security test |
| FP-08 | Payment fraud screening | CRITICAL | Payment integration test |
| FP-09 | Chargeback handling process defined | HIGH | Process review |
| FP-10 | Fraud incident response plan exists | HIGH | Documentation review |

**Verification Commands:**
```bash
# Find fraud detection
grep -rn "fraud\|suspicious\|anomaly" --include="*.ts"

# Check for authenticity verification
grep -rn "authentic\|verify\|validate" --include="*.ts" | grep -i ticket

# Find buyer protection
grep -rn "guarantee\|protection\|refund" --include="*.ts" | grep -i buyer
```

---

---

## 30 - 30-royalty-fee-calculation

### 3.1 Data Storage & Types

| Check | Expected | File/Location to Verify |
|-------|----------|------------------------|
| ☐ All money stored as integers (cents) | `INTEGER` or `BIGINT` in PostgreSQL | Database schema, migrations |
| ☐ No `FLOAT`, `DOUBLE`, `REAL` for money | Should use `INTEGER` or `NUMERIC` | All price/amount columns |
| ☐ Currency stored alongside amounts | `currency VARCHAR(3)` column | Transaction tables |
| ☐ Percentages stored as integers | `permyriad INTEGER` (100.00% = 10000) | Fee configuration tables |

**PostgreSQL Best Practice:**
numeric is widely considered the ideal datatype for storing money in Postgres.

The type numeric can store numbers with a very large number of digits. It is especially recommended for storing monetary amounts and other quantities where exactness is required.

**Recommended Schema:**
```sql
-- Option 1: Integer cents (recommended for performance)
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  -- ...
);

-- Option 2: NUMERIC for maximum precision
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  -- ...
);
```

### 3.2 Calculation Implementation

| Check | Expected | Where to Verify |
|-------|----------|-----------------|
| ☐ Money library used consistently | Dinero.js or currency.js | Package.json, import statements |
| ☐ No `Number` arithmetic for money | All calculations use library | Search: `/\d+\.\d+\s*[\+\-\*\/]/` |
| ☐ Rounding only at final step | Intermediate calculations keep precision | Fee calculation functions |
| ☐ Consistent rounding mode | Banker's rounding or documented alternative | Rounding function implementations |

**Recommended Library:**
Dinero.js lets you create, calculate, and format money safely in JavaScript and TypeScript. Money is complex, and the primitives of the language aren't enough to properly represent it.

An immutable library is safer and more predictable. Mutable operations and reference copies are a source of bugs. Immutability avoids them altogether.

**Implementation Pattern:**
```typescript
import { dinero, add, subtract, multiply, allocate } from 'dinero.js';
import { USD } from '@dinero.js/currencies';

// Create money object
const ticketPrice = dinero({ amount: 9999, currency: USD }); // $99.99

// Calculate platform fee (5%)
const feeAmount = multiply(ticketPrice, { amount: 5, scale: 2 }); // 5.00%

// Split royalties
const [venueCut, artistCut, platformCut] = allocate(
  ticketPrice,
  [30, 20, 50] // 30%, 20%, 50%
);
```

### 3.3 Fee Configuration Validation

| Check | Expected | Where to Verify |
|-------|----------|-----------------|
| ☐ Percentage validation on input | Sum ≤ 100%, each ≤ max | API validators, form handlers |
| ☐ Fee cap enforcement | Platform fee max enforced | Fee calculation service |
| ☐ Minimum price enforcement | Prevents negative seller payout | Listing creation logic |
| ☐ Fee change audit trail | All fee config changes logged | Admin audit logs |

**Validation Function:**
```typescript
const MAX_PLATFORM_FEE_PERCENT = 2000;      // 20.00%
const MAX_VENUE_ROYALTY_PERCENT = 1000;      // 10.00%
const MAX_ARTIST_ROYALTY_PERCENT = 1000;     // 10.00%
const MAX_TOTAL_FEES_PERCENT = 4000;         // 40.00%

interface FeeConfig {
  platformFeePercent: number;   // In permyriad (100 = 1%)
  venueRoyaltyPercent: number;
  artistRoyaltyPercent: number;
}

function validateFeeConfig(config: FeeConfig): ValidationResult {
  const errors: string[] = [];
  
  if (config.platformFeePercent > MAX_PLATFORM_FEE_PERCENT) {
    errors.push(`Platform fee ${config.platformFeePercent/100}% exceeds max 20%`);
  }
  
  if (config.venueRoyaltyPercent > MAX_VENUE_ROYALTY_PERCENT) {
    errors.push(`Venue royalty ${config.venueRoyaltyPercent/100}% exceeds max 10%`);
  }
  
  if (config.artistRoyaltyPercent > MAX_ARTIST_ROYALTY_PERCENT) {
    errors.push(`Artist royalty ${config.artistRoyaltyPercent/100}% exceeds max 10%`);
  }
  
  const totalPercent = config.platformFeePercent + 
                       config.venueRoyaltyPercent + 
                       config.artistRoyaltyPercent;
  
  if (totalPercent > MAX_TOTAL_FEES_PERCENT) {
    errors.push(`Total fees ${totalPercent/100}% exceeds max 40%`);
  }
  
  return { valid: errors.length === 0, errors };
}
```

### 3.4 Stripe Integration

| Check | Expected | Where to Verify |
|-------|----------|-----------------|
| ☐ All amounts in cents | `amount: 1000` not `amount: 10.00` | Stripe API calls |
| ☐ `source_transaction` used for transfers | Links transfer to charge | Transfer creation code |
| ☐ `transfer_group` for related transfers | All splits share group | Order processing service |
| ☐ Transfer total validation | Sum ≤ charge amount - fees | Pre-transfer validation |
| ☐ Idempotency keys used | Prevents duplicate transfers | All Stripe mutation calls |

**Stripe Transfer Validation:**
```typescript
async function processResalePayout(
  orderId: string,
  chargeId: string,
  splits: PayoutSplit[]
): Promise<void> {
  // 1. Retrieve charge to get actual available amount
  const charge = await stripe.charges.retrieve(chargeId);
  const stripeFee = charge.balance_transaction 
    ? (await stripe.balanceTransactions.retrieve(charge.balance_transaction)).fee
    : Math.ceil(charge.amount * 0.029) + 30; // Estimate if not available
    
  const availableAmount = charge.amount - stripeFee;
  
  // 2. Calculate all transfer amounts
  const totalTransfers = splits.reduce((sum, s) => sum + s.amountCents, 0);
  
  // 3. Validate
  if (totalTransfers > availableAmount) {
    throw new Error(
      `Transfer total ${totalTransfers} exceeds available ${availableAmount} ` +
      `(charge: ${charge.amount}, stripe fee: ${stripeFee})`
    );
  }
  
  // 4. Create transfers with idempotency
  const transferGroup = `RESALE_${orderId}`;
  
  for (const split of splits) {
    await stripe.transfers.create({
      amount: split.amountCents,
      currency: 'usd',
      destination: split.stripeAccountId,
      source_transaction: chargeId,
      transfer_group: transferGroup,
      metadata: {
        order_id: orderId,
        recipient_type: split.recipientType,
      },
    }, {
      idempotencyKey: `transfer_${orderId}_${split.recipientType}`,
    });
  }
}
```

### 3.5 Resale Royalty Distribution

| Check | Expected | Where to Verify |
|-------|----------|-----------------|
| ☐ Royalty percentages from event config | Not hardcoded | Resale listing service |
| ☐ Original purchase price tracked | For profit calculations | Ticket ownership records |
| ☐ Split calculation is deterministic | Same input = same output | Unit tests |
| ☐ Remainder handling documented | Platform absorbs or round-robin | Fee calculation comments |
| ☐ NFT metadata matches payout | On-chain royalty = actual payout | Minting service |

**Resale Payout Calculation:**
```typescript
interface ResalePayoutCalculation {
  salePriceCents: number;
  sellerPayoutCents: number;
  venueRoyaltyCents: number;
  artistRoyaltyCents: number;
  platformFeeCents: number;
  stripeFeeCents: number;
}

function calculateResalePayout(
  salePriceCents: number,
  eventConfig: EventFeeConfig
): ResalePayoutCalculation {
  // 1. Calculate Stripe fee first (unavoidable)
  const stripeFeeCents = Math.ceil(salePriceCents * 0.029) + 30;
  
  // 2. Calculate net amount after Stripe
  const netAmount = salePriceCents - stripeFeeCents;
  
  // 3. Calculate royalties from SALE PRICE (not net)
  const venueRoyaltyCents = Math.floor(
    salePriceCents * eventConfig.venueRoyaltyPermyriad / 10000
  );
  const artistRoyaltyCents = Math.floor(
    salePriceCents * eventConfig.artistRoyaltyPermyriad / 10000
  );
  
  // 4. Calculate platform fee
  const platformFeeCents = Math.floor(
    salePriceCents * eventConfig.platformFeePermyriad / 10000
  );
  
  // 5. Seller gets remainder
  const sellerPayoutCents = netAmount - venueRoyaltyCents - artistRoyaltyCents - platformFeeCents;
  
  // 6. Validate no negative payout
  if (sellerPayoutCents < 0) {
    throw new Error(
      `Seller payout would be negative: ${sellerPayoutCents}. ` +
      `Sale price too low for configured fees.`
    );
  }
  
  // 7. Validate sum equals net
  const sum = sellerPayoutCents + venueRoyaltyCents + artistRoyaltyCents + platformFeeCents;
  if (sum !== netAmount) {
    throw new Error(`Payout sum ${sum} !== net amount ${netAmount}`);
  }
  
  return {
    salePriceCents,
    sellerPayoutCents,
    venueRoyaltyCents,
    artistRoyaltyCents,
    platformFeeCents,
    stripeFeeCents,
  };
}
```

### 3.6 FTC Compliance (Fee Transparency)

| Check | Expected | Where to Verify |
|-------|----------|-----------------|
| ☐ Total price shown prominently | Before any base price | Checkout UI, API responses |
| ☐ All mandatory fees included in total | Service fees, facility fees | Price display logic |
| ☐ Fee breakdown available | Itemized but not overshadowing total | Checkout details |
| ☐ No drip pricing | Fees shown upfront, not at checkout | Purchase flow testing |
| ☐ Fee descriptions are specific | Not vague "service fee" | UI copy, API labels |

**API Response Structure:**
```typescript
interface PriceBreakdown {
  // MUST be displayed most prominently
  totalPrice: {
    amountCents: number;
    display: string; // "$54.99"
  };
  
  // Breakdown (can be itemized but not overshadow total)
  breakdown: {
    baseTicketPrice: {
      amountCents: number;
      display: string;
      description: "Face value";
    };
    serviceFee: {
      amountCents: number;
      display: string;
      description: "Platform service and technology fee";
    };
    facilityFee: {
      amountCents: number;
      display: string;
      description: "Venue operations fee";
    };
  };
  
  // Optional fees (shown separately)
  optionalFees?: {
    ticketInsurance?: {...};
    premiumDelivery?: {...};
  };
  
  // Government fees (can be shown separately)
  taxes?: {
    estimated: boolean;
    amountCents: number;
  };
}
```

### 3.7 Database Integrity

| Check | Expected | Where to Verify |
|-------|----------|-----------------|
| ☐ Transaction isolation for payouts | `SERIALIZABLE` or `REPEATABLE READ` | Payout transaction code |
| ☐ Atomic multi-table updates | Within single transaction | Order completion service |
| ☐ Reconciliation queries exist | Sum of parts = total | Admin/reporting queries |
| ☐ Audit log for all fee calculations | Input, output, timestamp | Audit table |

**Transaction Pattern:**
```typescript
async function processOrderWithPayouts(
  orderId: string,
  paymentIntentId: string
): Promise<void> {
  await knex.transaction(async (trx) => {
    // 1. Lock the order row
    const order = await trx('orders')
      .where({ id: orderId })
      .forUpdate()
      .first();
    
    if (order.status !== 'payment_received') {
      throw new Error(`Invalid order status: ${order.status}`);
    }
    
    // 2. Calculate all payouts
    const payouts = calculatePayouts(order);
    
    // 3. Record payout intentions
    await trx('payout_records').insert(
      payouts.map(p => ({
        order_id: orderId,
        recipient_type: p.type,
        recipient_id: p.recipientId,
        amount_cents: p.amountCents,
        status: 'pending',
      }))
    );
    
    // 4. Verify sum matches
    const totalPayouts = payouts.reduce((s, p) => s + p.amountCents, 0);
    const expectedTotal = order.net_amount_cents;
    
    if (totalPayouts !== expectedTotal) {
      throw new Error(`Payout mismatch: ${totalPayouts} vs ${expectedTotal}`);
    }
    
    // 5. Update order status
    await trx('orders')
      .where({ id: orderId })
      .update({ 
        status: 'payouts_pending',
        payout_calculated_at: new Date(),
      });
    
    // 6. Queue actual Stripe transfers (outside transaction)
  }, { isolationLevel: 'serializable' });
}
```

---

---

## 31 - 31-blockchain-database-consistency

### 3.1 Source of Truth Documentation

| Check | Status | Notes |
|-------|--------|-------|
| □ Documented source of truth for NFT ownership | | Blockchain |
| □ Documented source of truth for transaction history | | Blockchain |
| □ Documented source of truth for user profiles | | Database |
| □ Documented source of truth for event metadata | | Database |
| □ Documented source of truth for pricing | | Database |
| □ All services reference correct source | | |
| □ No service treats database as ownership source | | |

### 3.2 Blockchain Transaction Handling

| Check | Status | Notes |
|-------|--------|-------|
| □ Using `confirmed` commitment level (not `processed`) | | |
| □ Tracking `lastValidBlockHeight` for all transactions | | |
| □ Not updating DB before blockchain confirmation | | |
| □ Pending transactions table exists | | |
| □ Expired transaction detection implemented | | |
| □ Transaction retry with exponential backoff | | |
| □ Dead letter queue for failed operations | | |
| □ Idempotency keys for all blockchain operations | | |
| □ Webhook/callback on transaction confirmation | | |

### 3.3 Reconciliation Processes

| Check | Status | Notes |
|-------|--------|-------|
| □ Automated reconciliation job exists | | |
| □ Reconciliation runs every ≤15 minutes | | |
| □ Ownership comparison (chain vs DB) | | |
| □ Balance comparison for royalties | | |
| □ Mismatch auto-healing (DB → chain state) | | |
| □ Audit log for all corrections | | |
| □ Manual review queue for complex mismatches | | |
| □ Reconciliation history retained ≥90 days | | |

### 3.4 Event Synchronization

| Check | Status | Notes |
|-------|--------|-------|
| □ Real-time blockchain event listener running | | |
| □ Event listener has automatic reconnection | | |
| □ Missed event detection logic | | |
| □ Event processing is idempotent | | |
| □ Events persisted before processing | | |
| □ Event processing failures alerted | | |
| □ Block reorg handling implemented | | |

### 3.5 Failure Handling

| Check | Status | Notes |
|-------|--------|-------|
| □ RPC failover configured (multiple endpoints) | | |
| □ Circuit breaker for RPC calls | | |
| □ Graceful degradation when blockchain unavailable | | |
| □ Retry logic with exponential backoff | | |
| □ Maximum retry attempts configured | | |
| □ Dead letter queue processing workflow | | |
| □ Manual intervention procedure documented | | |

### 3.6 Alerting & Monitoring

| Check | Status | Notes |
|-------|--------|-------|
| □ Sync lag alert configured | | |
| □ Ownership mismatch alert configured | | |
| □ Transaction failure rate alert | | |
| □ Reconciliation job failure alert | | |
| □ Dead letter queue depth alert | | |
| □ RPC node health monitoring | | |
| □ Dashboard for blockchain sync status | | |
| □ On-call runbook for sync failures | | |

### 3.7 Database Schema

| Check | Status | Notes |
|-------|--------|-------|
| □ `pending_transactions` table exists | | |
| □ `blockchain_sync_log` table exists | | |
| □ `ownership_audit_trail` table exists | | |
| □ `dead_letter_queue` table exists | | |
| □ Indexes on `mint_address`, `tx_signature` | | |
| □ Foreign key constraints appropriate | | |
| □ `last_synced_at` columns where needed | | |

---

---

## 32 - 32-payment-split-accuracy

### 3.1 Transfer Pattern Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Documented which charge type is used (Direct/Destination/SCT) | | |
| □ Charge type matches business requirements | | |
| □ Multi-party splits use Separate Charges & Transfers | | |
| □ Simple single-recipient uses Destination Charges | | |
| □ `transfer_group` used to associate related transactions | | |
| □ `source_transaction` used to link transfers to charges | | |
| □ Idempotency keys used for all Stripe API calls | | |
| □ Transfer amounts calculated in integer cents (no floats) | | |

### 3.2 Failure Handling Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Webhook endpoint configured for Connect events | | |
| □ `charge.failed` handler cancels pending transfers | | |
| □ `charge.refunded` handler reverses transfers | | |
| □ `transfer.reversed` handler updates database | | |
| □ `account.updated` handler checks account capabilities | | |
| □ `payout.failed` handler alerts and retries | | |
| □ Pending transfers table exists in database | | |
| □ Background job retries failed transfers | | |
| □ Maximum retry limit configured | | |
| □ Dead letter queue for unrecoverable failures | | |
| □ Alerting configured for transfer failures | | |

### 3.3 Reconciliation Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Daily reconciliation job exists | | |
| □ Compares expected vs actual transfer amounts | | |
| □ Detects missing transfers | | |
| □ Alerts on discrepancies | | |
| □ Stores Stripe transaction IDs in database | | |
| □ Uses Balance Transactions API for verification | | |
| □ Payout reconciliation report reviewed regularly | | |
| □ Reconciliation history retained ≥90 days | | |

### 3.4 Fee Calculation Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Fee calculation uses integer cents (not floats) | | |
| □ Stripe processing fees factored into calculations | | |
| □ Platform fee calculation documented | | |
| □ Royalty split calculation documented | | |
| □ Rounding policy defined and implemented | | |
| □ Partial refund fee adjustment implemented | | |
| □ Multi-currency fee conversion handled | | |
| □ Fee calculations have unit tests | | |

### 3.5 Payout Timing Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Connected account payout schedules configured | | |
| □ `source_transaction` used to prevent premature transfers | | |
| □ ACH/SEPA payments wait for `charge.succeeded` | | |
| □ Manual payouts only after funds available | | |
| □ Payout schedule appropriate for business (escrow, immediate) | | |
| □ `delay_days` appropriate for risk profile | | |
| □ Instant payouts only for settled funds | | |

### 3.6 Refund & Dispute Handling

| Check | Status | Notes |
|-------|--------|-------|
| □ `reverse_transfer: true` set on refunds for destination charges | | |
| □ Transfer reversals implemented for separate charges | | |
| □ Partial refund → proportional transfer reversal | | |
| □ Dispute webhook handler implemented | | |
| □ Transfer reversal on dispute created | | |
| □ Re-transfer on dispute won | | |
| □ Connected account balance checked before reversal | | |

### 3.7 Database Schema Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ `stripe_charge_id` stored on orders | | |
| □ `stripe_transfer_group` stored on orders | | |
| □ `stripe_transfers` table exists with transfer details | | |
| □ `expected_amounts` stored for reconciliation | | |
| □ `pending_transfers` table for retry tracking | | |
| □ Indexes on Stripe IDs for fast lookups | | |
| □ Audit trail for all financial operations | | |

### 3.8 Monitoring & Alerting Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Alert: Transfer failure rate > threshold | | |
| □ Alert: Reconciliation discrepancy detected | | |
| □ Alert: Connected account disabled | | |
| □ Alert: Payout failure | | |
| □ Dashboard: Transfer success rate | | |
| □ Dashboard: Average transfer delay | | |
| □ Dashboard: Platform revenue tracking | | |
| □ Runbook: Transfer failure resolution | | |

---

---

## 33 - 33-inventory-management

### 3.1 Locking Mechanism Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Primary locking mechanism documented | | |
| □ Database row-level locking used (`SELECT FOR UPDATE`) | | |
| □ Distributed locks used for cross-service operations | | |
| □ Lock timeout configured (not infinite) | | |
| □ Lock acquisition has retry with backoff | | |
| □ Locks acquired in deterministic order (prevents deadlocks) | | |
| □ Lock release in finally/cleanup block | | |
| □ Dead lock detection/alerting configured | | |
| □ Lock contention metrics captured | | |
| □ Load tested with concurrent users | | |

### 3.2 Reservation Timeout Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Reservation timeout is enforced (has `expires_at`) | | |
| □ Timeout duration is appropriate for event type | | |
| □ `expires_at` column has NOT NULL constraint | | |
| □ Maximum timeout enforced (no infinite holds) | | |
| □ Timeout displayed to user (countdown timer) | | |
| □ User can extend reservation (if allowed) | | |
| □ Extension has maximum limit | | |
| □ Abandoned reservations are released | | |
| □ Cleanup job runs frequently enough | | |
| □ Cleanup job failure alerts configured | | |

### 3.3 Overselling Prevention Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Database CHECK constraint: `quantity >= 0` | | |
| □ Atomic decrement used (`SET qty = qty - 1 WHERE qty >= 1`) | | |
| □ No check-then-act race conditions in code | | |
| □ Transaction isolation level appropriate | | |
| □ Optimistic or pessimistic locking implemented | | |
| □ Double-purchase prevention (idempotency) | | |
| □ Concurrent purchase load tested | | |
| □ Oversell detection alerts configured | | |
| □ Manual inventory adjustment requires approval | | |
| □ Audit trail for all inventory changes | | |

### 3.4 Cleanup & Release Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Cron job for expired reservation cleanup exists | | |
| □ Cron job runs at least every minute | | |
| □ Cron job has monitoring/alerting | | |
| □ Lazy evaluation checks expiry at query time | | |
| □ Orphaned reservation detection query exists | | |
| □ Stuck reservation alert threshold configured | | |
| □ Manual release procedure documented | | |
| □ Cleanup affects all relevant tables (tickets + reservations) | | |
| □ Released tickets are immediately available | | |
| □ Release events published for real-time updates | | |

### 3.5 Concurrency & Scalability Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Virtual queue/waiting room for high-demand sales | | |
| □ Rate limiting on purchase endpoints | | |
| □ Connection pool sized for peak load | | |
| □ Database query timeout configured | | |
| □ Horizontal scaling tested | | |
| □ Hot ticket handling (Redis caching) | | |
| □ Optimistic locking for batch inventory | | |
| □ Pessimistic locking for single high-value tickets | | |
| □ Bot detection/prevention implemented | | |
| □ CAPTCHA or proof-of-work for purchases | | |

### 3.6 Reconciliation & Audit Trail Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Daily inventory reconciliation job exists | | |
| □ Sum of statuses = total tickets check | | |
| □ Database vs blockchain ownership reconciliation | | |
| □ Inventory drift detection alerts | | |
| □ All inventory changes logged with user/timestamp | | |
| □ Manual adjustment requires reason code | | |
| □ Audit trail retained for compliance period | | |
| □ Discrepancy investigation procedure documented | | |
| □ Reconciliation report accessible to ops | | |
| □ Historical inventory snapshots retained | | |

### 3.7 Database Schema Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ `tickets` table has `status` enum/check constraint | | |
| □ `tickets` table has `version` for optimistic locking | | |
| □ `ticket_reservations` table exists | | |
| □ `expires_at` column on reservations (NOT NULL) | | |
| □ Unique constraint: one active reservation per ticket | | |
| □ Foreign key: reservation → ticket | | |
| □ Index on `expires_at` for cleanup queries | | |
| □ Index on `status` for inventory queries | | |
| □ `inventory_audit_log` table exists | | |
| □ Trigger/application logging for inventory changes | | |

### 3.8 Failure Handling Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Payment failure releases reservation | | |
| □ Application crash releases reservation (via timeout) | | |
| □ Database connection failure handling | | |
| □ Redis connection failure fallback | | |
| □ Partial transaction rollback handled | | |
| □ Retry logic with exponential backoff | | |
| □ Circuit breaker for external dependencies | | |
| □ Graceful degradation under load | | |
| □ Error rates monitored and alerted | | |
| □ Runbook for common failure scenarios | | |

---

---

## 34 - 34-refund-scenarios

### 3.1 Refund Scenarios Coverage

| Check | Status | Notes |
|-------|--------|-------|
| □ Full refund for event cancellation | | |
| □ Partial refund for service fee retention | | |
| □ Refund for postponed event (optional window) | | |
| □ Refund for rescheduled event (can't attend new date) | | |
| □ Refund for duplicate purchase | | |
| □ Refund for fraudulent transaction | | |
| □ Refund for invalid/counterfeit ticket (resale) | | |
| □ Refund for non-delivery (resale) | | |
| □ Refund after ticket transfer | | |
| □ Partial refund (one ticket of many) | | |
| □ Refund with promo code/discount applied | | |
| □ Refund crossing billing periods | | |

### 3.2 Double Refund Prevention

| Check | Status | Notes |
|-------|--------|-------|
| □ Idempotency keys used for all refund requests | | |
| □ Database unique constraint on refund records | | |
| □ State machine prevents invalid transitions | | |
| □ UI prevents double-click submission | | |
| □ Webhook handlers are idempotent | | |
| □ Distributed lock for concurrent requests | | |
| □ Stripe idempotency_key parameter used | | |
| □ Refund amount validation before processing | | |
| □ Total refunded tracked per order | | |
| □ Maximum refundable calculated correctly | | |

### 3.3 Refund Eligibility Validation

| Check | Status | Notes |
|-------|--------|-------|
| □ Order exists and is valid | | |
| □ Order status is refundable | | |
| □ Within refund time window | | |
| □ Event hasn't occurred (or is cancelled) | | |
| □ Not already fully refunded | | |
| □ Tickets not transferred to another user | | |
| □ No active dispute on order | | |
| □ Payment intent is in refundable state | | |
| □ Requester is authorized | | |
| □ Amount doesn't exceed maximum refundable | | |

### 3.4 Multi-Party Payment Handling

| Check | Status | Notes |
|-------|--------|-------|
| □ `reverse_transfer: true` used for Connect refunds | | |
| □ `refund_application_fee: true` used when appropriate | | |
| □ Seller balance checked before reversal | | |
| □ Insufficient balance handling implemented | | |
| □ Royalty transfers reversed on refund | | |
| □ All parties' amounts tracked in database | | |
| □ Proportional refunds calculated correctly | | |
| □ Platform responsible for negative balance | | |

### 3.5 Royalty Handling on Refund

| Check | Status | Notes |
|-------|--------|-------|
| □ Creator royalties reversed on full refund | | |
| □ Proportional royalty reversal on partial refund | | |
| □ Royalty transfer reversal tracked | | |
| □ Creator notified of royalty reversal | | |
| □ Royalty reversal reflected in creator dashboard | | |
| □ Tax implications documented | | |

### 3.6 Chargeback Handling

| Check | Status | Notes |
|-------|--------|-------|
| □ Webhook handler for `charge.dispute.created` | | |
| □ Webhook handler for `charge.dispute.updated` | | |
| □ Webhook handler for `charge.dispute.closed` | | |
| □ Disputes linked to orders in database | | |
| □ Refund locked when dispute active | | |
| □ Evidence collection automated | | |
| □ Evidence submission before deadline | | |
| □ Team alerted on new disputes | | |
| □ Dispute rate monitored | | |
| □ Dispute rate alerts configured (< 0.65%) | | |

### 3.7 Refund Communication

| Check | Status | Notes |
|-------|--------|-------|
| □ Refund confirmation email sent to customer | | |
| □ Expected timeline communicated (5-10 business days) | | |
| □ Refund reference number provided | | |
| □ Seller notified of reversal | | |
| □ Creator notified of royalty reversal | | |
| □ Support team has refund visibility | | |

### 3.8 Audit Trail & Compliance

| Check | Status | Notes |
|-------|--------|-------|
| □ All refund actions logged with timestamp | | |
| □ User who initiated refund recorded | | |
| □ Reason for refund stored | | |
| □ Amount breakdown stored (customer, seller, platform, royalty) | | |
| □ Stripe refund ID stored | | |
| □ Original payment linked to refund | | |
| □ Refund policy version at time of purchase stored | | |
| □ Audit log immutable (append-only) | | |

### 3.9 Edge Cases

| Check | Status | Notes |
|-------|--------|-------|
| □ Refund for expired card handled | | |
| □ Refund for closed bank account handled | | |
| □ Failed refund retry mechanism | | |
| □ Currency mismatch handling | | |
| □ Refund after payout to seller | | |
| □ Refund for subscription/recurring tickets | | |
| □ Bulk refund for event cancellation | | |
| □ Refund timeout handling | | |

---

---

## 35 - 35-qr-entry-validation

### 3.1 QR Code Content Security

| Check | Status | Notes |
|-------|--------|-------|
| □ QR codes contain cryptographic signature | | |
| □ Signature algorithm is secure (ES256, RS256, HS256) | | |
| □ Signature is validated on every scan | | |
| □ `alg: none` is explicitly rejected | | |
| □ Ticket IDs are non-sequential (UUIDs) | | |
| □ QR contains expiration timestamp | | |
| □ QR contains "not before" timestamp | | |
| □ QR includes issuer identification | | |
| □ Signing keys are rotated periodically | | |
| □ Private keys are stored securely (HSM/KMS) | | |
| □ Public keys are distributed to all validators | | |

### 3.2 Validation Endpoint Security

| Check | Status | Notes |
|-------|--------|-------|
| □ Endpoint requires HTTPS | | |
| □ Endpoint requires authentication | | |
| □ Device registration required | | |
| □ Staff session/authentication required | | |
| □ Rate limiting implemented | | |
| □ IP allowlisting for venue networks | | |
| □ All validation attempts logged | | |
| □ Failed validations trigger alerts at threshold | | |
| □ Object-level authorization checked | | |
| □ Endpoint returns minimal information on failure | | |

### 3.3 Replay Attack Prevention

| Check | Status | Notes |
|-------|--------|-------|
| □ Tickets marked as "scanned" immediately | | |
| □ Database transaction prevents race conditions | | |
| □ Row-level locking used for concurrent scans | | |
| □ Duplicate scans return original scan details | | |
| □ Time-based tokens (TOTP) implemented (optional) | | |
| □ Token rotation interval appropriate (15-60 sec) | | |
| □ Nonce/JTI tracked to prevent replay | | |
| □ Timestamp validated within tolerance | | |
| □ Cross-device sync prevents multi-gate replay | | |
| □ Exit/re-entry tracked separately if allowed | | |

### 3.4 Offline Validation

| Check | Status | Notes |
|-------|--------|-------|
| □ Local database pre-loaded before event | | |
| □ Local database encrypted at rest | | |
| □ Device requires authentication to access local data | | |
| □ Offline scans stored locally with timestamp | | |
| □ Auto-sync when connectivity restored | | |
| □ Conflict resolution strategy defined | | |
| □ Gate assignment prevents cross-gate duplicates | | |
| □ Offline mode indicated to staff on UI | | |
| □ Fallback to manual check-in if needed | | |
| □ Sync status visible on dashboard | | |

### 3.5 Staff Authentication

| Check | Status | Notes |
|-------|--------|-------|
| □ Staff must authenticate before scanning | | |
| □ Staff credentials tied to specific events | | |
| □ Role-based permissions implemented | | |
| □ Session timeout configured (8-12 hours) | | |
| □ Device-staff pairing enforced | | |
| □ Gate assignment validated | | |
| □ All staff actions logged with staff ID | | |
| □ Supervisor override requires separate auth | | |
| □ Password/PIN complexity enforced | | |
| □ Staff accounts can be disabled immediately | | |

### 3.6 Ticket Transfer Handling

| Check | Status | Notes |
|-------|--------|-------|
| □ Transfer invalidates previous QR code | | |
| □ New secrets generated on transfer | | |
| □ New owner receives fresh QR code | | |
| □ Transfer history maintained | | |
| □ Original owner cannot use old QR | | |
| □ Transfer notifications sent | | |
| □ Transfer limits enforced (if any) | | |
| □ Resale rules enforced in smart contract (NFT) | | |
| □ Blockchain ownership verified at scan (NFT) | | |
| □ Wallet signature required for entry (NFT) | | |

### 3.7 Time-Based Controls

| Check | Status | Notes |
|-------|--------|-------|
| □ Validation only within event time window | | |
| □ "Doors open" time enforced | | |
| □ Event end time prevents late scans | | |
| □ Ticket expiration checked | | |
| □ "Not before" claim validated | | |
| □ Clock sync between devices and server | | |
| □ Time tolerance defined and reasonable | | |
| □ Late arrival handling defined | | |

### 3.8 Audit and Monitoring

| Check | Status | Notes |
|-------|--------|-------|
| □ All scans logged (success and failure) | | |
| □ Logs include: ticket ID, time, device, staff, gate | | |
| □ Real-time dashboard for scan monitoring | | |
| □ Alerts for unusual patterns (high failures) | | |
| □ Capacity tracking in real-time | | |
| □ Post-event reports generated | | |
| □ Audit trail immutable | | |
| □ Logs retained per compliance requirements | | |

---

---

## 36 - 36-nft-minting-integrity

### 3.1 Double Minting Prevention

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Token ID counter uses auto-increment pattern | ☐ | |
| 2 | `_safeMint` used (validates unique token ID) | ☐ | |
| 3 | Maximum supply enforced at contract level | ☐ | |
| 4 | External asset IDs mapped to prevent re-minting | ☐ | |
| 5 | Database uses unique constraints on mint identifiers | ☐ | |
| 6 | Idempotency keys implemented for mint requests | ☐ | |
| 7 | Pre-mint validation queries current contract state | ☐ | |
| 8 | Race conditions prevented with proper locking | ☐ | |
| 9 | Nonces or sequence numbers prevent replay attacks | ☐ | |
| 10 | Batch mints use unique names/identifiers | ☐ | |

### 3.2 Transaction Confirmation Strategy

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 11 | Appropriate commitment level used (FINALIZED for Solana) | ☐ | |
| 12 | Sufficient block confirmations waited (6+ for Ethereum) | ☐ | |
| 13 | Confirmation polling implements exponential backoff | ☐ | |
| 14 | Timeout handling prevents infinite waits | ☐ | |
| 15 | Transaction hash stored immediately after submission | ☐ | |
| 16 | Mint not recorded as complete until finality confirmed | ☐ | |
| 17 | Post-confirmation verification of NFT existence | ☐ | |
| 18 | State machine tracks: PENDING → SUBMITTED → CONFIRMED → COMPLETE | ☐ | |
| 19 | Dropped/replaced transactions detected and handled | ☐ | |
| 20 | Network-specific finality requirements documented | ☐ | |

### 3.3 Mint Failure Handling

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 21 | Retry mechanism implemented with exponential backoff | ☐ | |
| 22 | Gas adjustment on "out of gas" failures | ☐ | |
| 23 | Maximum retry attempts configured | ☐ | |
| 24 | Failed transactions logged with full context | ☐ | |
| 25 | User notification on failure | ☐ | |
| 26 | Stuck transaction detection and replacement | ☐ | |
| 27 | Dead letter queue for unrecoverable failures | ☐ | |
| 28 | 429 rate limit errors handled with backoff | ☐ | |
| 29 | Network congestion patterns monitored | ☐ | |
| 30 | Manual recovery process documented | ☐ | |

### 3.4 Metadata Integrity

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 31 | IPFS URIs used (not HTTP gateway URLs) on-chain | ☐ | |
| 32 | Content pinned with reliable pinning service | ☐ | |
| 33 | Multiple pinning providers for redundancy | ☐ | |
| 34 | Metadata follows ERC-721/ERC-1155 standards | ☐ | |
| 35 | Token URI immutable after mint (or controlled) | ☐ | |
| 36 | Metadata validated before mint | ☐ | |
| 37 | CID accessibility verified before minting | ☐ | |
| 38 | Media and metadata stored together on IPFS | ☐ | |
| 39 | Content hash stored on-chain for verification | ☐ | |
| 40 | No mutable centralized URLs in metadata | ☐ | |

### 3.5 Mint Authority & Access Control

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 41 | Mint functions have access control modifiers | ☐ | |
| 42 | Role-based access control implemented | ☐ | |
| 43 | Admin/minter roles properly assigned | ☐ | |
| 44 | Signature verification includes expiration | ☐ | |
| 45 | Signature verification includes nonce | ☐ | |
| 46 | Used signatures tracked to prevent replay | ☐ | |
| 47 | All mint parameters included in signature | ☐ | |
| 48 | Zero address validation on role assignment | ☐ | |
| 49 | Multi-sig for critical admin functions | ☐ | |
| 50 | No public mint functions without validation | ☐ | |

### 3.6 Queue & Batch Operations

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 51 | Rate limiting respected in batch operations | ☐ | |
| 52 | Batch size within recommended limits | ☐ | |
| 53 | Queue management with dead letter handling | ☐ | |
| 54 | Webhooks preferred over polling for status | ☐ | |
| 55 | Gas optimization for batch transactions | ☐ | |
| 56 | Unique identifiers per item in batch | ☐ | |
| 57 | Progress tracking for long-running batches | ☐ | |
| 58 | Resumable batch operations on failure | ☐ | |

### 3.7 Compressed NFT Specifics (Solana)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 59 | Merkle tree sized appropriately for collection | ☐ | |
| 60 | Tree capacity accounts for future growth | ☐ | |
| 61 | DAS API-compatible RPC provider used | ☐ | |
| 62 | Tree public/private setting appropriate | ☐ | |
| 63 | Canopy depth balances cost vs. transaction simplicity | ☐ | |
| 64 | Nonce tracked for unique leaf identification | ☐ | |
| 65 | latestBlockhash obtained just before transaction | ☐ | |
| 66 | Simultaneous mints limited to 15 or fewer | ☐ | |
| 67 | Robust retry mechanism for cNFT mints | ☐ | |
| 68 | Asset ID derivation verified | ☐ | |

### 3.8 Smart Contract Security

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 69 | ReentrancyGuard on mint and callback functions | ☐ | |
| 70 | Check-effects-interactions pattern followed | ☐ | |
| 71 | Integer overflow/underflow protection | ☐ | |
| 72 | No front-running vulnerabilities in mint logic | ☐ | |
| 73 | Randomness uses secure source (Chainlink VRF) | ☐ | |
| 74 | External contract calls minimized and validated | ☐ | |
| 75 | Professional smart contract audit completed | ☐ | |
| 76 | Contract follows established NFT standards | ☐ | |
| 77 | Gas limits tested under various conditions | ☐ | |
| 78 | Emergency pause functionality available | ☐ | |

---

---

## 37 - 37-wallet-key-management

### 3.1 Private Key Storage

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Private keys are NEVER stored in source code | ☐ | |
| 2 | Private keys are NEVER stored in environment variables | ☐ | |
| 3 | Private keys are stored in HSM or KMS | ☐ | |
| 4 | HSM/KMS has FIPS 140-3 Level 3 certification (minimum) | ☐ | |
| 5 | Key material never leaves HSM unencrypted | ☐ | |
| 6 | Hardware-based true random number generator (TRNG) used for key generation | ☐ | |
| 7 | Encrypted backups exist in geographically distributed locations | ☐ | |
| 8 | Backup recovery procedures documented and tested | ☐ | |
| 9 | Key access requires multi-factor authentication | ☐ | |
| 10 | All key operations are comprehensively logged | ☐ | |

### 3.2 Wallet Architecture

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 11 | Tiered wallet structure implemented (hot/warm/cold) | ☐ | |
| 12 | Hot wallet holds ≤5% of total funds | ☐ | |
| 13 | Cold storage holds ≥80% of total funds | ☐ | |
| 14 | Multiple hot wallets with independent key storage | ☐ | |
| 15 | Wallets segregated by purpose (operations, reserves, user funds) | ☐ | |
| 16 | Per-transaction spending limits enforced | ☐ | |
| 17 | Daily withdrawal limits configured | ☐ | |
| 18 | Time-delayed transactions for large amounts | ☐ | |
| 19 | User assets backed 1-to-1 in segregated cold storage | ☐ | |
| 20 | Address allowlisting (whitelisting) enabled | ☐ | |

### 3.3 Multi-Signature / MPC Configuration

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 21 | Multi-signature or MPC required for all significant transactions | ☐ | |
| 22 | Threshold avoids N-of-N (prevents single key loss lockout) | ☐ | |
| 23 | Minimum 3-of-5 for operational wallets | ☐ | |
| 24 | Minimum 4-of-7 for treasury/reserve wallets | ☐ | |
| 25 | Signer keys stored on separate devices | ☐ | |
| 26 | Signer keys in different geographic locations | ☐ | |
| 27 | Signer key rotation procedure documented | ☐ | |
| 28 | Timelocks implemented for critical operations | ☐ | |
| 29 | Role-based access control with least privilege | ☐ | |
| 30 | Disaster recovery plan documented and tested | ☐ | |

### 3.4 Transaction Signing Security

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 31 | Dedicated, hardened signing devices used | ☐ | |
| 32 | Signing devices air-gapped or network-restricted | ☐ | |
| 33 | Transaction simulation required before signing | ☐ | |
| 34 | Recipient address verified through multiple channels | ☐ | |
| 35 | Raw transaction data independently verified | ☐ | |
| 36 | Out-of-band verification for admin/large transactions | ☐ | |
| 37 | Signing errors trigger transaction scrutiny process | ☐ | |
| 38 | Hardware wallet displays used as source of truth | ☐ | |
| 39 | Token approval limits restricted (never unlimited) | ☐ | |
| 40 | All signed transactions logged with full audit trail | ☐ | |

### 3.5 Key Rotation

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 41 | Key rotation capability designed into architecture | ☐ | |
| 42 | Rotation procedures documented | ☐ | |
| 43 | Regular rotation schedule established (quarterly minimum) | ☐ | |
| 44 | Rotation procedures tested successfully | ☐ | |
| 45 | Emergency rotation procedure defined | ☐ | |
| 46 | Old keys securely destroyed after rotation | ☐ | |
| 47 | Key rotation logged and auditable | ☐ | |
| 48 | MPC key share refresh capability (if applicable) | ☐ | |

### 3.6 Monitoring and Alerting

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 49 | Real-time transaction monitoring implemented | ☐ | |
| 50 | Balance change alerts configured | ☐ | |
| 51 | Threshold alerts for large transactions | ☐ | |
| 52 | Outgoing transaction alerts (all amounts) | ☐ | |
| 53 | Contract approval/permission change alerts | ☐ | |
| 54 | Multiple notification channels configured | ☐ | |
| 55 | 24/7 monitoring coverage established | ☐ | |
| 56 | Incident response procedures documented | ☐ | |
| 57 | Address labeling for known threat actors | ☐ | |
| 58 | Cross-chain monitoring for multi-chain wallets | ☐ | |

### 3.7 Access Controls

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 59 | Transaction approval workflows implemented | ☐ | |
| 60 | Multiple reviewers required for significant transactions | ☐ | |
| 61 | Spending limits enforced with escalation procedures | ☐ | |
| 62 | Strong authentication (2FA minimum) for wallet access | ☐ | |
| 63 | Hardware security keys used for authentication | ☐ | |
| 64 | Session timeouts configured appropriately | ☐ | |
| 65 | Audit logs capture all access and operations | ☐ | |
| 66 | Regular access reviews conducted | ☐ | |
| 67 | Offboarding procedures include key revocation | ☐ | |
| 68 | Insider threat detection measures in place | ☐ | |

### 3.8 Operational Security

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 69 | Staff trained on phishing and social engineering | ☐ | |
| 70 | Security awareness program in place | ☐ | |
| 71 | Seed phrases stored offline only | ☐ | |
| 72 | Hardware wallets purchased from authorized vendors only | ☐ | |
| 73 | Public Wi-Fi never used for wallet operations | ☐ | |
| 74 | VPN used for all remote wallet access | ☐ | |
| 75 | Regular security audits conducted | ☐ | |
| 76 | Penetration testing includes wallet infrastructure | ☐ | |
| 77 | Dependency scanning for supply chain risks | ☐ | |
| 78 | Software updates verified before installation | ☐ | |

---

---

## 38 - 38-time-sensitive-operations

Use this checklist to verify time-sensitive operations in your systems.

### 3.1 Timezone Handling

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | All timestamps stored in UTC in database | ☐ | |
| 2 | Database columns use TIMESTAMP WITH TIME ZONE | ☐ | |
| 3 | Server system timezone configured as UTC | ☐ | |
| 4 | ISO 8601 format used for API date/time fields | ☐ | |
| 5 | Timezone suffix (Z or offset) included in all timestamps | ☐ | |
| 6 | IANA timezone identifiers used (not abbreviations) | ☐ | |
| 7 | User timezone stored in profile/preferences | ☐ | |
| 8 | Timezone conversion happens only at presentation layer | ☐ | |
| 9 | Future events store both UTC and original timezone | ☐ | |
| 10 | IANA timezone database kept up to date | ☐ | |

### 3.2 Cutoff Time Enforcement

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 11 | All cutoff times enforced server-side | ☐ | |
| 12 | Server uses its own clock, not client-provided time | ☐ | |
| 13 | Cutoff times stored in database, not hardcoded | ☐ | |
| 14 | Deadline checks occur before any data processing | ☐ | |
| 15 | Clear error messages returned when deadline passed | ☐ | |
| 16 | Cutoff bypass requires admin authentication | ☐ | |
| 17 | All cutoff violations logged with details | ☐ | |
| 18 | Grace periods explicitly defined and documented | ☐ | |
| 19 | Deadlines displayed with explicit timezone | ☐ | |
| 20 | Email/notification times match enforced deadlines | ☐ | |

### 3.3 Clock Synchronization

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 21 | NTP or equivalent configured on all servers | ☐ | |
| 22 | Multiple NTP sources configured for redundancy | ☐ | |
| 23 | NTP authentication enabled | ☐ | |
| 24 | Clock offset monitoring in place | ☐ | |
| 25 | Alerts configured for clock drift > threshold | ☐ | |
| 26 | Clock sync status included in health checks | ☐ | |
| 27 | Stratum level documented and appropriate | ☐ | |
| 28 | NTP traffic not blocked by firewalls | ☐ | |
| 29 | Containerized services sync with host clock | ☐ | |
| 30 | Clock sync tested after infrastructure changes | ☐ | |

### 3.4 Scheduled State Transitions

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 31 | Scheduled jobs use distributed lock | ☐ | |
| 32 | Jobs are idempotent (safe to run twice) | ☐ | |
| 33 | Job execution status persisted | ☐ | |
| 34 | Failed jobs have retry mechanism | ☐ | |
| 35 | Job execution logs capture start/end/status | ☐ | |
| 36 | Monitoring alerts on job failures | ☐ | |
| 37 | Jobs can be manually triggered for recovery | ☐ | |
| 38 | State transitions are atomic | ☐ | |
| 39 | State machine documented with valid transitions | ☐ | |
| 40 | Scheduler handles timezone/DST changes correctly | ☐ | |

### 3.5 Time-Based Access Control

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 41 | Session timeouts enforced server-side | ☐ | |
| 42 | Session timeout appropriate for risk level | ☐ | |
| 43 | Token expiration validated on every request | ☐ | |
| 44 | JWT exp claim checked with clock skew tolerance | ☐ | |
| 45 | Access windows enforced at authorization layer | ☐ | |
| 46 | Temporary access grants auto-expire | ☐ | |
| 47 | Time-based policies documented and reviewed | ☐ | |
| 48 | Access denials due to time logged | ☐ | |
| 49 | Emergency access procedures defined | ☐ | |
| 50 | Access window changes require approval workflow | ☐ | |

### 3.6 Race Condition Prevention

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 51 | Critical time-checks use database transactions | ☐ | |
| 52 | Appropriate isolation level set (SERIALIZABLE for critical) | ☐ | |
| 53 | Row-level locking used for concurrent updates | ☐ | |
| 54 | Idempotency keys prevent duplicate operations | ☐ | |
| 55 | Optimistic locking implemented where appropriate | ☐ | |
| 56 | Race conditions tested with concurrent requests | ☐ | |
| 57 | Boundary conditions tested (exactly at deadline) | ☐ | |
| 58 | State changes validated before and during operation | ☐ | |

### 3.7 Client-Side Security

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 59 | No security decisions rely on client-provided time | ☐ | |
| 60 | Server time returned in API responses for display | ☐ | |
| 61 | Mobile apps verify time against server | ☐ | |
| 62 | Trial/licensing checks performed server-side | ☐ | |
| 63 | Audit logs use server timestamps only | ☐ | |
| 64 | TOTP validation allows reasonable clock skew | ☐ | |
| 65 | Certificate validation uses system time securely | ☐ | |

### 3.8 Audit and Compliance

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 66 | All time-based rules documented | ☐ | |
| 67 | Time-sensitive operations logged with timestamps | ☐ | |
| 68 | Log timestamps include timezone information | ☐ | |
| 69 | Logs stored in UTC with source timezone noted | ☐ | |
| 70 | Audit trail shows who changed time-based rules | ☐ | |
| 71 | Time synchronization logs retained | ☐ | |
| 72 | Compliance requirements for time accuracy documented | ☐ | |
| 73 | Regular review of time-based access policies | ☐ | |
| 74 | Incident response procedure for time-related issues | ☐ | |
| 75 | Backup procedures account for time-sensitive data | ☐ | |

---

