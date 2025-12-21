# Email, SMS, and Push Notification Systems: Production Readiness Audit

## Platform Context: TicketToken
- **Use Cases**: Ticket purchase confirmations, event notifications, resale alerts, QR code delivery, venue updates
- **Stack**: Node.js/Fastify, PostgreSQL, Redis, 23 microservices
- **Critical Flows**: Transactional emails (confirmations), event-driven notifications, multi-channel delivery

---

## 1. Standards & Best Practices

### 1.1 Email Delivery Best Practices

#### Authentication (SPF/DKIM/DMARC)
As of February 2024, Gmail and Yahoo require bulk senders (5,000+ messages/day) to implement full email authentication. Microsoft Outlook followed with similar requirements in 2025.

**Required Configuration:**
- **SPF**: Publish DNS TXT record listing authorized sending IPs
  - Use `~all` (softfail) instead of `-all` (fail) to allow DMARC evaluation
  - Keep under 10 DNS lookups to avoid lookup limit
  - Don't use `+all` mechanism (allows anyone to send)
- **DKIM**: Sign all outbound emails with domain-aligned keys
  - Minimum 1,024-bit keys (2,048-bit recommended)
  - Rotate keys every 6 months for high-volume senders
  - Use `rsa-sha256` signing algorithm
  - Each third-party sender should have unique DKIM keys
- **DMARC**: Publish policy record for domain
  - Start with `p=none` (monitoring), progress to `p=quarantine`, then `p=reject`
  - Configure aggregate (`rua`) and forensic (`ruf`) reporting
  - Ensure SPF/DKIM alignment with `From` header domain

**Sources:**
- Google Sender Guidelines: https://support.google.com/a/answer/81126
- DMARC.org Best Practices: https://dmarc.org/2016/03/best-practices-for-email-senders/
- Mailgun Authentication Guide: https://www.mailgun.com/blog/deliverability/email-authentication-your-id-card-sending/

#### Deliverability Requirements
- Maintain spam complaint rate below 0.3% (Google Postmaster Tools)
- Use TLS for SMTP transmission
- Ensure valid forward and reverse DNS (PTR) records for sending IPs
- Separate transactional and marketing email streams (different IPs/subdomains)

**Sources:**
- Gmail Sender Guidelines: https://support.google.com/a/answer/81126
- Postmark Separation Guide: https://postmarkapp.com/blog/transactional-vs-marketing-email

---

### 1.2 Template Management

#### Template Security
- Use "logic-less" template engines (Mustache) when possible to prevent SSTI
- If using Handlebars/EJS, ensure version ≥4.6.0 (Handlebars) with prototype access restrictions
- Never allow user input directly into template compilation
- Sanitize all dynamic content before template rendering
- Apply output encoding for all user-generated content

**Sources:**
- PortSwigger SSTI Prevention: https://portswigger.net/web-security/server-side-template-injection
- Imperva SSTI Guide: https://www.imperva.com/learn/application-security/server-side-template-injection-ssti/

#### Template Best Practices
- Store templates in version control, not user-editable databases
- Use template inheritance for consistent branding
- Mobile-responsive design (majority of email opens are mobile)
- Plain-text fallback for all HTML emails
- Precompile templates at deployment, not runtime

---

### 1.3 Notification Queuing and Reliability

#### Queue Architecture
- Implement persistent message queues (Redis Streams, RabbitMQ, SQS)
- Never rely on in-memory timers for retry logic
- Use dead-letter queues (DLQ) for failed messages

#### Retry Strategy
- **Exponential backoff**: `delay = base * (2^attempt)` with jitter
- **Maximum retry attempts**: Define per notification type (typically 3-5)
- **Jitter**: Add randomization to prevent thundering herd
- **Delete-Calculate-Requeue pattern**: 
  1. Delete original message
  2. Calculate backoff delay  
  3. Requeue with delay

#### Dead Letter Queue Handling
- Monitor DLQ depth with alerts
- Store failure metadata (timestamp, error, attempt count)
- Implement manual retry mechanism for DLQ messages
- Never auto-retry DLQ without root cause resolution

