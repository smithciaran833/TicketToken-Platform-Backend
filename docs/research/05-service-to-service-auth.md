# Service-to-Service Authentication Research

## TicketToken Platform Security Audit Reference
**Stack:** Node.js, Fastify, TypeScript, 23 Microservices  
**Date:** December 2025

---

## Table of Contents
1. [Standards & Best Practices](#standards--best-practices)
2. [Common Vulnerabilities & Mistakes](#common-vulnerabilities--mistakes)
3. [Audit Checklists](#audit-checklists)
4. [Sources](#sources)

---

## Standards & Best Practices

### Internal Authentication Methods

#### Mutual TLS (mTLS)

mTLS is the gold standard for service-to-service authentication in zero trust environments. Unlike regular TLS where only the server authenticates to the client, mTLS requires both parties to authenticate using X.509 certificates.

**How it Works:**
1. Client initiates TLS connection and presents its certificate
2. Server validates client certificate against trusted CA
3. Server presents its certificate to client
4. Client validates server certificate
5. Secure channel established with mutual authentication

**Advantages:**
- Transport-layer security (works for any protocol)
- No bearer tokens transmitted over the wire (only public keys)
- Automatic encryption of all traffic
- Strong cryptographic identity verification
- Service mesh integration (Istio, Linkerd automate certificate management)

**Challenges:**
- Certificate provisioning and rotation complexity
- Key management infrastructure required
- Certificate revocation handling
- Higher initial setup complexity

**Implementation Considerations:**
- Use SPIFFE/SPIRE for automated identity provisioning
- Short-lived certificates reduce blast radius (hours, not years)
- Implement proper certificate rotation before expiry
- Consider service mesh for automatic mTLS

> "mTLS has become the gold standard for service-to-service authentication in Zero Trust environments. Unlike regular TLS where only the server authenticates to the client, mTLS requires both parties to authenticate to each other using X.509 certificates."  
> — Source: [Zero Trust Microservices Security Guide](https://www.springfuse.com/zero-trust-microservices-security/)

---

#### JSON Web Tokens (JWT) for Service Authentication

JWTs provide application-layer authentication and can carry authorization claims between services.

**Service-to-Service JWT Patterns:**

1. **Client Credentials Grant (OAuth 2.0)**
   - Service exchanges long-term credential for short-lived JWT
   - JWT contains service identity and scopes
   - Recipient validates signature locally using public key

2. **Internal Service Tokens**
   - API Gateway issues internal JWTs after authenticating external request
   - Internal JWT format differs from external tokens
   - Propagated to downstream services

**Best Practices:**
```javascript
// JWT Validation in Node.js/Fastify
const jwt = require('jsonwebtoken');

// Use RS256 (asymmetric) not HS256 (symmetric) for service tokens
// This allows any service to verify without sharing the secret
const verifyOptions = {
  algorithms: ['RS256'],
  issuer: 'auth.tickettoken.internal',
  audience: 'tickettoken-services'
};

// Validate token signature and claims
const decoded = jwt.verify(token, publicKey, verifyOptions);

// Check service identity
if (!allowedServices.includes(decoded.sub)) {
  throw new Error('Unauthorized service');
}
```

**Critical Considerations:**
- Use short expiration times (minutes, not hours) for service tokens
- Include service identity in `sub` claim
- Validate `iss`, `aud`, and `exp` claims
- Use asymmetric signing (RS256) so services can verify without the secret
- Never expose internal tokens externally

> "One of the most important differences between using client certs/mTLS, like a service mesh does, and JWTs for authentication is this: JWTs send the sensitive bearer token material over the wire, while mTLS does not."  
> — Source: [The New Stack - JWT vs mTLS](https://thenewstack.io/using-jwts-to-authenticate-services-unravels-api-gateways/)

---

#### HMAC Request Signing

HMAC provides message integrity and sender authentication using a shared secret, without sending the secret over the wire.

**How HMAC Authentication Works:**
1. Client and server share a secret key (never transmitted)
2. Client creates signature: `HMAC-SHA256(secret, message_data)`
3. Client sends request with signature in header
4. Server recalculates signature using same secret
5. If signatures match, request is authenticated and unmodified

**HMAC Request Structure:**
```javascript
// Client-side signing
const crypto = require('crypto');

function signRequest(method, path, body, timestamp, secret) {
  const stringToSign = [
    method.toUpperCase(),
    path,
    timestamp,
    body ? crypto.createHash('sha256').update(body).digest('hex') : ''
  ].join('\n');
  
  return crypto.createHmac('sha256', secret)
    .update(stringToSign)
    .digest('base64');
}

// Headers to send
const headers = {
  'X-Timestamp': timestamp,
  'X-Signature': signature,
  'X-Service-Id': 'order-service'
};
```

**Best Practices:**
- Include timestamp to prevent replay attacks
- Use nonce for additional replay protection
- Allow small clock skew (5-15 seconds)
- Sign relevant request data (method, path, body hash, headers)
- Use SHA-256 or stronger
- Rotate secrets regularly
- Store secrets in vault, never in code

> "HMAC is perfect for internal APIs, IoT devices, edge networks, and webhooks, where external calls to identity servers may not be possible."  
> — Source: [Authgear - HMAC API Security](https://www.authgear.com/post/hmac-api-security)

---

#### API Keys for Services

API keys are simple identifiers for service authentication. They are less secure than mTLS or JWT but may be appropriate for internal services with additional controls.

**When API Keys May Be Appropriate:**
- Internal services in trusted network
- Combined with other security measures (IP allowlisting, mTLS)
- For rate limiting and usage tracking

**Security Requirements:**
- Never transmit in query strings (logged by proxies)
- Always use HTTPS
- Implement key rotation
- Store keys in secrets manager
- Use per-service keys (not shared)
- Log all key usage for audit

**Node.js/Fastify Example:**
```javascript
// API Key validation hook
fastify.addHook('preHandler', async (request, reply) => {
  const apiKey = request.headers['x-api-key'];
  
  if (!apiKey) {
    throw new Error('Missing API key');
  }
  
  // Retrieve expected key from secrets manager
  const expectedKey = await secretsManager.getSecret(`service/${serviceId}/api-key`);
  
  // Constant-time comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(expectedKey))) {
    throw new Error('Invalid API key');
  }
  
  // Log for audit
  request.log.info({ serviceId, endpoint: request.url }, 'API key validated');
});
```

---

### Service Mesh Patterns

#### Istio

Istio provides comprehensive service mesh capabilities using Envoy sidecars.

**Key Security Features:**
- **Automatic mTLS**: Encrypts and authenticates all service-to-service traffic
- **PeerAuthentication**: Configures mTLS mode per namespace/workload
- **AuthorizationPolicy**: Fine-grained access control based on service identity
- **Citadel**: Certificate authority for identity management

**mTLS Configuration:**
```yaml
# Enforce strict mTLS for namespace
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: tickettoken-prod
spec:
  mtls:
    mode: STRICT

# Authorization policy - only allow specific services
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: payment-service-access
  namespace: tickettoken-prod
spec:
  selector:
    matchLabels:
      app: payment-service
  action: ALLOW
  rules:
  - from:
    - source:
        principals: 
          - "cluster.local/ns/tickettoken-prod/sa/order-service"
          - "cluster.local/ns/tickettoken-prod/sa/checkout-service"
```

> "Istio provides comprehensive security with configurable mTLS policies, sophisticated certificate management supporting external root certificates, and granular authorization policies for precise control over service-to-service communications."  
> — Source: [Zuplo - Istio vs Linkerd](https://zuplo.com/learning-center/istio-vs-linkerd)

---

#### Linkerd

Linkerd is a lightweight, security-focused service mesh using Rust-based proxies.

**Key Features:**
- **Automatic mTLS by default**: Zero-config encryption for all TCP connections
- **Lower latency**: 40-400% less overhead than Istio
- **Simpler operation**: Fewer components, easier to manage
- **SPIFFE-compatible identities**: Standard workload identity format

**Linkerd Configuration:**
```bash
# Install with strict mTLS
linkerd install --set proxy.defaultInboundPolicy=all-authenticated | kubectl apply -f -

# Mesh a namespace
kubectl annotate namespace tickettoken-prod linkerd.io/inject=enabled
kubectl rollout restart deployment -n tickettoken-prod

# Verify mTLS is active
linkerd viz edges deployment
```

> "Linkerd implements automatic mTLS for all TCP connections without complex configuration. Its Rust-based architecture inherently prevents many memory-related vulnerabilities."  
> — Source: [Zuplo - Istio vs Linkerd](https://zuplo.com/learning-center/istio-vs-linkerd)

---

### Zero Trust Architecture Principles

Zero Trust operates on the principle: **"Never trust, always verify."**

#### Core Principles for Microservices:

1. **Verify Explicitly**
   - Authenticate every request, even internal ones
   - Use strong service identity (mTLS, SPIFFE)
   - Validate tokens on every call, not just at gateway

2. **Least Privilege Access**
   - Each service only accesses what it needs
   - Fine-grained authorization policies
   - Time-limited credentials

3. **Assume Breach**
   - Encrypt all traffic (even internal)
   - Microsegment networks
   - Log everything for forensics
   - Monitor for anomalies

> "Zero Trust requires authentication and authorization for every API call, validates request schemas, and uses behavioral analysis to detect abuse patterns."  
> — Source: [OWASP Zero Trust Architecture Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Zero_Trust_Architecture_Cheat_Sheet.html)

**Implementation Checklist:**
- [ ] All service-to-service traffic uses mTLS or signed tokens
- [ ] No service trusts requests based on network location alone
- [ ] Every service validates caller identity before processing
- [ ] Authorization checked at each service, not just gateway
- [ ] All internal traffic is encrypted
- [ ] Comprehensive logging of all service interactions
- [ ] Network microsegmentation implemented
- [ ] Regular rotation of all credentials

---

### Service Identity and Verification

#### SPIFFE/SPIRE

SPIFFE (Secure Production Identity Framework For Everyone) is the standard for workload identity in cloud-native environments.

**Core Concepts:**
- **SPIFFE ID**: Universal identifier for workloads  
  Format: `spiffe://trust-domain/path`  
  Example: `spiffe://tickettoken.io/ns/prod/sa/order-service`

- **SVID (SPIFFE Verifiable Identity Document)**: Cryptographic proof of identity
  - X.509-SVID: Certificate for mTLS
  - JWT-SVID: Token for application layer

- **SPIRE**: Runtime implementation of SPIFFE
  - SPIRE Server: Central authority managing identities
  - SPIRE Agent: Runs on each node, issues SVIDs to workloads

**Benefits:**
- Dynamic identity issuance (no static secrets)
- Short-lived credentials (minutes, not months)
- Platform-agnostic (works across clouds)
- Attestation-based trust (proves workload identity)
- Federation across trust domains

> "In SPIFFE, identity is not granted statically or manually. Instead, every workload must undergo attestation—a process by which the SPIRE Agent verifies environmental attributes before issuing a SPIFFE ID."  
> — Source: [arXiv - SPIFFE for Zero Trust CI/CD](https://arxiv.org/html/2504.14760v1)

---

### Secret Rotation for Service Credentials

Proper secret rotation is critical for limiting the blast radius of credential compromise.

#### Rotation Strategies:

1. **Dual Credentials Pattern**
   - Maintain two active credentials simultaneously
   - Rotate one while the other remains active
   - Zero-downtime rotation

2. **Dynamic Secrets**
   - Generate credentials on-demand with short TTL
   - No static secrets to rotate
   - Use HashiCorp Vault or cloud secrets managers

3. **Automated Rotation**
   - Event-driven rotation (time-based or on-demand)
   - Automatic propagation to consuming services
   - Audit trail of all rotations

**Implementation with HashiCorp Vault:**
```javascript
// Dynamic database credentials
const vault = require('node-vault')();

async function getDatabaseCredentials() {
  // Get short-lived credentials (1-hour TTL)
  const { data } = await vault.read('database/creds/order-service-role');
  
  return {
    username: data.username,
    password: data.password,
    lease_duration: data.lease_duration
  };
}

// Renew before expiration
setInterval(async () => {
  await vault.renew({ lease_id: currentLease });
}, renewalInterval);
```

**Best Practices:**
- Rotate credentials at least every 90 days (30 days preferred)
- Use dynamic secrets where possible
- Implement automatic rotation with monitoring
- Log all rotation events
- Test rotation in staging before production
- Have emergency rotation procedures documented

> "Cryptographic assets like certificates, keys, and secrets have limited lifetimes. As a security best practice, these assets should be rotated regularly to reduce the risk of compromise."  
> — Source: [Microsoft - Azure Key Vault Autorotation](https://learn.microsoft.com/en-us/azure/key-vault/general/autorotation)

---

### Internal vs External API Boundaries

#### Boundary Types:

| Boundary | Authentication | Authorization | Rate Limiting | Input Validation |
|----------|----------------|---------------|---------------|------------------|
| **External → Gateway** | OAuth 2.0 / OIDC, API Keys | RBAC/ABAC at gateway | Per-client limits | Strict schema validation |
| **Gateway → Internal** | Internal JWT, mTLS | Propagate user context | Service limits | Schema validation |
| **Internal → Internal** | mTLS, HMAC, Service JWT | Service-level policies | Prevent cascade failure | Trust but validate |
| **Internal → External** | Client credentials, API keys | Outbound allowlist | Retry with backoff | Response validation |

#### Best Practices:

**External Token Transformation:**
```javascript
// Gateway transforms external token to internal representation
async function transformToken(externalToken) {
  // Validate external token (OAuth, API key, etc.)
  const externalClaims = await validateExternalToken(externalToken);
  
  // Create internal token with normalized claims
  const internalToken = jwt.sign({
    sub: externalClaims.userId,
    type: 'internal',
    permissions: mapExternalPermissions(externalClaims),
    originalIssuer: externalClaims.iss,
    exp: Math.floor(Date.now() / 1000) + 300 // 5 minutes
  }, internalSigningKey, { algorithm: 'RS256' });
  
  return internalToken;
}
```

**Key Principles:**
- Never expose internal tokens externally
- Transform external tokens at the boundary
- Internal tokens can carry user context for downstream authorization
- Different token formats for different boundary crossings
- Log boundary crossings for security monitoring

> "Decouple the access tokens issued for an external entity from its internal representation. Use a single data structure to represent and propagate the external entity identity among microservices."  
> — Source: [OWASP Microservices Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Microservices_Security_Cheat_Sheet.html)

---

### Message Queue Authentication

#### RabbitMQ Security

RabbitMQ supports multiple authentication mechanisms:

**Authentication Options:**
- Username/password (PLAIN, AMQPLAIN)
- X.509 client certificates (EXTERNAL mechanism)
- OAuth 2.0 (via plugin)
- LDAP (via plugin)

**TLS/mTLS Configuration:**
```erlang
% rabbitmq.conf
listeners.ssl.default = 5671
ssl_options.cacertfile = /path/to/ca_bundle.pem
ssl_options.certfile = /path/to/server_cert.pem
ssl_options.keyfile = /path/to/server_key.pem
ssl_options.verify = verify_peer
ssl_options.fail_if_no_peer_cert = true
```

**Per-Service Permissions:**
```bash
# Create service user with limited permissions
rabbitmqctl add_user order-service $SECURE_PASSWORD
rabbitmqctl set_permissions -p /production order-service \
  "^order\.(queue|exchange)\..*" \  # configure
  "^order\.exchange\..*" \           # write
  "^order\.queue\..*"                # read
```

> "RabbitMQ supports TLS encryption, SASL authentication, and RBAC. In addition to CLI tools, RabbitMQ offers a browser-based API for management and monitoring of users and queues."  
> — Source: [Instaclustr - RabbitMQ vs Kafka](https://www.instaclustr.com/blog/rabbitmq-vs-kafka/)

---

#### Apache Kafka Security

**Authentication Mechanisms:**
- SASL/PLAIN: Username/password
- SASL/SCRAM: Challenge-response with salted passwords
- SASL/GSSAPI: Kerberos
- SASL/OAUTHBEARER: OAuth 2.0
- mTLS: X.509 certificates

**Kafka Configuration:**
```properties
# Server configuration (server.properties)
listeners=SASL_SSL://0.0.0.0:9093
security.inter.broker.protocol=SASL_SSL
sasl.enabled.mechanisms=SCRAM-SHA-512
sasl.mechanism.inter.broker.protocol=SCRAM-SHA-512

# SSL settings
ssl.keystore.location=/var/private/ssl/kafka.server.keystore.jks
ssl.keystore.password=${KEYSTORE_PASSWORD}
ssl.key.password=${KEY_PASSWORD}
ssl.truststore.location=/var/private/ssl/kafka.server.truststore.jks
ssl.truststore.password=${TRUSTSTORE_PASSWORD}
ssl.client.auth=required
```

**ACL Configuration:**
```bash
# Create ACL for order-service producer
kafka-acls.sh --add \
  --allow-principal User:order-service \
  --producer \
  --topic orders \
  --bootstrap-server kafka:9093

# Create ACL for notification-service consumer
kafka-acls.sh --add \
  --allow-principal User:notification-service \
  --consumer \
  --topic orders \
  --group notification-consumer-group \
  --bootstrap-server kafka:9093
```

> "Kafka brokers can enable multiple mechanisms simultaneously, and clients can choose which to utilize for authentication. Of the supported authentication methods, mTLS, SASL SCRAM, and SASL GSSAPI are the current suggested authentication methods."  
> — Source: [Confluent - Secure Kafka Deployment](https://www.confluent.io/blog/secure-kafka-deployment-best-practices/)

---

## Common Vulnerabilities & Mistakes

### 1. No Authentication Between Internal Services

**The Problem:**
Many organizations trust internal network traffic, assuming it's safe because it's "inside the perimeter." This is the castle-and-moat fallacy.

**Real-World Impact:**
- A compromised service can access all other services
- Lateral movement in breaches becomes trivial
- No audit trail of service interactions
- Insider threats undetectable

**Signs of This Vulnerability:**
```javascript
// BAD: No authentication check
app.get('/internal/user/:id', async (req, res) => {
  const user = await userService.getUser(req.params.id);
  res.json(user);
});

// No headers checked, no token validation
// Anyone with network access can call this
```

**Remediation:**
```javascript
// GOOD: Verify service identity
app.get('/internal/user/:id', 
  verifyServiceToken,  // Validate JWT/mTLS/HMAC
  authorizeService(['order-service', 'checkout-service']),
  async (req, res) => {
    const user = await userService.getUser(req.params.id);
    res.json(user);
  }
);
```

> "The old security model is broken. Period. Trusting internal traffic blindly exposes your system to lateral attacks."  
> — Source: [DZone - Zero Trust API Security](https://dzone.com/articles/zero-trust-api-security-istio-opa)

---

### 2. Hardcoded Service Credentials

**The Problem:**
Embedding credentials in source code, configuration files, or Docker images creates persistent vulnerabilities that are extremely difficult to remediate.

**Why This Is Dangerous:**
- Credentials visible to anyone with code access
- Version control retains credential history forever
- Rotation requires code changes and redeployment
- Credentials often shared across environments

**Detection Pattern:**
```bash
# Search for potential hardcoded secrets
grep -rn "password\s*[:=]" --include="*.js" --include="*.ts"
grep -rn "API_KEY\s*[:=]" --include="*.js" --include="*.ts"
grep -rn "secret\s*[:=]" --include="*.js" --include="*.ts"

# Base64 encoded strings (often tokens)
grep -rn "[A-Za-z0-9+/]{40,}" --include="*.js" --include="*.ts"
```

**Remediation:**
```javascript
// BAD: Hardcoded credentials
const dbConfig = {
  host: 'db.internal',
  password: 'SuperSecret123!'  // NEVER DO THIS
};

// GOOD: Retrieve from secrets manager
const dbConfig = {
  host: process.env.DB_HOST,
  password: await secretsManager.getSecret('db/order-service/password')
};
```

> "Hardcoding API keys, database credentials, and certificates into application code is a common but insecure practice. In a microservices environment, where deployments happen frequently and services scale dynamically, this issue is magnified."  
> — Source: [Doppler - Secrets Management in Microservices](https://www.doppler.com/blog/how-microservices-make-secrets-management-more-complex)

---

### 3. Trusting Requests Based on Network Location Alone

**The Problem:**
Assuming that requests from certain IPs or networks are inherently trustworthy violates zero trust principles and ignores modern attack patterns.

**Why Network-Based Trust Fails:**
- VPNs and bastion hosts can be compromised
- Cloud networks are shared infrastructure
- Containers get ephemeral IPs
- Service mesh changes routing dynamically
- Attackers use legitimate entry points

**Signs of This Anti-Pattern:**
```javascript
// BAD: Trust based on IP
app.use((req, res, next) => {
  const clientIp = req.ip;
  if (internalNetwork.includes(clientIp)) {
    req.trusted = true;  // DANGEROUS ASSUMPTION
  }
  next();
});

// BAD: Security by obscurity
app.get('/admin/secrets', (req, res) => {
  // "Only internal services know this endpoint"
  // No authentication required
  res.json(secrets);
});
```

**Remediation:**
```javascript
// GOOD: Verify identity regardless of network
app.use(async (req, res, next) => {
  try {
    const serviceIdentity = await verifyMTLSCertificate(req);
    req.callerService = serviceIdentity;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Service authentication required' });
  }
});
```

> "Traditional security models often assumed that anything within the network perimeter was trustworthy. But in a microservices world, internal threats like a compromised service or malicious insider activity can be devastating."  
> — Source: [Medium - Zero Trust for Microservices](https://medium.com/@agustin.ignacio.rossi/beyond-the-perimeter-zero-trust-for-microservices-bdfacf1a9e44)

---

### 4. Missing Service Identity Verification

**The Problem:**
Services accept requests without verifying who is calling them, allowing any service (or attacker) to access any endpoint.

**Impact:**
- Privilege escalation between services
- Unauthorized data access
- No accountability for service actions
- Compliance violations

**Example Vulnerability:**
```javascript
// BAD: Accept any Bearer token without checking who issued it
const token = req.headers.authorization?.split(' ')[1];
if (token) {
  const decoded = jwt.decode(token);  // Only decodes, doesn't verify!
  req.user = decoded;
}

// BAD: No service identity check
app.post('/payment/process', async (req, res) => {
  // Any service can call this sensitive endpoint
  await processPayment(req.body);
});
```

**Remediation:**
```javascript
// GOOD: Verify token signature AND service identity
async function verifyServiceIdentity(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  try {
    // Verify signature with known public key
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'tickettoken-auth-service'
    });
    
    // Check that caller is an allowed service
    const allowedCallers = await getServiceACL(req.path);
    if (!allowedCallers.includes(decoded.sub)) {
      throw new Error(`Service ${decoded.sub} not authorized for ${req.path}`);
    }
    
    req.callerService = decoded.sub;
    next();
  } catch (err) {
    req.log.warn({ err, path: req.path }, 'Service identity verification failed');
    res.status(403).json({ error: 'Forbidden' });
  }
}
```

---

### 5. Shared Secrets Across All Services

**The Problem:**
Using the same API key, JWT signing key, or database password across multiple services means one compromise exposes everything.

**Why This Is Dangerous:**
- One leaked credential compromises all services
- Impossible to revoke access for one service
- No granular audit trail
- Credential rotation affects all services simultaneously

**Example Anti-Pattern:**
```javascript
// BAD: All services share the same JWT secret
const JWT_SECRET = process.env.JWT_SECRET;  // Same across all 23 services

// BAD: Shared database credentials
const DB_PASSWORD = 'SharedPassword123';  // All services use this
```

**Remediation:**
```javascript
// GOOD: Per-service credentials from secrets manager
const serviceId = process.env.SERVICE_ID;  // e.g., 'order-service'

const config = {
  jwtPublicKey: await secretsManager.getSecret(`services/${serviceId}/jwt-public-key`),
  dbCredentials: await secretsManager.getSecret(`services/${serviceId}/db-credentials`),
  serviceApiKey: await secretsManager.getSecret(`services/${serviceId}/api-key`)
};

// Each service has unique credentials
// Compromise of one doesn't affect others
// Rotation is per-service
```

---

### 6. No Audit Trail for Service-to-Service Calls

**The Problem:**
Without logging of inter-service communication, you cannot detect attacks, investigate breaches, or demonstrate compliance.

**What Must Be Logged:**
- Caller service identity
- Called service and endpoint
- Timestamp
- Request ID / Correlation ID
- Success or failure
- Authorization decision

**Signs of Missing Audit:**
```javascript
// BAD: No logging of service calls
app.get('/users/:id', async (req, res) => {
  const user = await db.getUser(req.params.id);
  res.json(user);  // Who called this? When? Why?
});
```

**Remediation:**
```javascript
// GOOD: Comprehensive audit logging
app.get('/users/:id', 
  verifyServiceToken,
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const user = await db.getUser(req.params.id);
      
      req.log.info({
        event: 'service_call',
        caller: req.callerService,
        callerIp: req.ip,
        endpoint: '/users/:id',
        userId: req.params.id,
        correlationId: req.headers['x-correlation-id'],
        duration: Date.now() - startTime,
        status: 'success'
      });
      
      res.json(user);
    } catch (err) {
      req.log.error({
        event: 'service_call_failed',
        caller: req.callerService,
        endpoint: '/users/:id',
        error: err.message,
        correlationId: req.headers['x-correlation-id']
      });
      throw err;
    }
  }
);
```

> "Complete visibility into all service interactions is essential, with centralized logging, behavioral analytics, and real-time monitoring to detect anomalies."  
> — Source: [Zero Trust Microservices Security Guide](https://www.springfuse.com/zero-trust-microservices-security/)

---

## Audit Checklists

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

## Sources

### OWASP Documentation
- OWASP Microservices Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Microservices_Security_Cheat_Sheet.html
- OWASP Zero Trust Architecture Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Zero_Trust_Architecture_Cheat_Sheet.html
- OWASP Secrets Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html

### Service Identity
- SPIFFE Official Site: https://spiffe.io/
- SPIFFE/SPIRE Zero Trust: https://www.haproxy.com/blog/zero-trust-mtls-automation-with-haproxy-and-spiffe-spire
- SPIFFE for Zero Trust CI/CD (arXiv): https://arxiv.org/html/2504.14760v1
- SPIFFE and SPIRE Demystified: https://www.spletzer.com/2025/03/zero-to-trusted-spiffe-and-spire-demystified/

### Service Mesh
- Istio mTLS Migration: https://istio.io/latest/docs/tasks/security/authentication/mtls-migration/
- Istio vs Linkerd Comparison: https://zuplo.com/learning-center/istio-vs-linkerd
- Service Mesh Performance Report: https://deepness-lab.org/wp-content/uploads/2024/05/Service_Mesh_Performance_Project_Report.pdf
- mTLS in Service Mesh (The New Stack): https://thenewstack.io/mutual-tls-microservices-encryption-for-service-mesh/

### Authentication Methods
- JWT vs mTLS for S2S Authentication (The New Stack): https://thenewstack.io/using-jwts-to-authenticate-services-unravels-api-gateways/
- HMAC API Security (Authgear): https://www.authgear.com/post/hmac-api-security
- HMAC Authentication (AuthX): https://www.authx.com/blog/hmac-hash-based-message-authentication-codes/
- Service-to-Service Authentication Patterns (Medium): https://kalpads.medium.com/service-to-service-authentication-authorisation-patterns-e7b0c342a44

### Secrets Management
- Azure Key Vault Best Practices: https://learn.microsoft.com/en-us/azure/key-vault/general/best-practices
- Azure Key Vault Secret Rotation: https://learn.microsoft.com/en-us/azure/key-vault/secrets/tutorial-rotation
- HashiCorp Vault AWS Secrets: https://developer.hashicorp.com/vault/api-docs/secret/aws
- Secrets Management in Microservices (Doppler): https://www.doppler.com/blog/how-microservices-make-secrets-management-more-complex
- Secrets Management in Microservices (CircleCI): https://circleci.com/blog/secrets-management-in-microservices-environments/
- Hardcoded Credentials Vulnerability (GitGuardian): https://blog.gitguardian.com/why-its-urgent-to-deal-with-your-hard-coded-credentials/

### Message Queue Security
- RabbitMQ Access Control: https://www.rabbitmq.com/docs/access-control
- RabbitMQ TLS Support: https://www.rabbitmq.com/docs/ssl
- Kafka Security Best Practices (Confluent): https://www.confluent.io/blog/secure-kafka-deployment-best-practices/
- OpenStack Messaging Security: https://docs.openstack.org/security-guide/messaging/security.html

### Zero Trust Architecture
- Zero Trust Microservices Security: https://www.springfuse.com/zero-trust-microservices-security/
- Zero Trust API Security (Cequence): https://www.cequence.ai/blog/api-security/zero-trust-api-security-model/
- Zero Trust API Security (DZone): https://dzone.com/articles/zero-trust-api-security-istio-opa
- Zero Trust for Microservices (IP With Ease): https://ipwithease.com/zero-trust-for-microservices/

### Node.js & Gateway
- JWT Authorization in Microservices Gateway (FusionAuth): https://fusionauth.io/blog/2020/11/12/jwt-authorization-microservices-gateway
- API Gateway as Microservices Superglue (Auth0): https://auth0.com/blog/apigateway-microservices-superglue/
- Authentication Patterns in Microservices (Nblocks): https://www.nblocks.dev/blog/authentication/authentication-in-microservices

### Security Challenges
- 10 Microservices Security Challenges (Kong): https://konghq.com/blog/engineering/10-ways-microservices-create-new-security-challenges
- API Security Patterns: https://securitypatterns.io/docs/05-api-microservices-security-pattern/

---

*Document generated for TicketToken security audit. December 2025.*