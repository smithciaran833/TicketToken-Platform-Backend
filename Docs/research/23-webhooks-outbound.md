# Outbound Webhook Implementation: Best Practices & Audit Guide

**Platform**: TicketToken (Blockchain Ticketing SaaS)  
**Use Case**: Event notifications to external systems  
**Stack**: Node.js/TypeScript  
**Date**: December 2024

---

## Table of Contents

1. [Standards & Best Practices](#1-standards--best-practices)
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist](#3-audit-checklist)
4. [Implementation Examples](#4-implementation-examples)
5. [Sources](#5-sources)

---

## 1. Standards & Best Practices

### 1.1 Webhook Payload Signing (HMAC)

HMAC (Hash-based Message Authentication Code) is the most widely used method for webhook authentication, used by approximately 65% of webhook providers. It ensures both the authenticity of the sender and the integrity of the payload.

#### How HMAC Signing Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Webhook        │     │   Network       │     │   Receiver      │
│  Provider       │     │   (HTTPS)       │     │   (Consumer)    │
├─────────────────┤     │                 │     ├─────────────────┤
│ 1. Create       │     │                 │     │ 4. Receive      │
│    payload      │     │                 │     │    request      │
│                 │     │                 │     │                 │
│ 2. Generate     │────▶│  HTTP POST      │────▶│ 5. Recompute    │
│    HMAC sig     │     │  + signature    │     │    HMAC         │
│    using secret │     │  in header      │     │    signature    │
│                 │     │                 │     │                 │
│ 3. Send request │     │                 │     │ 6. Compare      │
│    with sig     │     │                 │     │    signatures   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

#### Industry Standard Implementations

| Provider | Header Name | Algorithm | Notes |
|----------|-------------|-----------|-------|
| **GitHub** | `X-Hub-Signature-256` | HMAC-SHA256 | Includes test values for verification |
| **Stripe** | `Stripe-Signature` | HMAC-SHA256 | Includes timestamp in signed payload |
| **Shopify** | `X-Shopify-Hmac-SHA256` | HMAC-SHA256 | Base64 encoded |
| **Slack** | `X-Slack-Signature` | HMAC-SHA256 | Includes timestamp |
| **Dropbox** | `X-Dropbox-Signature` | HMAC-SHA256 | Hex encoded |

#### Best Practices for Signature Generation

1. **Use Strong Algorithms**: SHA-256 minimum (83% of HMAC providers use SHA-256). Never use MD5 or SHA-1.

2. **Include Timestamp**: Concatenate timestamp with payload before signing to prevent replay attacks.

3. **Sign the Raw Body**: Sign the exact bytes, not parsed JSON, to ensure integrity.

4. **Use Timing-Safe Comparison**: Always use constant-time comparison to prevent timing attacks.

5. **Version Your Signatures**: Include algorithm version (e.g., `v1=`) for forward compatibility.

```javascript
// Example: Generating HMAC signature with timestamp
const crypto = require('crypto');

function generateWebhookSignature(payload, secret, timestamp) {
  // Concatenate timestamp and payload
  const signedPayload = `${timestamp}.${JSON.stringify(payload)}`;
  
  // Generate HMAC-SHA256
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  
  return `v1=${signature}`;
}

// Include in headers
const timestamp = Math.floor(Date.now() / 1000);
const headers = {
  'Content-Type': 'application/json',
  'X-Webhook-Timestamp': timestamp.toString(),
  'X-Webhook-Signature': generateWebhookSignature(payload, secret, timestamp)
};
```

#### Key Rotation Strategy

Implement zero-downtime key rotation by signing with multiple keys during transition:

```javascript
// Sign with both old and new keys during rotation
const signatures = [
  `v1=${signWithKey(payload, currentKey)}`,
  `v1=${signWithKey(payload, previousKey)}`
].join(',');
```

---

### 1.2 Retry Strategies with Exponential Backoff

When webhook delivery fails, a proper retry strategy is essential to ensure eventual delivery without overwhelming the receiving server.

#### Exponential Backoff Formula

```
wait_time = min(base_delay * 2^attempt + jitter, max_delay)
```

Where:
- `base_delay`: Initial wait time (e.g., 5 seconds)
- `attempt`: Number of retry attempts (0-indexed)
- `jitter`: Random value to prevent thundering herd
- `max_delay`: Maximum wait cap (e.g., 24 hours)

#### Industry Standard Retry Schedules

| Provider | Max Retries | Strategy | Total Duration |
|----------|-------------|----------|----------------|
| **Stripe** | 72 times | Exponential backoff | Up to 3 days |
| **GitHub** | 1 retry | Immediate retry + manual | Limited |
| **Razorpay** | Until success | Exponential backoff | 24 hours |
| **Shopify** | Several times | Exponential backoff | 48 hours |
| **AWS EventBridge** | 185 times | Exponential + jitter | 24 hours |

#### Example Retry Schedule

| Attempt | Wait Time | Cumulative Time |
|---------|-----------|-----------------|
| 1 | Immediate | 0 |
| 2 | 5 seconds | 5 seconds |
| 3 | 25 seconds | 30 seconds |
| 4 | 2 minutes | ~2.5 minutes |
| 5 | 10 minutes | ~12.5 minutes |
| 6 | 30 minutes | ~42.5 minutes |
| 7 | 2 hours | ~2.7 hours |
| 8 | 8 hours | ~10.7 hours |

#### Best Practices

1. **Add Jitter**: Randomize retry times to prevent synchronized retries (thundering herd problem).

```javascript
function calculateBackoff(attempt, baseDelay = 5000, maxDelay = 86400000) {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 1000; // 0-1 second random jitter
  return Math.min(exponentialDelay + jitter, maxDelay);
}
```

2. **Distinguish Retry Conditions**: 

| Response | Action |
|----------|--------|
| 2xx | Success - no retry |
| 4xx (except 429) | Client error - don't retry (except 408, 429) |
| 429 | Rate limited - retry with longer backoff |
| 5xx | Server error - retry |
| Timeout | Retry |
| Network error | Retry |

3. **Dead Letter Queue (DLQ)**: After exhausting retries, move events to a DLQ for manual inspection.

4. **Include Retry Header**: Send `X-Webhook-Retry-Count` or similar so receivers know it's a retry.

5. **Document Retry Policy**: Clearly document retry schedule, trigger conditions, and DLQ behavior.

---

### 1.3 Delivery Guarantees

Understanding delivery semantics is critical for building reliable webhook systems.

#### Types of Delivery Guarantees

| Guarantee | Description | Implication |
|-----------|-------------|-------------|
| **At-Most-Once** | Deliver once, never retry | May lose events |
| **At-Least-Once** | Retry until acknowledged | May duplicate events |
| **Exactly-Once** | Each event processed exactly once | Extremely difficult to achieve |

**Industry Standard**: Most webhook providers implement **at-least-once delivery**. This is the practical choice because:

> "It is not possible to guarantee exactly-once delivery in a distributed system. Your options are 'at most once' or 'at least once', and almost all vendors that fire webhooks will opt for the latter." — Sophia Willows

#### Implications for Providers (Sender)

1. **Retry failed deliveries** until success or exhaustion
2. **Persist events durably** before acknowledging the originating action
3. **Include unique event IDs** in every payload for receiver deduplication
4. **Document delivery semantics** clearly

#### Implications for Consumers (Receiver)

1. **Expect duplicates** and implement idempotency
2. **Respond quickly** (return 2xx immediately, process asynchronously)
3. **Store event IDs** to detect and skip duplicates

```javascript
// Provider: Include unique event ID
const webhookPayload = {
  id: 'evt_abc123xyz',           // Unique event ID
  idempotency_key: 'idem_789',   // Optional additional key
  type: 'ticket.purchased',
  created_at: '2024-12-20T10:30:00Z',
  data: { /* event data */ }
};
```

---

### 1.4 Webhook Registration and Management

A well-designed webhook management system makes integration seamless for consumers.

#### Registration API Design

Treat webhooks as REST resources with full CRUD operations:

```
POST   /api/v1/webhooks          # Create webhook subscription
GET    /api/v1/webhooks          # List all webhooks
GET    /api/v1/webhooks/{id}     # Get specific webhook
PUT    /api/v1/webhooks/{id}     # Update webhook
DELETE /api/v1/webhooks/{id}     # Delete webhook
POST   /api/v1/webhooks/{id}/test # Send test event
```

#### Webhook Resource Schema

```json
{
  "id": "wh_abc123",
  "url": "https://customer.example.com/webhooks/tickettoken",
  "description": "Production webhook for order events",
  "events": ["ticket.created", "ticket.transferred", "event.updated"],
  "secret": "whsec_...",  // Only shown once at creation
  "active": true,
  "created_at": "2024-12-20T10:00:00Z",
  "metadata": {
    "environment": "production"
  }
}
```

#### Best Practices for Registration

1. **Event Filtering**: Allow subscribers to select specific events.

2. **URL Verification**: Verify endpoint ownership before enabling webhooks:
   - Send verification challenge (like Facebook/Twitter)
   - Require specific response to confirm ownership

3. **Per-Customer Secrets**: Generate unique secrets per webhook subscription.

4. **Retry Configuration**: Optionally allow customers to configure retry policies.

5. **Delivery Logs**: Provide visibility into recent deliveries and failures.

6. **Test Endpoint**: Offer a way to trigger test events for integration testing.

7. **Auto-Disable on Failure**: Disable webhooks that fail consistently (e.g., 75%+ failure rate).

```javascript
// Automatic webhook disabling after persistent failures
if (failureRate >= 0.75 && failureCount >= 100) {
  await disableWebhook(webhookId);
  await sendAdminNotification(webhookId, 'disabled due to high failure rate');
}
```

---

### 1.5 Timeout Handling

Proper timeout configuration is critical for both providers and consumers.

#### Industry Standard Timeouts

| Provider | Connection Timeout | Response Timeout | Notes |
|----------|-------------------|------------------|-------|
| **GitHub** | - | 10 seconds | Queuing recommended |
| **Shopify** | - | 10 seconds | Retries for 48 hours |
| **HubSpot** | - | 2 seconds | Very aggressive |
| **Stripe** | - | 20 seconds | - |
| **Twilio** | 3 seconds | 15 seconds (voice) | Configurable via URL params |
| **Vonage** | 3 seconds | 15 seconds | Retries every 60 seconds |

#### Recommended Timeout Configuration

| Setting | Recommended Value | Rationale |
|---------|-------------------|-----------|
| Connection Timeout | 3-5 seconds | DNS + TCP handshake |
| Response Timeout | 10-30 seconds | Balance between reliability and resource usage |
| Total Timeout | 30-60 seconds | Including all retries |
| Keep-alive | Disabled per request | Avoid connection pooling issues |

#### Best Practices for Providers

1. **Set Reasonable Timeouts**: 10-30 seconds is typical; too short causes false failures.

2. **Include Timeout in Documentation**: Let consumers know your limits.

3. **Treat Timeouts as Failures**: Retry timed-out requests.

4. **Log Timeout Details**: Record connection vs. response timeouts separately.

```javascript
const axios = require('axios');

async function sendWebhook(url, payload, signature) {
  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature
      },
      timeout: 10000,  // 10 second timeout
      maxRedirects: 0, // Don't follow redirects (SSRF prevention)
      validateStatus: (status) => status >= 200 && status < 300
    });
    return { success: true, statusCode: response.status };
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      return { success: false, error: 'timeout' };
    }
    return { success: false, error: error.message };
  }
}
```

#### Best Practices for Consumers

1. **Respond Immediately**: Return 200 OK as fast as possible.

2. **Process Asynchronously**: Queue webhook for background processing.

3. **Decouple Acknowledgment from Processing**: 

```javascript
// Good: Acknowledge immediately, process async
app.post('/webhook', async (req, res) => {
  // Validate signature first
  if (!verifySignature(req)) {
    return res.status(401).send('Invalid signature');
  }
  
  // Queue for async processing
  await messageQueue.publish('webhooks', req.body);
  
  // Respond immediately
  res.status(200).json({ received: true });
});
```

---

### 1.6 Idempotency for Receivers

Since webhooks use at-least-once delivery, receivers must handle duplicate events gracefully.

#### What is Idempotency?

> "An operation is said to be idempotent if performing it multiple times produces the same result as performing it once."

#### Implementation Strategies

**Strategy 1: Event ID Deduplication**

Store processed event IDs and check before processing:

```javascript
async function handleWebhook(event) {
  const eventId = event.id;
  
  // Check if already processed
  const exists = await redis.get(`webhook:processed:${eventId}`);
  if (exists) {
    console.log(`Duplicate event ${eventId}, skipping`);
    return { status: 'duplicate' };
  }
  
  // Mark as processing (with TTL for cleanup)
  await redis.set(`webhook:processed:${eventId}`, 'processing', 'EX', 86400);
  
  try {
    await processEvent(event);
    await redis.set(`webhook:processed:${eventId}`, 'completed', 'EX', 86400);
    return { status: 'processed' };
  } catch (error) {
    await redis.del(`webhook:processed:${eventId}`);
    throw error;
  }
}
```

**Strategy 2: Database Unique Constraint**

```sql
CREATE TABLE webhook_events (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(255) UNIQUE NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);
```

```javascript
async function handleWebhook(event) {
  try {
    await db.query(
      'INSERT INTO webhook_events (event_id, payload) VALUES ($1, $2)',
      [event.id, JSON.stringify(event)]
    );
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return { status: 'duplicate' };
    }
    throw error;
  }
  
  await processEvent(event);
  await db.query(
    'UPDATE webhook_events SET status = $1, processed_at = NOW() WHERE event_id = $2',
    ['completed', event.id]
  );
}
```

**Strategy 3: Idempotency by Design**

Make operations naturally idempotent:

```javascript
// Bad: Non-idempotent (creates duplicates)
await db.query('INSERT INTO orders (customer_id, amount) VALUES ($1, $2)', 
  [customerId, amount]);

// Good: Idempotent using upsert
await db.query(`
  INSERT INTO orders (external_id, customer_id, amount)
  VALUES ($1, $2, $3)
  ON CONFLICT (external_id) DO NOTHING
`, [event.data.order_id, customerId, amount]);
```

#### Key Considerations

1. **Use Stable Identifiers**: Event IDs should be consistent across retries.

2. **TTL for Deduplication Cache**: Keep processed IDs for a reasonable period (24-72 hours).

3. **Handle Race Conditions**: Use atomic operations (Redis NX, database constraints).

4. **Separate Idempotency Keys**: For different operations, use different keys.

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 No Payload Signing

**The Problem**: Webhook endpoints are publicly accessible. Without signature verification, anyone can send fake payloads to your endpoint.

**Impact**:
- Attackers can inject malicious data
- Fake events trigger unauthorized actions (e.g., fraudulent refunds)
- SQL injection, command injection via payload

**Real-World Scenario**:
```
Attacker discovers: POST https://victim.com/webhooks/stripe
Attacker sends: {"type": "charge.refunded", "data": {"amount": 10000, "customer": "attacker@evil.com"}}
Result: Victim's system processes fake refund
```

**Prevention**:
- Always sign payloads with HMAC-SHA256
- Include timestamp in signature to prevent replay attacks
- Use timing-safe comparison for signature verification
- Log and alert on signature verification failures

```javascript
// NEVER do this
app.post('/webhook', (req, res) => {
  processEvent(req.body); // No verification!
});

// ALWAYS do this
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  if (!verifySignature(req.rawBody, signature, secret)) {
    console.warn('Invalid signature from', req.ip);
    return res.status(401).send('Unauthorized');
  }
  processEvent(req.body);
});
```

---

### 2.2 No Retry Mechanism

**The Problem**: Single-attempt delivery with no retries leads to data loss when receivers are temporarily unavailable.

**Impact**:
- Lost events during receiver downtime
- Lost events during network issues
- Incomplete data synchronization
- Manual recovery required

**Statistics**: Network issues, server errors, and temporary outages are common. Without retries, expect 1-5% event loss under normal conditions.

**Prevention**:
- Implement exponential backoff with jitter
- Use a persistent queue for pending deliveries
- Set up Dead Letter Queue (DLQ) for failed events
- Provide manual replay capability

```javascript
// Bad: Single attempt
await axios.post(webhookUrl, payload);
// If this fails, event is lost

// Good: Queue-based with retries
await webhookQueue.add('delivery', {
  url: webhookUrl,
  payload,
  attemptsMade: 0,
  maxAttempts: 8,
  nextRetryAt: null
}, {
  attempts: 8,
  backoff: {
    type: 'exponential',
    delay: 5000
  }
});
```

---

### 2.3 Synchronous Webhook Delivery Blocking Operations

**The Problem**: Sending webhooks synchronously during request processing blocks the main operation and degrades user experience.

**Impact**:
- Slow API responses (waiting for webhook delivery)
- User actions blocked by slow/failing webhook endpoints
- Timeouts cascade to user-facing errors
- Scalability issues under load

**Example Anti-Pattern**:
```javascript
// Bad: Synchronous webhook in request flow
app.post('/api/orders', async (req, res) => {
  const order = await createOrder(req.body);
  
  // This blocks the response!
  await axios.post(webhookUrl, { event: 'order.created', data: order });
  
  res.json(order); // User waits for webhook to complete
});
```

**Prevention**:
```javascript
// Good: Async webhook via queue
app.post('/api/orders', async (req, res) => {
  const order = await createOrder(req.body);
  
  // Queue webhook for async delivery
  await webhookQueue.add({ event: 'order.created', data: order });
  
  res.json(order); // Response immediately
});
```

**Architecture Pattern**:
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ API Request │────▶│ Create      │────▶│ Queue       │────▶│ Response    │
│             │     │ Resource    │     │ Webhook     │     │ (immediate) │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ Worker      │
                                        │ (async)     │
                                        └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ Deliver     │
                                        │ Webhook     │
                                        └─────────────┘
```

---

### 2.4 No Delivery Logging

**The Problem**: Without logs of webhook deliveries, debugging failures and auditing becomes impossible.

**Impact**:
- Cannot debug failed deliveries
- No visibility into webhook health
- Cannot prove delivery for disputes
- Cannot identify patterns in failures

**Prevention - What to Log**:

| Field | Description |
|-------|-------------|
| `timestamp` | When delivery was attempted |
| `webhook_id` | Which subscription |
| `event_id` | Unique event identifier |
| `event_type` | Type of event (e.g., `order.created`) |
| `url` | Destination URL |
| `attempt_number` | Which retry attempt |
| `status_code` | HTTP response code |
| `response_time_ms` | Latency |
| `error_message` | If failed, why |
| `request_headers` | Headers sent (redact secrets) |
| `response_body` | First N chars of response |

**Do NOT Log**:
- Full payload if it contains PII
- Webhook secrets
- Authentication tokens

```javascript
const deliveryLog = {
  timestamp: new Date().toISOString(),
  webhook_id: subscription.id,
  event_id: event.id,
  event_type: event.type,
  url: subscription.url,
  attempt: attemptNumber,
  status_code: response?.status,
  response_time_ms: endTime - startTime,
  success: response?.status >= 200 && response?.status < 300,
  error: error?.message,
  // Redact sensitive data
  request_size_bytes: JSON.stringify(payload).length
};

await deliveryLogsCollection.insert(deliveryLog);
```

---

### 2.5 SSRF via Webhook URLs

**The Problem**: Server-Side Request Forgery (SSRF) occurs when attackers provide malicious URLs that cause your server to make requests to internal resources.

**Attack Vectors**:
- `http://localhost/admin` - Access local services
- `http://169.254.169.254/` - AWS metadata endpoint
- `http://10.0.0.1/internal-api` - Internal network resources
- `http://[::1]/` - IPv6 localhost
- `http://127.0.0.1.xip.io/` - DNS rebinding

**Impact**:
- Access to internal services
- Cloud credential theft (via metadata endpoints)
- Internal network scanning
- Data exfiltration

**Prevention - Multi-Layer Defense**:

**Layer 1: URL Validation at Registration**

```javascript
const { URL } = require('url');
const ipaddr = require('ipaddr.js');
const dns = require('dns').promises;

async function validateWebhookUrl(urlString) {
  // Parse URL
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error('Invalid URL format');
  }
  
  // Require HTTPS
  if (url.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed');
  }
  
  // Block localhost variations
  const blockedHostnames = [
    'localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'
  ];
  if (blockedHostnames.includes(url.hostname.toLowerCase())) {
    throw new Error('Localhost URLs are not allowed');
  }
  
  // Resolve DNS and check IP
  const addresses = await dns.resolve4(url.hostname).catch(() => []);
  for (const ip of addresses) {
    const addr = ipaddr.parse(ip);
    if (addr.range() !== 'unicast') {
      throw new Error('Private/reserved IP addresses are not allowed');
    }
  }
  
  // Block your own domains
  const blockedDomains = ['tickettoken.com', 'api.tickettoken.com'];
  if (blockedDomains.some(d => url.hostname.endsWith(d))) {
    throw new Error('Internal domains are not allowed');
  }
  
  return true;
}
```

**Layer 2: Network Isolation**

- Run webhook workers in isolated network segment
- Use egress proxy (e.g., Stripe's Smokescreen)
- Block access to internal subnets at firewall level
- Block access to cloud metadata endpoints (169.254.169.254)

**Layer 3: Runtime Validation**

```javascript
// Re-validate IP at request time (prevents DNS rebinding)
async function sendWebhookSafely(url, payload) {
  const urlObj = new URL(url);
  const addresses = await dns.resolve4(urlObj.hostname);
  
  for (const ip of addresses) {
    if (isPrivateIp(ip)) {
      throw new Error('SSRF attempt blocked');
    }
  }
  
  // Use resolved IP directly
  return axios.post(url, payload, {
    maxRedirects: 0,  // Don't follow redirects
    timeout: 10000
  });
}
```

---

### 2.6 Sensitive Data in Webhooks

**The Problem**: Including sensitive data (PII, credentials, financial data) in webhook payloads exposes it to additional risk.

**Risk Factors**:
- Webhooks may be logged by receivers
- HTTPS terminates at load balancers
- Receiver endpoints may have weaker security
- Data stored in receiver's systems

**Prevention Strategies**:

**Strategy 1: Skinny Payloads**

Send minimal data; let receiver fetch full details via authenticated API:

```javascript
// Bad: Full data in webhook
{
  "type": "customer.updated",
  "data": {
    "id": "cust_123",
    "email": "john@example.com",      // PII
    "ssn": "123-45-6789",              // Very sensitive!
    "credit_card": "4111..."           // Extremely sensitive!
  }
}

// Good: Minimal notification
{
  "type": "customer.updated",
  "data": {
    "id": "cust_123",
    "updated_fields": ["email", "address"],
    "api_url": "https://api.example.com/v1/customers/cust_123"
  }
}
```

**Strategy 2: Field-Level Encryption**

Encrypt sensitive fields within the payload:

```javascript
const crypto = require('crypto');

function encryptSensitiveFields(payload, receiverPublicKey) {
  if (payload.data.email) {
    payload.data.email = encryptWithPublicKey(payload.data.email, receiverPublicKey);
  }
  return payload;
}
```

**Strategy 3: Data Classification**

| Data Type | Include in Webhook? | Alternative |
|-----------|---------------------|-------------|
| IDs, references | ✅ Yes | - |
| Timestamps | ✅ Yes | - |
| Event types | ✅ Yes | - |
| Names | ⚠️ Caution | Send ID, fetch via API |
| Emails | ⚠️ Caution | Send ID, fetch via API |
| Financial data | ❌ No | Always fetch via API |
| Passwords | ❌ Never | Never transmit |
| SSN/Tax IDs | ❌ Never | Never transmit |
| Credit cards | ❌ Never | Use tokens only |

**Logging Best Practices**:

```javascript
// Redact sensitive fields before logging
function redactForLogging(payload) {
  const redacted = JSON.parse(JSON.stringify(payload));
  const sensitiveFields = ['email', 'phone', 'address', 'ssn'];
  
  function redact(obj) {
    for (const key of Object.keys(obj)) {
      if (sensitiveFields.includes(key.toLowerCase())) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        redact(obj[key]);
      }
    }
  }
  
  redact(redacted);
  return redacted;
}
```

---

## 3. Audit Checklist

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

## 4. Implementation Examples

### 4.1 Complete Webhook Sender (Node.js/TypeScript)

```typescript
import crypto from 'crypto';
import axios from 'axios';
import { Queue } from 'bullmq';

interface WebhookEvent {
  id: string;
  type: string;
  created_at: string;
  data: Record<string, unknown>;
}

interface WebhookSubscription {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
}

class WebhookService {
  private queue: Queue;
  
  constructor() {
    this.queue = new Queue('webhooks', {
      defaultJobOptions: {
        attempts: 8,
        backoff: {
          type: 'exponential',
          delay: 5000
        },
        removeOnComplete: 1000,
        removeOnFail: 5000
      }
    });
  }
  
  // Generate HMAC signature
  private generateSignature(
    payload: string, 
    secret: string, 
    timestamp: number
  ): string {
    const signedPayload = `${timestamp}.${payload}`;
    return crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');
  }
  
  // Queue webhook for async delivery
  async queueWebhook(
    subscription: WebhookSubscription, 
    event: WebhookEvent
  ): Promise<void> {
    if (!subscription.active) return;
    if (!subscription.events.includes(event.type)) return;
    
    await this.queue.add('deliver', {
      subscriptionId: subscription.id,
      url: subscription.url,
      secret: subscription.secret,
      event
    });
  }
  
  // Deliver webhook (called by worker)
  async deliverWebhook(job: {
    url: string;
    secret: string;
    event: WebhookEvent;
  }): Promise<void> {
    const { url, secret, event } = job;
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify(event);
    const signature = this.generateSignature(payload, secret, timestamp);
    
    const startTime = Date.now();
    
    try {
      const response = await axios.post(url, event, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Id': event.id,
          'X-Webhook-Timestamp': timestamp.toString(),
          'X-Webhook-Signature': `v1=${signature}`,
          'User-Agent': 'TicketToken-Webhooks/1.0'
        },
        timeout: 10000,
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 300
      });
      
      await this.logDelivery({
        eventId: event.id,
        url,
        success: true,
        statusCode: response.status,
        latencyMs: Date.now() - startTime
      });
      
    } catch (error) {
      await this.logDelivery({
        eventId: event.id,
        url,
        success: false,
        statusCode: error.response?.status,
        error: error.message,
        latencyMs: Date.now() - startTime
      });
      
      throw error; // Let BullMQ handle retry
    }
  }
  
  private async logDelivery(log: DeliveryLog): Promise<void> {
    // Implementation: Store in database or logging service
    console.log('Webhook delivery:', JSON.stringify(log));
  }
}
```

### 4.2 URL Validation for SSRF Prevention

```typescript
import { URL } from 'url';
import dns from 'dns/promises';
import ipaddr from 'ipaddr.js';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]'
]);

const BLOCKED_DOMAINS = new Set([
  'tickettoken.com',
  'api.tickettoken.com',
  'internal.tickettoken.com'
]);

async function validateWebhookUrl(urlString: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  // 1. Parse URL
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
  
  // 2. Require HTTPS
  if (url.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTPS URLs are allowed' };
  }
  
  // 3. Block localhost
  if (BLOCKED_HOSTNAMES.has(url.hostname.toLowerCase())) {
    return { valid: false, error: 'Localhost URLs are not allowed' };
  }
  
  // 4. Block internal domains
  for (const domain of BLOCKED_DOMAINS) {
    if (url.hostname === domain || url.hostname.endsWith(`.${domain}`)) {
      return { valid: false, error: 'Internal domains are not allowed' };
    }
  }
  
  // 5. Resolve DNS and validate IP addresses
  try {
    const addresses = await dns.resolve4(url.hostname);
    
    for (const ip of addresses) {
      if (!isPublicIp(ip)) {
        return { 
          valid: false, 
          error: `URL resolves to private IP: ${ip}` 
        };
      }
    }
  } catch (error) {
    return { 
      valid: false, 
      error: `DNS resolution failed: ${error.message}` 
    };
  }
  
  return { valid: true };
}

function isPublicIp(ip: string): boolean {
  try {
    const addr = ipaddr.parse(ip);
    const range = addr.range();
    
    // Only allow unicast (public) addresses
    const blockedRanges = [
      'unspecified',
      'broadcast',
      'multicast',
      'linkLocal',
      'loopback',
      'private',
      'reserved'
    ];
    
    return !blockedRanges.includes(range);
  } catch {
    return false;
  }
}
```

### 4.3 Consumer-Side Signature Verification

```typescript
import crypto from 'crypto';
import express from 'express';

const app = express();

// Important: Get raw body for signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    (req as any).rawBody = buf;
  }
}));

function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string | undefined,
  timestamp: string | undefined,
  secret: string
): boolean {
  if (!signature || !timestamp) {
    return false;
  }
  
  // Check timestamp freshness (within 5 minutes)
  const timestampNum = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampNum) > 300) {
    console.warn('Webhook timestamp too old');
    return false;
  }
  
  // Parse signature (format: v1=abc123)
  const [version, sig] = signature.split('=');
  if (version !== 'v1' || !sig) {
    return false;
  }
  
  // Compute expected signature
  const signedPayload = `${timestamp}.${rawBody.toString()}`;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  
  // Timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(sig),
    Buffer.from(expectedSig)
  );
}

app.post('/webhook', async (req, res) => {
  const signature = req.headers['x-webhook-signature'] as string;
  const timestamp = req.headers['x-webhook-timestamp'] as string;
  const rawBody = (req as any).rawBody;
  
  // Verify signature
  if (!verifyWebhookSignature(rawBody, signature, timestamp, WEBHOOK_SECRET)) {
    console.error('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Check for duplicate (idempotency)
  const eventId = req.body.id;
  const isDuplicate = await checkAndStoreEventId(eventId);
  if (isDuplicate) {
    return res.status(200).json({ received: true, duplicate: true });
  }
  
  // Queue for async processing
  await webhookQueue.add(req.body);
  
  // Respond immediately
  return res.status(200).json({ received: true });
});
```

---

## 5. Sources

### Security & HMAC Signing

1. **Prismatic - How to Secure Webhook Endpoints with HMAC**  
   https://prismatic.io/blog/how-secure-webhook-endpoints-hmac/

2. **Webhooks.fyi - Hash-based Message Authentication Code (HMAC)**  
   https://webhooks.fyi/security/hmac

3. **Stytch - Webhooks Security Best Practices**  
   https://stytch.com/blog/webhooks-security-best-practices/

4. **GitHub Docs - Validating Webhook Deliveries**  
   https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries

5. **HackerOne - Securely Signing Webhooks**  
   https://www.hackerone.com/blog/securely-signing-webhooks-best-practices-your-application

6. **Hookdeck - SHA256 Webhook Signature Verification**  
   https://hookdeck.com/webhooks/guides/how-to-implement-sha256-webhook-signature-verification

7. **ngrok - Webhook Security in the Real World**  
   https://ngrok.com/blog/get-webhooks-secure-it-depends-a-field-guide-to-webhook-security

### Retry Strategies & Delivery

8. **Svix - Webhook Retry Best Practices**  
   https://www.svix.com/resources/webhook-best-practices/retries/

9. **Hookdeck - Webhooks at Scale**  
   https://hookdeck.com/blog/webhooks-at-scale

10. **Razorpay - Webhooks Best Practices**  
    https://razorpay.com/docs/webhooks/best-practices/

11. **Gympass - Handling Failed Webhooks with Exponential Backoff**  
    https://medium.com/gympass/handling-failed-webhooks-with-exponential-backoff-72d2e01017d7

12. **Latenode - How to Implement Webhook Retry Logic**  
    https://latenode.com/blog/how-to-implement-webhook-retry-logic

### Idempotency & Delivery Guarantees

13. **Hookdeck - Implement Webhook Idempotency**  
    https://hookdeck.com/webhooks/guides/implement-webhook-idempotency

14. **Postmark - Why Idempotency is Important**  
    https://postmarkapp.com/blog/why-idempotency-is-important

15. **Sophia Willows - How to Write Robust Webhook Handlers**  
    https://sophiabits.com/blog/how-to-write-robust-webhook-handlers

16. **Ably - Idempotency**  
    https://ably.com/docs/platform/architecture/idempotency

17. **Latenode - Webhook Deduplication Checklist**  
    https://latenode.com/blog/webhook-deduplication-checklist-for-developers

### SSRF Prevention

18. **PlanetScale - Webhook Security: A Hands-on Guide**  
    https://planetscale.com/blog/securing-webhooks

19. **Svix - Webhook Security Best Practices**  
    https://www.svix.com/resources/webhook-best-practices/security/

20. **OWASP - Server Side Request Forgery Prevention Cheat Sheet**  
    https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html

21. **OWASP API Security - SSRF**  
    https://owasp.org/API-Security/editions/2023/en/0xa7-server-side-request-forgery/

22. **Hookdeck - Webhook Security Vulnerabilities Guide**  
    https://hookdeck.com/webhooks/guides/webhook-security-vulnerabilities-guide

### Timeout Handling

23. **Svix - Understanding Webhook Timeouts**  
    https://www.svix.com/resources/glossary/webhook-timeout/

24. **Shopify - Webhook Best Practices**  
    https://shopify.engineering/17488672-webhook-best-practices

25. **Twilio - Webhooks Connection Overrides**  
    https://www.twilio.com/docs/usage/webhooks/webhooks-connection-overrides

26. **Hookdeck - GitHub Webhooks Features and Best Practices**  
    https://hookdeck.com/webhooks/platforms/guide-github-webhooks-features-and-best-practices

### Registration & Management

27. **Zapier - Add Webhooks to Your API the Right Way**  
    https://zapier.com/engineering/webhook-design/

28. **Stripe API - Webhook Endpoints**  
    https://docs.stripe.com/api/webhook_endpoints

29. **HubSpot - Webhooks API**  
    https://developers.hubspot.com/docs/guides/api/app-management/webhooks

### Logging & Monitoring

30. **Hookdeck - What to Monitor in a Webhook Infrastructure**  
    https://hookdeck.com/webhooks/guides/what-to-monitor-in-a-webhook-infrastructure

31. **Hookdeck - Monitoring**  
    https://hookdeck.com/webhooks/guides/monitoring

32. **Hookdeck - Webhook Infrastructure Performance Monitoring**  
    https://hookdeck.com/webhooks/guides/webhook-infrastructure-performance-monitoring-scalability-resource

33. **Integrate.io - How to Apply Webhook Best Practices**  
    https://www.integrate.io/blog/apply-webhook-best-practices/

### Sensitive Data & General Security

34. **Invicti - Webhook Security Best Practices and Checklist**  
    https://www.invicti.com/blog/web-security/webhook-security-best-practices

35. **TechTarget - Webhook Security: Risks and Best Practices**  
    https://www.techtarget.com/searchapparchitecture/tip/Webhook-security-Risks-and-best-practices-for-mitigation

36. **Snyk - Webhook Security Best Practices**  
    https://snyk.io/blog/creating-secure-webhooks/

37. **GitHub Docs - Best Practices for Using Webhooks**  
    https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks

38. **Elastic.io - Webhook Security: Four Risk Scenarios**  
    https://www.elastic.io/integration-best-practices/webhook-security-how-to-secure-webhooks/

39. **Webhooks.fyi - Best Practices for Webhook Providers**  
    https://webhooks.fyi/best-practices/webhook-providers

40. **RequestBin - Webhook Security Best Practices**  
    https://blog.requestbin.net/webhook-security-best-practices-authentication-data-protection-with-requestbin/

---

## Quick Reference Card

### Signature Generation Formula

```
signature = HMAC-SHA256(secret, timestamp + "." + rawBody)
header = "v1=" + hex(signature)
```

### Retry Schedule Template

| Attempt | Delay | Cumulative |
|---------|-------|------------|
| 1 | 0s | 0s |
| 2 | 5s | 5s |
| 3 | 25s | 30s |
| 4 | 2m | ~2.5m |
| 5 | 10m | ~12.5m |
| 6 | 30m | ~42.5m |
| 7 | 2h | ~2.7h |
| 8 | 8h | ~10.7h |

### Required Headers (Sender)

```http
Content-Type: application/json
X-Webhook-Id: evt_unique123
X-Webhook-Timestamp: 1703067000
X-Webhook-Signature: v1=abc123...
User-Agent: YourApp-Webhooks/1.0
```

### SSRF Blocked Ranges

```
10.0.0.0/8       (Private)
172.16.0.0/12    (Private)
192.168.0.0/16   (Private)
127.0.0.0/8      (Loopback)
169.254.0.0/16   (Link-local/Metadata)
::1/128          (IPv6 Loopback)
```

### Consumer Response Times

| Response Time | Status |
|---------------|--------|
| < 2 seconds | ✅ Excellent |
| 2-5 seconds | ⚠️ Acceptable |
| 5-10 seconds | ⚠️ Risk of timeout |
| > 10 seconds | ❌ Likely timeout |

---

*Document Version: 1.0*  
*Last Updated: December 2024*  
*Next Review: March 2025*