**Sources:**
- AWS SNS DLQ: https://docs.aws.amazon.com/sns/latest/dg/sns-dead-letter-queues.html
- Queue-Based Retry Patterns: https://dev.to/andreparis/queue-based-exponential-backoff-a-resilient-retry-pattern-for-distributed-systems-37f3
- Redpanda DLQ Guide: https://www.redpanda.com/blog/reliable-message-processing-with-dead-letter-queue

---

### 1.4 Bounce and Complaint Handling

#### Bounce Types
- **Hard bounce (Permanent)**: Invalid address, domain doesn't exist
  - **Action**: Immediately remove from mailing list
- **Soft bounce (Transient)**: Mailbox full, server unavailable
  - **Action**: Retry with backoff, remove after multiple failures

#### Implementation (AWS SES Example)
1. Create separate SNS topics for bounces and complaints
2. Subscribe webhook endpoints to topics
3. Process notifications to update recipient status
4. Maintain suppression list in database

#### Complaint Handling
- Honor complaints immediately (add to suppression list)
- Investigate patterns in complaint content
- Remove complainers from all marketing lists
- Keep complaint rate below 0.1%

**Sources:**
- AWS SES Bounce Notifications: https://docs.aws.amazon.com/ses/latest/dg/monitor-sending-activity-using-notifications.html
- AWS Bounce Handling Blog: https://aws.amazon.com/blogs/messaging-and-targeting/handling-bounces-and-complaints/

---

### 1.5 Unsubscribe Handling

#### RFC 8058 One-Click Unsubscribe (Required for Gmail/Yahoo)
As of June 2024, Gmail and Yahoo require one-click unsubscribe for bulk senders.

**Required Headers:**
```
List-Unsubscribe: <https://example.com/unsubscribe?token=xxx>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

**Requirements:**
- HTTPS endpoint (not HTTP)
- Must handle POST requests (not GET)
- Process unsubscribe within 48 hours (recommendation: immediately)
- No confirmation page required for header-based unsubscribe
- No redirects allowed in response
- Endpoint must be idempotent

**Footer Link Requirements:**
- Visible unsubscribe link in email body (in addition to headers)
- Direct unsubscription without login requirement
- Preference center optional but link required

**Transactional Email Exception:**
- Order confirmations, password resets, etc. exempt from unsubscribe requirements
- Still recommended to include notification preference links

**Sources:**
- RFC 8058: https://datatracker.ietf.org/doc/html/rfc8058
- Mailgun RFC 8058 Guide: https://www.mailgun.com/blog/deliverability/what-is-rfc-8058/
- Mailmodo One-Click Guide: https://www.mailmodo.com/guides/rfc-8058/

---

### 1.6 Rate Limiting Outbound Notifications

#### Email Rate Limits
- Respect ESP-imposed limits (e.g., SES: 14 emails/second default)
- Implement account-level rate limiting
- Use queue with controlled dequeue rate
- Monitor for 429 responses and back off

#### SMS Rate Limits (Twilio Example)
- Long codes: 1 MPS (message per second) US/Canada
- Toll-free: 3 MPS
- Short codes: 100+ MPS
- Use Messaging Services for multi-number pooling
- Never "snowshoe" (spread across numbers to bypass limits)

#### Push Notification Limits
- FCM: Respect rate-limiting headers (429 responses)
- APNs: Avoid connection churn (keep HTTP/2 connections open)
- Topic subscriptions: Max 2,000 topics per app instance

**Sources:**
- Twilio Rate Limits: https://support.twilio.com/hc/en-us/articles/115002943027-Understanding-Twilio-Rate-Limits-and-Message-Queues
- Firebase Token Management: https://firebase.google.com/docs/cloud-messaging/manage-tokens

---

### 1.7 Multi-Channel Notification Strategies

#### Channel Selection Logic
1. **Urgency**: Push for immediate, email for non-urgent
2. **Content Length**: SMS for short alerts, email for details
3. **User Preference**: Respect opt-out per channel
4. **Fallback Chain**: Push → SMS → Email for critical notifications

#### Delivery Tracking Per Channel
- **Email**: Track sent, delivered, opened, clicked, bounced, complained
- **SMS**: Track queued, sent, delivered, failed, undelivered
- **Push**: Track sent, delivered (platform-dependent), opened

#### Token/Address Management
- Refresh FCM tokens monthly (or on each app launch)
- Remove stale tokens (inactive >30 days from topics)
- Validate email addresses on collection
- Verify phone numbers via SMS confirmation

**Sources:**
- FCM Token Best Practices: https://firebase.google.com/docs/cloud-messaging/manage-tokens
- Twilio Delivery Logging: https://www.twilio.com/docs/messaging/guides/outbound-message-logging

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Email Injection Attacks

**Attack Vector:**
Attacker injects CRLF characters (`\r\n`) into email headers via user input, allowing them to:
- Add BCC recipients
- Modify subject/sender
- Inject email body content
- Send spam through your infrastructure

**Vulnerable Code Example:**
```javascript
// VULNERABLE - user input directly in headers
const userEmail = req.body.replyTo; // Could contain: "user@example.com\r\nBcc: spam@attacker.com"
await transporter.sendMail({
  replyTo: userEmail,  // Injection point!
  to: recipient,
  subject: 'Your Ticket'
});
```

**Prevention:**
```javascript
// Strip all newline characters
const sanitizedEmail = userEmail.replace(/[\r\n]/g, '');

