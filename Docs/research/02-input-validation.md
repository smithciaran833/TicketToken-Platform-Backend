# Input Validation Standards & Best Practices
## TicketToken Platform - Comprehensive Research Document

**Stack:** Node.js/TypeScript/Fastify, PostgreSQL/Knex, Redis, Stripe, Solana, Microservices Architecture

---

## Table of Contents

1. [Standards & Best Practices](#1-standards--best-practices)
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist](#3-audit-checklist)
4. [Sources & References](#4-sources--references)

---

## 1. Standards & Best Practices

### 1.1 Schema Validation Approaches

#### Library Comparison for Fastify + TypeScript

| Library | Strengths | Weaknesses | Fastify Fit |
|---------|-----------|------------|-------------|
| **TypeBox** | Native Fastify integration, compiles to JSON Schema, TypeScript inference | Less expressive custom validators | ✅ Best choice |
| **Zod** | Excellent TS inference, rich transforms, ecosystem | Requires `fastify-type-provider-zod` adapter | ✅ Good alternative |
| **Joi** | Mature, expressive, good error messages | No native TS inference, heavier | ⚠️ Legacy choice |
| **JSON Schema** | Standard, Fastify-native via Ajv | Verbose, weak TS integration | ✅ Direct use |

**Recommendation for TicketToken:** TypeBox is optimal for Fastify + TypeScript. It compiles to JSON Schema (Fastify's native validation via Ajv) and provides compile-time type inference.

**Source:** https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/

#### TypeBox Setup for Fastify

```typescript
import Fastify from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

const app = Fastify().withTypeProvider<TypeBoxTypeProvider>();

// Define schema with TypeBox
const CreateEventSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.String({ maxLength: 5000 })),
  venue_id: Type.String({ format: 'uuid' }),
  start_date: Type.String({ format: 'date-time' }),
  end_date: Type.String({ format: 'date-time' }),
  price_cents: Type.Integer({ minimum: 0, maximum: 100000000 }),
  total_tickets: Type.Integer({ minimum: 1, maximum: 1000000 }),
  ticket_types: Type.Array(Type.Object({
    name: Type.String({ minLength: 1 }),
    price_cents: Type.Integer({ minimum: 0 }),
    quantity: Type.Integer({ minimum: 1 })
  }), { minItems: 1, maxItems: 50 })
});

// TypeScript type is automatically inferred
type CreateEventInput = Static<typeof CreateEventSchema>;

// Route with validation
app.post('/events', {
  schema: {
    body: CreateEventSchema,
    response: {
      201: Type.Object({
        id: Type.String({ format: 'uuid' }),
        name: Type.String()
      })
    }
  }
}, async (request, reply) => {
  // request.body is fully typed as CreateEventInput
  const event = await eventService.create(request.body);
  return reply.status(201).send(event);
});
```

**Source:** https://github.com/sinclairzx81/typebox

---

### 1.2 Validation Placement in Request Lifecycle

```
Request → [1] Schema Validation → [2] Authentication → [3] Authorization 
        → [4] Business Validation → [5] Sanitization → [6] Database
```

| Layer | What to Validate | Example (TicketToken) |
|-------|------------------|----------------------|
| **1. Schema (Fastify)** | Types, formats, required fields, ranges | `price_cents` is integer ≥ 0 |
| **2. Authentication** | Token validity, user exists | JWT signature valid |
| **3. Authorization** | Permissions, ownership | User owns event they're editing |
| **4. Business Logic** | Domain rules, state validity | Event date is in future, tickets available |
| **5. Sanitization** | Encode output, strip dangerous content | HTML encode event descriptions |
| **6. Database** | Constraints, foreign keys | `venue_id` exists in venues table |

**OWASP Principle:** "Input validation should happen as early as possible in the data flow, preferably as soon as the data is received from the external party."

**Source:** https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html

---

### 1.3 Syntactic vs Semantic Validation

#### Syntactic Validation (Schema Layer)

Validates the **structure and format** of data:

```typescript
// TypeBox schema for syntactic validation
const TicketPurchaseSchema = Type.Object({
  event_id: Type.String({ format: 'uuid' }),
  quantity: Type.Integer({ minimum: 1, maximum: 10 }),
  payment_method_id: Type.String({ minLength: 1 }),
  promo_code: Type.Optional(Type.String({ pattern: '^[A-Z0-9]{4,20}$' }))
});
```

**What syntactic validation catches:**
- Wrong data types (`quantity: "five"` instead of `5`)
- Missing required fields
- Format violations (invalid UUID, email, date)
- Length/range violations

#### Semantic Validation (Business Layer)

Validates the **meaning and business rules**:

```typescript
// Service layer semantic validation
async function validateTicketPurchase(input: TicketPurchaseInput, userId: string) {
  const event = await eventRepo.findById(input.event_id);
  
  // Semantic validations
  if (!event) {
    throw new NotFoundError('Event not found');
  }
  
  if (event.status !== 'on_sale') {
    throw new BusinessError('Event is not currently on sale');
  }
  
  if (event.start_date < new Date()) {
    throw new BusinessError('Event has already started');
  }
  
  if (event.available_tickets < input.quantity) {
    throw new BusinessError('Not enough tickets available', {
      available: event.available_tickets,
      requested: input.quantity
    });
  }
  
  if (input.promo_code) {
    const promo = await promoRepo.findByCode(input.promo_code);
    if (!promo || promo.expires_at < new Date()) {
      throw new ValidationError('Invalid or expired promo code');
    }
  }
}
```

**Source:** https://owasp.org/www-project-proactive-controls/v3/en/c5-validate-inputs

---

### 1.4 Type Coercion Risks

#### The Problem

Fastify/Ajv performs type coercion by default, which can lead to unexpected behavior:

```typescript
// Schema expects integer
const schema = Type.Object({
  quantity: Type.Integer()
});

// These inputs get coerced:
{ quantity: "5" }     // → { quantity: 5 } ✓ (string to int)
{ quantity: 5.9 }     // → { quantity: 5 } ⚠️ (truncated!)
{ quantity: "5abc" }  // → { quantity: 5 } ⚠️ (partial parse!)
{ quantity: true }    // → { quantity: 1 } ⚠️ (boolean to int!)
```

#### Safe Configuration

```typescript
import Fastify from 'fastify';
import Ajv from 'ajv';

const app = Fastify({
  ajv: {
    customOptions: {
      // Disable coercion for stricter validation
      coerceTypes: false,
      // Remove additional properties not in schema
      removeAdditional: true,
      // Use all validation keywords
      useDefaults: true,
      // Enable all errors (not just first)
      allErrors: true
    }
  }
});
```

#### When Coercion is Acceptable

Query parameters legitimately come as strings:

```typescript
// For query strings, coercion makes sense
const PaginationSchema = Type.Object({
  page: Type.Integer({ minimum: 1, default: 1 }),
  limit: Type.Integer({ minimum: 1, maximum: 100, default: 20 })
});

// GET /events?page=2&limit=50
// page and limit arrive as strings, coercion to int is fine

// For body (JSON), coercion should be disabled
// JSON already has types - don't silently convert
```

**Source:** https://ajv.js.org/coercion.html

---

### 1.5 Sanitization vs Validation

| Aspect | Validation | Sanitization |
|--------|------------|--------------|
| **Purpose** | Reject invalid input | Transform input to safe form |
| **Action** | Accept or reject | Modify and accept |
| **When** | Before processing | Before output/storage |
| **Example** | Reject if email invalid | Encode `<script>` as `&lt;script&gt;` |

#### Validation (Reject Bad Input)

```typescript
// VALIDATE: Reject if invalid
const EmailSchema = Type.String({ 
  format: 'email',
  maxLength: 254 
});

// If email doesn't match, request fails with 400/422
```

#### Sanitization (Transform Input)

```typescript
import DOMPurify from 'isomorphic-dompurify';
import { escape } from 'html-escaper';

// SANITIZE: Clean HTML content
function sanitizeEventDescription(html: string): string {
  // Allow only safe HTML tags
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a'],
    ALLOWED_ATTR: ['href']
  });
}

// SANITIZE: Escape for plain text display
function escapeForDisplay(text: string): string {
  return escape(text);
}
```

#### When to Use Each

| Scenario | Approach |
|----------|----------|
| Email format | **Validate** - reject if invalid |
| Integer range | **Validate** - reject if out of bounds |
| Rich text (descriptions) | **Sanitize** - strip dangerous HTML |
| Display user input | **Sanitize** - HTML encode before output |
| SQL parameters | **Neither** - use parameterized queries |
| File names | **Both** - validate extension, sanitize path characters |

**OWASP Guidance:** "Input validation should NOT be used as the primary method of preventing XSS, SQL Injection - use parameterized queries and output encoding. But validation provides defense in depth."

**Source:** https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html

---

### 1.6 Nested Object and Array Validation

#### TypeBox Nested Schemas

```typescript
import { Type, Static } from '@sinclair/typebox';

// Reusable nested schemas
const AddressSchema = Type.Object({
  street: Type.String({ minLength: 1, maxLength: 200 }),
  city: Type.String({ minLength: 1, maxLength: 100 }),
  state: Type.String({ minLength: 2, maxLength: 2 }),
  zip: Type.String({ pattern: '^[0-9]{5}(-[0-9]{4})?$' }),
  country: Type.String({ minLength: 2, maxLength: 2 })
});

const TicketTypeSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  description: Type.Optional(Type.String({ maxLength: 500 })),
  price_cents: Type.Integer({ minimum: 0, maximum: 100000000 }),
  quantity: Type.Integer({ minimum: 1, maximum: 100000 }),
  max_per_order: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 }))
});

// Complex schema with nesting
const CreateEventSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.String({ maxLength: 10000 }),
  
  // Nested object
  venue: Type.Object({
    name: Type.String({ minLength: 1 }),
    address: AddressSchema,
    capacity: Type.Integer({ minimum: 1 })
  }),
  
  // Array of objects with constraints
  ticket_types: Type.Array(TicketTypeSchema, {
    minItems: 1,
    maxItems: 50
  }),
  
  // Array of primitives
  tags: Type.Optional(Type.Array(
    Type.String({ minLength: 1, maxLength: 50 }),
    { maxItems: 20, uniqueItems: true }
  )),
  
  // Nested optional object
  settings: Type.Optional(Type.Object({
    require_approval: Type.Boolean({ default: false }),
    allow_transfers: Type.Boolean({ default: true }),
    refund_policy: Type.Union([
      Type.Literal('full'),
      Type.Literal('partial'),
      Type.Literal('none')
    ])
  }))
});

type CreateEventInput = Static<typeof CreateEventSchema>;
```

#### Array Validation Considerations

```typescript
// IMPORTANT: Always set array limits
const BadSchema = Type.Array(Type.String());  // ❌ No limits!

const GoodSchema = Type.Array(
  Type.String({ maxLength: 100 }),
  { 
    minItems: 0,
    maxItems: 1000,  // Prevent memory exhaustion
    uniqueItems: true  // Optional: no duplicates
  }
);

// For large arrays, consider pagination instead
const BulkOperationSchema = Type.Object({
  ids: Type.Array(
    Type.String({ format: 'uuid' }),
    { minItems: 1, maxItems: 100 }  // Force batching
  )
});
```

---

### 1.7 File Upload Validation

#### OWASP File Upload Best Practices

```typescript
import { FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { fileTypeFromBuffer } from 'file-type';
import crypto from 'crypto';
import path from 'path';

// Configuration
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf'
]);

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf']);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

async function registerFileUpload(app: FastifyInstance) {
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: MAX_FILE_SIZE,
      files: 5,  // Max files per request
      fields: 10  // Max non-file fields
    }
  });
  
  app.post('/upload', async (request, reply) => {
    const file = await request.file();
    
    if (!file) {
      throw new ValidationError('No file provided');
    }
    
    // 1. Validate file extension (allowlist)
    const ext = path.extname(file.filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new ValidationError('File type not allowed', {
        allowed: Array.from(ALLOWED_EXTENSIONS)
      });
    }
    
    // 2. Read file buffer
    const buffer = await file.toBuffer();
    
    // 3. Validate actual file type (magic bytes)
    const detectedType = await fileTypeFromBuffer(buffer);
    if (!detectedType || !ALLOWED_MIME_TYPES.has(detectedType.mime)) {
      throw new ValidationError('Invalid file content type');
    }
    
    // 4. Verify extension matches content
    const expectedExt = '.' + detectedType.ext;
    if (ext !== expectedExt && !(ext === '.jpg' && expectedExt === '.jpeg')) {
      throw new ValidationError('File extension does not match content');
    }
    
    // 5. Generate safe filename (never use user-provided filename)
    const safeFilename = `${crypto.randomUUID()}${expectedExt}`;
    
    // 6. Store outside webroot
    const storagePath = `/secure-storage/uploads/${safeFilename}`;
    
    // 7. Scan for malware (integrate with antivirus)
    // await antivirusService.scan(buffer);
    
    // 8. Store file
    await storageService.save(storagePath, buffer);
    
    return { 
      id: safeFilename,
      url: `/api/files/${safeFilename}`  // Serve through handler, not direct
    };
  });
}
```

#### File Upload Security Checklist

| Check | Implementation |
|-------|----------------|
| Extension allowlist | Only permit known-safe extensions |
| Content-Type validation | Check magic bytes, not just header |
| Size limits | Enforce maximum file size |
| Filename sanitization | Generate new filename, never use user input |
| Storage location | Store outside webroot |
| Access control | Serve through authenticated handler |
| Malware scanning | Integrate antivirus/CDR |
| Rate limiting | Limit uploads per user/time |

**Source:** https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Missing Validation on HTTP Methods

**VULNERABILITY:** Validating GET but not POST/PUT/DELETE on same resource.

```typescript
// ❌ BAD: Validation only on GET
app.get('/events/:id', {
  schema: {
    params: Type.Object({
      id: Type.String({ format: 'uuid' })
    })
  }
}, getEventHandler);

app.delete('/events/:id', deleteEventHandler);  // No validation!

// ✅ GOOD: Validate all methods
const EventIdParams = Type.Object({
  id: Type.String({ format: 'uuid' })
});

app.get('/events/:id', { schema: { params: EventIdParams } }, getEventHandler);
app.put('/events/:id', { schema: { params: EventIdParams, body: UpdateEventSchema } }, updateEventHandler);
app.delete('/events/:id', { schema: { params: EventIdParams } }, deleteEventHandler);
```

**Best Practice:** Create shared schema definitions and apply to ALL route methods.

---

### 2.2 Trusting Client-Side Validation

**VULNERABILITY:** Relying on frontend validation without server-side checks.

```typescript
// ❌ BAD: Assuming frontend validated
app.post('/events', async (request, reply) => {
  // "Frontend already validated this"
  const event = await eventService.create(request.body);
  return event;
});

// ✅ GOOD: Always validate server-side
app.post('/events', {
  schema: {
    body: CreateEventSchema  // Server validates regardless of client
  }
}, async (request, reply) => {
  const event = await eventService.create(request.body);
  return event;
});
```

**OWASP Guidance:** "Perform input validation on both client-side (for usability) and server-side (for security). Never rely solely on client-side validation."

**Source:** https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html

---

### 2.3 Prototype Pollution

**VULNERABILITY:** Attacker modifies `Object.prototype` through malicious input, affecting all objects.

#### How It Happens

```javascript
// Vulnerable merge function
function merge(target, source) {
  for (let key in source) {
    if (typeof source[key] === 'object') {
      target[key] = merge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// Attacker sends:
const maliciousPayload = JSON.parse('{"__proto__": {"isAdmin": true}}');

// After merge, ALL objects have isAdmin: true
const user = {};
console.log(user.isAdmin);  // true! 😱
```

#### Prevention Strategies

```typescript
// 1. Use Object.create(null) for dictionaries
const safeObject = Object.create(null);
safeObject.__proto__ = 'ignored';  // Has no effect

// 2. Freeze Object.prototype (defense in depth)
Object.freeze(Object.prototype);

// 3. Use Map instead of Object for key-value storage
const userSettings = new Map<string, any>();

// 4. Block dangerous keys in schemas
const SafeObjectSchema = Type.Object({}, {
  additionalProperties: false  // Reject unknown properties
});

// 5. Sanitize keys before property access
function safeGet(obj: any, key: string): any {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    throw new ValidationError('Invalid property name');
  }
  return obj[key];
}

// 6. Use Node.js --disable-proto flag
// node --disable-proto=delete app.js
```

#### Ajv Protection

```typescript
// Ajv (Fastify's validator) blocks __proto__ by default
// But ensure additionalProperties is configured correctly

const StrictSchema = Type.Object({
  name: Type.String(),
  value: Type.Any()
}, {
  additionalProperties: false  // Reject extra properties
});
```

**Source:** https://portswigger.net/web-security/prototype-pollution

---

### 2.4 Mass Assignment / Unexpected Fields

**VULNERABILITY:** Accepting more fields than expected, allowing attackers to modify protected properties.

#### The Attack

```typescript
// User model has: id, email, name, password_hash, is_admin, created_at

// API expects:
{ "email": "user@example.com", "name": "John" }

// Attacker sends:
{ "email": "user@example.com", "name": "John", "is_admin": true }

// ❌ BAD: Spreads all properties
app.put('/users/:id', async (request, reply) => {
  await db('users').where({ id: request.params.id }).update(request.body);
});
// Result: User becomes admin!
```

#### Prevention

```typescript
// ✅ GOOD: Strict schema with additionalProperties: false
const UpdateUserSchema = Type.Object({
  email: Type.Optional(Type.String({ format: 'email' })),
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 100 }))
}, {
  additionalProperties: false  // CRITICAL: Reject unknown fields
});

app.put('/users/:id', {
  schema: {
    body: UpdateUserSchema
  }
}, async (request, reply) => {
  // request.body can ONLY have email and name
  await userService.update(request.params.id, request.body);
});

// ✅ ALSO GOOD: Explicit field picking
app.put('/users/:id', async (request, reply) => {
  const { email, name } = request.body;  // Only pick allowed fields
  await db('users')
    .where({ id: request.params.id })
    .update({ email, name });  // Explicit fields only
});
```

#### Knex-Specific Protection

```typescript
// Create an allowlist helper
function pickAllowed<T extends object>(
  data: T,
  allowedFields: (keyof T)[]
): Partial<T> {
  const result: Partial<T> = {};
  for (const field of allowedFields) {
    if (field in data) {
      result[field] = data[field];
    }
  }
  return result;
}

// Usage in repository
class UserRepository {
  private static UPDATABLE_FIELDS = ['email', 'name', 'phone'] as const;
  
  async update(id: string, data: Partial<User>): Promise<User> {
    const safeData = pickAllowed(data, UserRepository.UPDATABLE_FIELDS);
    return this.db('users').where({ id }).update(safeData).returning('*');
  }
}
```

**Source:** https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html

---

### 2.5 Type Confusion Attacks

**VULNERABILITY:** Exploiting type coercion or loose comparisons.

#### Examples

```typescript
// ❌ BAD: Loose equality with type coercion
if (user.role == 1) {  // "1" == 1 is true!
  grantAdminAccess();
}

// Attacker sends role as string "1" and bypasses integer check

// ❌ BAD: Array vs string confusion
const query = request.query;
// Expected: ?id=123
// Attacker sends: ?id=123&id=456
// query.id might be ['123', '456'] instead of '123'

// ❌ BAD: Object vs primitive confusion
function processUser(user: any) {
  if (user.id) {  // Could be { id: { $gt: 0 } } (NoSQL injection!)
    // ...
  }
}
```

#### Prevention

```typescript
// ✅ GOOD: Use strict equality
if (user.role === 1) {
  grantAdminAccess();
}

// ✅ GOOD: Strict schema validation prevents type confusion
const QuerySchema = Type.Object({
  id: Type.String({ format: 'uuid' })  // Must be string, not array
});

// ✅ GOOD: TypeScript with strict mode
// tsconfig.json: "strict": true

// ✅ GOOD: Explicit type checking
function processId(id: unknown): string {
  if (typeof id !== 'string') {
    throw new ValidationError('ID must be a string');
  }
  return id;
}
```

---

### 2.6 Boundary Value Problems

**VULNERABILITY:** Off-by-one errors, integer overflow, precision loss.

#### Integer Overflow

```typescript
// ❌ BAD: No upper limit
const QuantitySchema = Type.Integer({ minimum: 1 });
// Attacker sends: 9999999999999999999
// JavaScript: Number.MAX_SAFE_INTEGER = 9007199254740991

// ✅ GOOD: Set reasonable bounds
const QuantitySchema = Type.Integer({ 
  minimum: 1, 
  maximum: 10000  // Business-appropriate limit
});
```

#### Precision Loss

```typescript
// ❌ BAD: Using floating point for money
const price = 19.99;
const quantity = 3;
const total = price * quantity;  // 59.97000000000001 😱

// ✅ GOOD: Use integers (cents) for money
const PriceSchema = Type.Integer({ 
  minimum: 0, 
  maximum: 100000000  // $1,000,000 max
});
// Store as cents, display as dollars
```

#### Array Index Issues

```typescript
// ❌ BAD: Direct array access without bounds check
function getTicketType(types: TicketType[], index: number) {
  return types[index];  // Could be undefined or out of bounds
}

// ✅ GOOD: Validate index
function getTicketType(types: TicketType[], index: number) {
  if (index < 0 || index >= types.length) {
    throw new ValidationError('Invalid ticket type index');
  }
  return types[index];
}
```

---

### 2.7 Unicode and Encoding Issues

**VULNERABILITY:** Unicode normalization, homograph attacks, encoding bypass.

#### Unicode Normalization

```typescript
// Different Unicode representations of same character
const a1 = 'é';           // Single character: U+00E9
const a2 = 'é';           // e + combining accent: U+0065 U+0301

a1 === a2;  // false! But look identical
a1.length;  // 1
a2.length;  // 2

// ✅ GOOD: Normalize before validation/comparison
import { normalize } from 'unorm';

function normalizeInput(input: string): string {
  return input.normalize('NFC');  // Canonical composition
}

// Or use TypeBox transform
const NormalizedStringSchema = Type.Transform(Type.String())
  .Decode(value => value.normalize('NFC'))
  .Encode(value => value);
```

#### Homograph Attacks

```typescript
// Cyrillic 'а' (U+0430) looks like Latin 'a' (U+0061)
const fake = 'pаypal.com';  // Uses Cyrillic 'а'
const real = 'paypal.com';  // Uses Latin 'a'

fake === real;  // false

// ✅ GOOD: Restrict to ASCII for critical fields
const UsernameSchema = Type.String({
  pattern: '^[a-zA-Z0-9_-]{3,30}$'  // ASCII only
});

// ✅ GOOD: For URLs, validate against known domains
function validateRedirectUrl(url: string): boolean {
  const parsed = new URL(url);
  const allowedDomains = ['tickettoken.com', 'www.tickettoken.com'];
  return allowedDomains.includes(parsed.hostname);
}
```

#### Encoding Bypass

```typescript
// Attacker might try different encodings to bypass filters
const variants = [
  '<script>',           // Plain
  '%3Cscript%3E',       // URL encoded
  '&#60;script&#62;',   // HTML entities
  '\u003Cscript\u003E', // Unicode escape
];

// ✅ GOOD: Decode before validation, encode on output
function validateInput(input: string): string {
  // Decode any encoding first
  const decoded = decodeURIComponent(input);
  
  // Validate decoded value
  if (/<script/i.test(decoded)) {
    throw new ValidationError('Invalid content');
  }
  
  return decoded;
}

// On output, always encode for context
function outputToHtml(text: string): string {
  return escapeHtml(text);
}
```

**Source:** https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html

---

### 2.8 SQL Injection with Knex

**VULNERABILITY:** Improper use of Knex allowing SQL injection.

#### Unsafe Patterns

```typescript
// ❌ BAD: Raw query with string concatenation
const results = await db.raw(`SELECT * FROM events WHERE name = '${name}'`);

// ❌ BAD: whereRaw without bindings
const results = await db('events').whereRaw(`name = '${name}'`);

// ❌ BAD: Dynamic column names from user input
const results = await db('events').orderBy(request.query.sortBy);
// Attacker sends: sortBy=name; DROP TABLE events;--
```

#### Safe Patterns

```typescript
// ✅ GOOD: Parameterized query builder
const results = await db('events').where({ name });

// ✅ GOOD: Raw with bindings (positional)
const results = await db.raw('SELECT * FROM events WHERE name = ?', [name]);

// ✅ GOOD: Raw with named bindings
const results = await db.raw(
  'SELECT * FROM events WHERE name = :name AND venue_id = :venueId',
  { name, venueId }
);

// ✅ GOOD: Allowlist for dynamic columns
const ALLOWED_SORT_COLUMNS = ['name', 'start_date', 'created_at'] as const;

function getSortColumn(input: string): string {
  if (!ALLOWED_SORT_COLUMNS.includes(input as any)) {
    throw new ValidationError('Invalid sort column');
  }
  return input;
}

const results = await db('events')
  .orderBy(getSortColumn(request.query.sortBy));

// ✅ GOOD: Use Knex's safe identifier escaping
const column = db.client.wrapIdentifier(userInput);
```

**Source:** https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html

---

## 3. Audit Checklist

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

## 4. Sources & References

### OWASP Resources

1. **OWASP Input Validation Cheat Sheet**
   https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html

2. **OWASP SQL Injection Prevention Cheat Sheet**
   https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html

3. **OWASP File Upload Cheat Sheet**
   https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html

4. **OWASP Mass Assignment Cheat Sheet**
   https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html

5. **OWASP Prototype Pollution Prevention Cheat Sheet**
   https://cheatsheetseries.owasp.org/cheatsheets/Prototype_Pollution_Prevention_Cheat_Sheet.html

6. **OWASP Proactive Controls - Validate All Input**
   https://owasp.org/www-project-proactive-controls/v3/en/c5-validate-inputs

### Fastify & TypeBox

7. **Fastify Validation and Serialization**
   https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/

8. **Fastify Type Providers**
   https://fastify.dev/docs/latest/Reference/Type-Providers/

9. **TypeBox GitHub Repository**
   https://github.com/sinclairzx81/typebox

10. **@fastify/type-provider-typebox**
    https://github.com/fastify/fastify-type-provider-typebox

### Security Research

11. **Prototype Pollution - PortSwigger**
    https://portswigger.net/web-security/prototype-pollution

12. **Server-Side Prototype Pollution - PortSwigger**
    https://portswigger.net/web-security/prototype-pollution/server-side

13. **Silent Spring: Prototype Pollution Leads to RCE in Node.js**
    https://www.usenix.org/conference/usenixsecurity23/presentation/shcherbakov

14. **Node.js Security Best Practices**
    https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html

### Additional Resources

15. **Ajv JSON Schema Validator**
    https://ajv.js.org/

16. **MDN: Prototype Pollution**
    https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Prototype_pollution

17. **Knex.js Documentation**
    https://knexjs.org/

---

## Quick Reference Card

### TypeBox Schema Template

```typescript
const EntitySchema = Type.Object({
  // IDs
  id: Type.String({ format: 'uuid' }),
  
  // Strings
  name: Type.String({ minLength: 1, maxLength: 200 }),
  email: Type.String({ format: 'email', maxLength: 254 }),
  
  // Numbers
  price_cents: Type.Integer({ minimum: 0, maximum: 100000000 }),
  
  // Dates
  created_at: Type.String({ format: 'date-time' }),
  
  // Enums
  status: Type.Union([
    Type.Literal('draft'),
    Type.Literal('active'),
    Type.Literal('archived')
  ]),
  
  // Arrays
  tags: Type.Array(
    Type.String({ minLength: 1, maxLength: 50 }),
    { maxItems: 20 }
  ),
  
  // Nested objects
  metadata: Type.Optional(Type.Object({
    key: Type.String()
  })),
  
  // Nullable
  deleted_at: Type.Union([Type.String({ format: 'date-time' }), Type.Null()])
  
}, { additionalProperties: false });  // ALWAYS include this
```

### Validation Error Response (RFC 7807)

```json
{
  "type": "https://api.tickettoken.com/errors/validation",
  "title": "Validation Failed",
  "status": 422,
  "detail": "One or more fields failed validation",
  "instance": "/api/v1/events",
  "errors": [
    { "field": "price_cents", "message": "Must be a positive integer" },
    { "field": "start_date", "message": "Must be in the future" }
  ]
}
```

### Knex Safe Query Patterns

```typescript
// ✅ Parameterized where
db('events').where({ status: 'active' });

// ✅ Raw with bindings
db.raw('SELECT * FROM events WHERE name ILIKE ?', [`%${search}%`]);

// ✅ Allowlist for dynamic columns
const column = allowlist.includes(input) ? input : 'created_at';
db('events').orderBy(column);
```

---

*Document generated: December 2025*
*For: TicketToken Platform*
*Version: 1.0*