// Or use validation library
import validator from 'validator';
if (!validator.isEmail(userEmail)) {
  throw new Error('Invalid email');
}
```

**Nodemailer CVE-2021-23400:**
Versions before 6.6.1 vulnerable to header injection via address objects. Update to 6.6.1+.

**Sources:**
- Invicti Email Injection: https://www.invicti.com/learn/email-injection
- Snyk CVE-2021-23400: https://security.snyk.io/vuln/SNYK-JS-NODEMAILER-1296415
- PortSwigger SMTP Injection: https://portswigger.net/kb/issues/00200800_smtp-header-injection

---

### 2.2 Missing Unsubscribe Mechanism

**Risks:**
- CAN-SPAM/GDPR violations (fines up to €20M or 4% revenue)
- Increased spam complaints → domain reputation damage
- Blocklisting by major email providers
- Gmail/Yahoo delivery failures (as of 2024)

**Common Mistakes:**
- Unsubscribe link requires login
- Link leads to broken page
- Confirmation required for header-based unsubscribe
- GET request triggers unsubscribe (RFC 8058 requires POST)
- Processing takes more than 48 hours

---

### 2.3 No Delivery Tracking

**Problems:**
- No visibility into failed deliveries
- Can't identify problematic recipient addresses
- Unable to measure notification effectiveness
- No data for debugging customer complaints

**What to Track:**
| Channel | Minimum Events |
|---------|----------------|
| Email | sent, delivered, bounced, complained, opened, clicked |
| SMS | queued, sent, delivered, failed, undelivered |
| Push | sent, delivered (if available), opened |

---

### 2.4 Synchronous Sending Blocking Requests

**Anti-Pattern:**
```javascript
// WRONG - blocks HTTP response
app.post('/purchase', async (req, res) => {
  const order = await createOrder(req.body);
  await sendConfirmationEmail(order);  // 2-5 second delay!
  await sendSMSNotification(order);    // Another delay!
  res.json({ success: true });
});
```

**Correct Pattern:**
```javascript
// RIGHT - async queue
app.post('/purchase', async (req, res) => {
  const order = await createOrder(req.body);
  await notificationQueue.add('order-confirmation', { orderId: order.id });
  res.json({ success: true });  // Returns immediately
});

// Separate worker processes queue
notificationWorker.process('order-confirmation', async (job) => {
  const order = await getOrder(job.data.orderId);
  await sendConfirmationEmail(order);
  await sendSMSNotification(order);
});
```

---

### 2.5 Template Injection Vulnerabilities

**Server-Side Template Injection (SSTI):**
If users can control template content (e.g., custom email templates for venues), they may execute arbitrary code.

**Handlebars RCE Example (pre-4.6.0):**
```handlebars
{{#with "s" as |string|}}
  {{#with "e"}}
    {{#with split as |conslist|}}
      {{this.pop}}
      {{this.push (lookup string.sub "constructor")}}
      {{#with string.split as |codelist|}}
        {{this.pop}}
        {{this.push "return process.mainModule.require('child_process').execSync('cat /etc/passwd');"}}
        {{#each conslist}}
          {{#with (string.sub.apply 0 codelist)}}
            {{this}}
          {{/with}}
        {{/each}}
      {{/with}}
    {{/with}}
  {{/with}}
{{/with}}
```

**Prevention:**
- Use logic-less templates (Mustache) for user-editable content
- Update Handlebars to 4.6.0+ (prototype access disabled by default)
- Never compile user input as template
- Whitelist allowed template variables
- Sandbox template execution

**Sources:**
- HackerOne Shopify SSTI: https://hackerone.com/reports/423541
- PortSwigger SSTI: https://portswigger.net/web-security/server-side-template-injection

---

### 2.6 Sensitive Data in Notifications

**Data Leakage Risks:**
- Full credit card numbers in receipts
- Complete passwords in "your account" emails
- PII in notification metadata/logs
- QR codes/tickets visible in email previews

**Best Practices:**
- Mask card numbers (show last 4 only)
- Never send passwords (use reset links)
- Minimize PII in subject lines (visible in previews)
- Use time-limited tokens in URLs, not user IDs
- Encrypt sensitive notification content at rest

---

## 3. Audit Checklist for TicketToken

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

## 4. Monitoring & Alerting Checklist

### Metrics to Monitor
- [ ] Email bounce rate (alert if >5%)
- [ ] Email complaint rate (alert if >0.1%)
- [ ] Notification queue depth (alert on growth)
- [ ] DLQ depth (alert on any messages)
- [ ] Delivery latency (p95 time from queue to send)
- [ ] Provider API error rates
- [ ] SMS delivery success rate
- [ ] Push notification delivery rate
- [ ] Unsubscribe rate trends

### Dashboards
- [ ] Real-time notification volume by type
- [ ] Delivery status breakdown (success/bounce/fail)
- [ ] Geographic delivery patterns
- [ ] Provider health status

---

## 5. Compliance Summary

| Regulation | Key Requirements |
|------------|------------------|
| **CAN-SPAM (US)** | Unsubscribe link, physical address, honest subject lines, process opt-outs in 10 days |
| **GDPR (EU)** | Consent before marketing, separate transactional/marketing, data minimization |
| **CASL (Canada)** | Express consent for commercial messages, identification, unsubscribe |
| **TCPA (US SMS)** | Prior express consent for marketing SMS, opt-out handling |
| **Gmail/Yahoo 2024** | SPF+DKIM+DMARC, one-click unsubscribe, <0.3% spam rate |

---

## Sources Summary

### Email Authentication
- Google Sender Guidelines: https://support.google.com/a/answer/81126
- DMARC.org Best Practices: https://dmarc.org/2016/03/best-practices-for-email-senders/
- URIports SPF/DKIM/DMARC: https://www.uriports.com/blog/spf-dkim-dmarc-best-practices/

### Bounce/Complaint Handling
- AWS SES Notifications: https://docs.aws.amazon.com/ses/latest/dg/monitor-sending-activity-using-notifications.html
- AWS SES Bounce Handling: https://aws.amazon.com/blogs/messaging-and-targeting/handling-bounces-and-complaints/

### Unsubscribe/RFC 8058
- RFC 8058 Specification: https://datatracker.ietf.org/doc/html/rfc8058
- Mailgun RFC 8058 Guide: https://www.mailgun.com/blog/deliverability/what-is-rfc-8058/

### Security
- OWASP Node.js Security: https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html
- OWASP Injection Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Injection_Prevention_Cheat_Sheet.html
- Snyk Nodemailer CVE: https://security.snyk.io/vuln/SNYK-JS-NODEMAILER-1296415
- PortSwigger SSTI: https://portswigger.net/web-security/server-side-template-injection

### SMS
- Twilio Rate Limits: https://support.twilio.com/hc/en-us/articles/115002943027-Understanding-Twilio-Rate-Limits-and-Message-Queues
- Twilio Status Callbacks: https://www.twilio.com/docs/messaging/guides/outbound-message-logging

### Push Notifications
- FCM Token Management: https://firebase.google.com/docs/cloud-messaging/manage-tokens
- FCM iOS Client: https://firebase.google.com/docs/cloud-messaging/ios/client

### Queue Patterns
- AWS SNS Dead Letter Queues: https://docs.aws.amazon.com/sns/latest/dg/sns-dead-letter-queues.html
- Retry Patterns: https://dev.to/andreparis/queue-based-exponential-backoff-a-resilient-retry-pattern-for-distributed-systems-37f3