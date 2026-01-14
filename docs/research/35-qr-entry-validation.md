# QR Code Ticket Validation Security
## Production Audit Guide for TicketToken

**Version:** 1.0  
**Date:** December 2025  
**Purpose:** Ensure secure, tamper-proof ticket validation at venue entry points with comprehensive protection against forgery, replay attacks, and unauthorized access

---

## Table of Contents
1. [Standards & Best Practices](#1-standards--best-practices)
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist](#3-audit-checklist)
4. [Implementation Patterns](#4-implementation-patterns)
5. [Sources](#5-sources)

---

## 1. Standards & Best Practices

### 1.1 QR Code Content and Security

The data encoded within QR codes determines the foundation of ticket security.

#### What Should Be in the QR Code

**Minimal Approach (Reference-Only):**
- Unique ticket identifier (UUID)
- Cryptographic signature of the identifier

**Self-Contained Approach (Offline-Capable):**
- Ticket ID
- Event ID
- Timestamp of issuance
- Expiration time
- Ticket type/tier
- Cryptographic signature covering all fields

> "Use cryptographic hashing to convert ticket data into fixed-length codes stored in a verified database. Print the unique hash string as a text or QR barcode on each ticket. At event entry, scan the code and verify it exists only once in the database before allowing access."

**Source:** https://www.scoredetect.com/blog/posts/safeguarding-event-tickets-digital-anti-counterfeit-measures

#### Cryptographic Signing

QR codes should be cryptographically signed to prevent tampering and forgery.

> "JWTs can be signed using a secret (with the HMAC algorithm) or a public/private key pair using RSA or ECDSA. Although JWTs can be encrypted to also provide secrecy between parties, we will focus on signed tokens. Signed tokens can verify the integrity of the claims contained within it."

**Source:** https://www.jwt.io/introduction

**Signing Algorithm Recommendations:**

| Algorithm | Key Type | Use Case | Notes |
|-----------|----------|----------|-------|
| **HS256** | Symmetric | Single-system validation | Same key for sign/verify; simpler but less flexible |
| **RS256** | Asymmetric | Multi-system validation | Private key signs, public key verifies; better for distributed systems |
| **ES256** | Asymmetric | Size-constrained QR codes | Smaller signatures than RSA; recommended for QR codes |

> "ECDSA (Elliptic Curve Digital Signature Algorithm) is also an asymmetric algorithm that uses a public and private key pair but is based on elliptic curve cryptography, offering faster performance and smaller key sizes compared to RSA."

**Source:** https://workos.com/blog/hmac-vs-rsa-vs-ecdsa-which-algorithm-should-you-use-to-sign-jwts

#### JWT-Based QR Code Structure

```javascript
// QR Code contains a signed JWT
const ticketPayload = {
  // Standard JWT claims
  iss: 'tickettoken.io',           // Issuer
  sub: 'ticket:uuid-12345',        // Subject (ticket ID)
  aud: 'venue:madison-square',     // Audience (venue)
  exp: 1703444400,                 // Expiration (event end time)
  nbf: 1703430000,                 // Not before (event start time)
  iat: 1702000000,                 // Issued at
  jti: 'unique-token-id',          // JWT ID (for replay prevention)
  
  // Custom claims
  eventId: 'evt_abc123',
  ticketType: 'general_admission',
  seat: null,
  ownerWallet: '0x1234...5678',
  transferCount: 0
};

// Sign with ES256 (ECDSA)
const token = jwt.sign(ticketPayload, privateKey, { algorithm: 'ES256' });

// QR code encodes the token string
const qrContent = token;
```

#### Critical JWT Security Considerations

> "One of the most serious vulnerabilities encountered with JWTs is when the application fails to validate that the signature is correct. As well as the public key and HMAC-based algorithms, the JWT specification also defines a signature algorithm called none. As the name suggests, this means that there is no signature for the JWT, allowing it to be modified."

**Source:** https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/06-Session_Management_Testing/10-Testing_JSON_Web_Tokens

**Key Security Rules:**
1. **Always validate signatures** - Never accept unsigned tokens
2. **Reject `alg: none`** - Explicitly block the "none" algorithm
3. **Validate all claims** - Check `exp`, `nbf`, `iss`, `aud`
4. **Use strong keys** - Minimum 256 bits for HMAC; 2048+ for RSA

### 1.2 Validation Endpoint Security

The API endpoint that validates tickets must be protected against unauthorized access and abuse.

#### Authentication Requirements

> "Bearer authentication (also called token authentication) is an HTTP authentication scheme that involves security tokens called bearer tokens. The name 'Bearer authentication' can be understood as 'give access to the bearer of this token.'"

**Source:** https://swagger.io/docs/specification/v3_0/authentication/bearer-authentication/

**Endpoint Protection Layers:**

| Layer | Implementation | Purpose |
|-------|----------------|---------|
| **TLS/HTTPS** | Mandatory | Encrypt all traffic |
| **Bearer Token** | OAuth 2.0 / API Key | Authenticate scanning devices |
| **Device Registration** | Unique device IDs | Limit to authorized scanners |
| **Rate Limiting** | Per-device throttling | Prevent abuse |
| **IP Allowlisting** | Venue IP ranges | Restrict access by location |

> "Secure REST services must only provide HTTPS endpoints. This protects authentication credentials in transit, for example passwords, API keys or JSON Web Tokens."

**Source:** https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html

#### OWASP API Security Considerations

> "Authentication mechanisms are often implemented incorrectly, allowing attackers to compromise authentication tokens or to exploit implementation flaws to assume other user's identities temporarily or permanently."

**Source:** https://owasp.org/www-project-api-security/

**API Security Best Practices:**
- Implement object-level authorization checks on every endpoint
- Validate that the logged-in user/device has permission to perform the validation
- Use short-lived access tokens with refresh mechanisms
- Log all validation attempts for audit

```javascript
// Validation endpoint with authentication
app.post('/api/v1/tickets/validate', 
  authenticateDevice,           // Verify device bearer token
  rateLimit({ windowMs: 60000, max: 100 }), // Rate limit
  async (req, res) => {
    const { qrContent, deviceId, gateId } = req.body;
    
    // Verify device is authorized for this event
    if (!await isDeviceAuthorized(deviceId, event.id)) {
      return res.status(403).json({ error: 'Device not authorized' });
    }
    
    // Validate ticket...
  }
);
```

### 1.3 Preventing Replay Attacks

Replay attacks occur when a valid QR code is reused multiple times.

#### Understanding Replay Attacks

> "A replay attack (also known as a repeat attack or playback attack) is a form of network attack in which valid data transmission is maliciously or fraudulently repeated or delayed. This is carried out either by the originator or by an adversary who intercepts the data and re-transmits it."

**Source:** https://en.wikipedia.org/wiki/Replay_attack

#### Prevention Strategies

**1. Single-Use Tokens (Nonces)**

> "Another way to prevent replay attacks is to use nonce-based tokens, which are valid only for a single use and cannot be reused. A nonce is a random number or string that is added to the token and sent along with it. The receiver checks that the nonce has not been used before and rejects any duplicate tokens."

**Source:** https://www.linkedin.com/advice/0/how-can-you-protect-against-replay-attacks-daoyf

```javascript
// Mark ticket as used immediately upon validation
async function validateAndMarkUsed(ticketId, eventId) {
  const result = await db.transaction(async (trx) => {
    // Atomic check-and-set
    const ticket = await trx('tickets')
      .where({ id: ticketId, event_id: eventId })
      .forUpdate()  // Row-level lock
      .first();
    
    if (!ticket) {
      return { valid: false, reason: 'TICKET_NOT_FOUND' };
    }
    
    if (ticket.scanned_at) {
      return { 
        valid: false, 
        reason: 'ALREADY_SCANNED',
        scannedAt: ticket.scanned_at,
        scannedGate: ticket.scanned_gate
      };
    }
    
    // Mark as used
    await trx('tickets')
      .where({ id: ticketId })
      .update({ 
        scanned_at: new Date(),
        scanned_gate: gateId,
        scanned_device: deviceId
      });
    
    return { valid: true, ticket };
  });
  
  return result;
}
```

**2. Time-Based Tokens (TOTP)**

Ticketmaster's SafeTix uses rotating barcodes based on TOTP:

> "Ticketmaster SafeTix are powered by a new and unique barcode that automatically refreshes every 15 seconds. This greatly reduces the risk of ticket fraud from stolen or illegal counterfeit tickets."

**Source:** https://www.ticketmaster.com/safetix

> "It is a standard PDF417 barcode, which contains a long Base64 string, two six-digit numbers, and a Unix timestamp all concatenated together with colons. The only parts of the string that seemed to change over time were the two six-digit numbers... it's just a Time-based one-time password (TOTP)."

**Source:** https://hackaday.com/2024/07/11/ticketmaster-safetix-reverse-engineered/

```javascript
// Dynamic/rotating barcode implementation
import { authenticator } from 'otplib';

function generateDynamicBarcode(ticketId, customerSecret, ticketSecret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const customerTOTP = authenticator.generate(customerSecret);
  const ticketTOTP = authenticator.generate(ticketSecret);
  
  const payload = {
    ticketId: ticketId,
    totp1: customerTOTP,
    totp2: ticketTOTP,
    ts: timestamp
  };
  
  return base64Encode(JSON.stringify(payload));
}

// Validation side
function validateDynamicBarcode(barcodeContent) {
  const { ticketId, totp1, totp2, ts } = JSON.parse(base64Decode(barcodeContent));
  
  // Check timestamp is recent (within 30 seconds)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 30) {
    return { valid: false, reason: 'EXPIRED_BARCODE' };
  }
  
  // Retrieve secrets and verify TOTPs
  const { customerSecret, ticketSecret } = await getTicketSecrets(ticketId);
  
  const expectedCustomerTOTP = authenticator.generate(customerSecret);
  const expectedTicketTOTP = authenticator.generate(ticketSecret);
  
  if (totp1 !== expectedCustomerTOTP || totp2 !== expectedTicketTOTP) {
    return { valid: false, reason: 'INVALID_TOTP' };
  }
  
  return { valid: true };
}
```

**3. Timestamp Validation**

> "Timestamping is another way of preventing a replay attack. Synchronization should be achieved using a secure protocol. For example, Bob periodically broadcasts the time on his clock together with a MAC. When Alice wants to send Bob a message, she includes her best estimate of the time on his clock in her message, which is also authenticated. Bob only accepts messages for which the timestamp is within a reasonable tolerance."

**Source:** https://en.wikipedia.org/wiki/Replay_attack

### 1.4 Offline Validation Scenarios

Internet connectivity at venues is often unreliable.

> "The ideal method to validate tickets is to host a ticket database online. In that way, all scanning devices are all connected in real-time to that database and thus all devices are in sync. However, if Internet connectivity becomes slow or unstable then the validation process takes longer, lines build quickly, and ticket holders get annoyed."

**Source:** https://www.codereadr.com/blog/ticket-fraud/

#### Offline Validation Approaches

**1. Pre-Downloaded Database**

> "Before your event, the app downloads the complete ticket database to each device, including validation rules and access permissions. During operation, the app can scan and validate tickets without any internet connection."

**Source:** https://www.ticketfairy.com/us/event-ticketing/ticket-scanning-app

**2. Auto-Sync with Background Updates**

> "What's special about AutoSync is that scans validated offline are automatically uploaded every 2 seconds to a shared online database. The newly synced database is automatically downloaded every 2 minutes to each device."

**Source:** https://www.codereadr.com/blog/ticket-fraud/

**3. Cryptographic Offline Validation**

For self-contained tickets with signatures:

```javascript
// Offline validation using asymmetric cryptography
function validateTicketOffline(qrContent, publicKey, localScanCache) {
  // 1. Decode and verify signature
  const { payload, signature } = decodeQR(qrContent);
  
  const isSignatureValid = crypto.verify(
    'sha256',
    Buffer.from(JSON.stringify(payload)),
    publicKey,
    signature
  );
  
  if (!isSignatureValid) {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }
  
  // 2. Check expiration
  const now = Date.now() / 1000;
  if (payload.exp < now) {
    return { valid: false, reason: 'TICKET_EXPIRED' };
  }
  
  if (payload.nbf > now) {
    return { valid: false, reason: 'TICKET_NOT_YET_VALID' };
  }
  
  // 3. Check local cache for replay
  const cacheKey = `${payload.jti}:${payload.sub}`;
  if (localScanCache.has(cacheKey)) {
    return { 
      valid: false, 
      reason: 'ALREADY_SCANNED_OFFLINE',
      previousScan: localScanCache.get(cacheKey)
    };
  }
  
  // 4. Mark as scanned in local cache
  localScanCache.set(cacheKey, {
    scannedAt: new Date().toISOString(),
    deviceId: deviceId
  });
  
  return { valid: true, payload };
}
```

#### Offline Security Considerations

| Risk | Mitigation |
|------|------------|
| **Multiple gates can't sync** | Assign ticket ranges to specific gates |
| **Stale data** | Sync before gates open; periodic sync attempts |
| **Device compromise** | Encrypt local database; require device auth |
| **Conflict resolution** | First-scan-wins with timestamp |

> "If you have more than 1 gate, since the devices cannot communicate through the network and so there is no central list to be used, each gate should only admit a subset (a range) of tickets so that duplicates can be identified."

**Source:** https://www.ticketor.com/Account/Blog/Gate-control-and-e-ticket-validation

### 1.5 Staff Authentication for Scanning

#### Role-Based Access Control

> "Assign customizable access levels (e.g. VIP, backstage, vendor zones) and manage permissions in real-time. Restrict or grant access to specific areas with granular control."

**Source:** https://passkit.com/blog/event-access-control/

**Staff Access Levels:**

| Role | Permissions |
|------|-------------|
| **Gate Staff** | Validate tickets, view basic attendee info |
| **Supervisor** | Override scans, manual check-in, view scan history |
| **Manager** | Real-time analytics, capacity management, staff assignment |
| **Admin** | Full access, device management, configuration |

> "Optimise the management of your event and teams by creating specific operator IDs. These IDs, which can be assigned to every member of your team, allow you to fine-tune your access management, grant specific permissions and minimise the risk of errors."

**Source:** https://weezevent.com/en-gb/weezaccess/access-control/

#### Device Authentication

```javascript
// Staff and device authentication flow
async function authenticateScanner(credentials) {
  const { staffId, deviceId, pin, eventId } = credentials;
  
  // 1. Verify staff credentials
  const staff = await db('event_staff')
    .where({ staff_id: staffId, event_id: eventId })
    .first();
  
  if (!staff || !await verifyPin(pin, staff.pin_hash)) {
    await logAuthAttempt(staffId, deviceId, 'FAILED', 'Invalid credentials');
    throw new AuthError('Invalid staff credentials');
  }
  
  // 2. Verify device is registered for this event
  const device = await db('scanning_devices')
    .where({ device_id: deviceId, event_id: eventId })
    .first();
  
  if (!device) {
    await logAuthAttempt(staffId, deviceId, 'FAILED', 'Unregistered device');
    throw new AuthError('Device not registered for this event');
  }
  
  // 3. Check staff is assigned to this gate
  if (device.assigned_gate && staff.assigned_gate !== device.assigned_gate) {
    await logAuthAttempt(staffId, deviceId, 'FAILED', 'Gate mismatch');
    throw new AuthError('Staff not assigned to this gate');
  }
  
  // 4. Generate session token
  const sessionToken = await generateStaffSession({
    staffId,
    deviceId,
    eventId,
    permissions: staff.permissions,
    gateId: device.assigned_gate,
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) // 8 hours
  });
  
  await logAuthAttempt(staffId, deviceId, 'SUCCESS', null);
  
  return { sessionToken, permissions: staff.permissions };
}
```

### 1.6 Real-Time vs Batch Validation

#### Real-Time Validation

**Advantages:**
- Instant duplicate detection across all gates
- Immediate capacity updates
- Live analytics and dashboards
- Transferred tickets validated instantly

**Requirements:**
- Reliable internet connectivity
- Low-latency backend (<500ms response)
- Database optimized for concurrent reads

#### Batch/Offline Validation with Sync

> "Once your access control devices have been synchronised, data is stored locally on each device. This means that you can continue scanning your attendees' tickets even in the event of a network outage."

**Source:** https://weezevent.com/en-gb/weezaccess/access-control/

**Implementation:**

```javascript
// Batch sync implementation
class OfflineSyncManager {
  constructor() {
    this.pendingScans = [];
    this.lastSyncTime = null;
    this.syncInterval = 2000; // 2 seconds
  }
  
  async addScan(scanData) {
    // Store locally
    this.pendingScans.push({
      ...scanData,
      localTimestamp: new Date().toISOString(),
      synced: false
    });
    
    await this.persistLocally();
    this.attemptSync();
  }
  
  async attemptSync() {
    if (!navigator.onLine) return;
    
    const unsynced = this.pendingScans.filter(s => !s.synced);
    if (unsynced.length === 0) return;
    
    try {
      const response = await fetch('/api/v1/tickets/batch-sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scans: unsynced,
          deviceId: this.deviceId,
          lastSyncTime: this.lastSyncTime
        })
      });
      
      const result = await response.json();
      
      // Mark synced scans
      result.syncedIds.forEach(id => {
        const scan = this.pendingScans.find(s => s.id === id);
        if (scan) scan.synced = true;
      });
      
      // Handle conflicts (ticket already scanned elsewhere)
      result.conflicts.forEach(conflict => {
        this.handleConflict(conflict);
      });
      
      // Update local database with server state
      if (result.updatedTickets) {
        await this.updateLocalDatabase(result.updatedTickets);
      }
      
      this.lastSyncTime = new Date().toISOString();
      
    } catch (error) {
      console.warn('Sync failed, will retry:', error);
    }
  }
}
```

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 QR Code Easily Forged

#### The Problem

QR codes without cryptographic protection can be trivially forged.

> "QR codes are everywhere—tickets, ID cards, product packaging, menus, and even Wi-Fi setups. They've become a cornerstone of convenience, and most of us scan them without hesitation. But here's the thing: most QR codes aren't cryptographically signed. In practice, this means we're trusting their contents without any way to confirm they're authentic or haven't been tampered with."

**Source:** https://unmitigatedrisk.com/?p=933

#### Common Mistakes

| Mistake | Risk | Fix |
|---------|------|-----|
| QR contains only ticket ID | Anyone can generate valid-looking QRs | Sign the content cryptographically |
| Sequential ticket IDs | Easy to guess valid IDs | Use UUIDs or random identifiers |
| No signature verification | Forged tickets accepted | Validate signature on every scan |
| Weak/guessable secrets | Signatures can be forged | Use cryptographically secure keys |

#### Proper Implementation

> "The QR code contains the protected data in plaintext and a cryptographic signature, which acts as an indisputable mathematical proof of the link between the data to be protected and its digital security seal."

**Source:** https://www.certusdoc.com/digital-seal-technology/

```javascript
// Secure QR code generation
function generateSecureTicketQR(ticketData, privateKey) {
  const payload = {
    tid: ticketData.ticketId,      // Ticket ID (UUID)
    eid: ticketData.eventId,       // Event ID
    tt: ticketData.ticketType,     // Ticket type
    exp: ticketData.eventEndTime,  // Expiration
    iat: Date.now() / 1000,        // Issued at
    nonce: crypto.randomBytes(8).toString('hex') // Unique per generation
  };
  
  // Create signature using ECDSA
  const signature = crypto.sign(
    'sha256',
    Buffer.from(JSON.stringify(payload)),
    privateKey
  );
  
  // Combine payload and signature
  const qrContent = {
    p: payload,
    s: signature.toString('base64')
  };
  
  return JSON.stringify(qrContent);
}
```

### 2.2 No Authentication on Validation Endpoint

#### The Problem

Unprotected validation endpoints allow attackers to:
- Brute-force valid ticket IDs
- Probe for ticket validity before purchase
- Perform denial-of-service attacks
- Validate forged tickets

> "Every API endpoint that receives an ID of an object, and performs any action on the object, should implement object-level authorization checks. The checks should validate that the logged-in user has permissions to perform the requested action on the requested object."

**Source:** https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/

#### Authentication Requirements

```javascript
// WRONG: No authentication
app.post('/validate', (req, res) => {
  const ticket = validateTicket(req.body.qrContent);
  res.json(ticket);
});

// RIGHT: Multi-layer authentication
app.post('/validate',
  // 1. Require valid API key
  requireApiKey(),
  
  // 2. Verify device is registered
  verifyRegisteredDevice(),
  
  // 3. Check staff session
  verifyStaffSession(),
  
  // 4. Rate limit
  rateLimit({ windowMs: 60000, max: 300 }),
  
  // 5. Log all attempts
  auditLog(),
  
  async (req, res) => {
    const { qrContent, gateId } = req.body;
    const { deviceId, staffId, eventId } = req.auth;
    
    // Verify this device is assigned to this event/gate
    const authorized = await checkDeviceAuthorization(deviceId, eventId, gateId);
    if (!authorized) {
      return res.status(403).json({ error: 'Not authorized for this gate' });
    }
    
    const result = await validateTicket(qrContent, { deviceId, staffId, gateId });
    res.json(result);
  }
);
```

### 2.3 Same QR Code Usable Multiple Times

#### The Problem

Without proper replay prevention, a single QR code can grant multiple entries.

> "Replay attacks can be prevented by tagging each encrypted component with a session ID and a component number. This combination of solutions does not use anything that is interdependent on one another."

**Source:** https://en.wikipedia.org/wiki/Replay_attack

#### Attack Scenarios

| Scenario | How It Happens | Impact |
|----------|----------------|--------|
| **Screenshot sharing** | User sends photo to friends | Multiple unauthorized entries |
| **Forwarded email** | Ticket email forwarded | Untracked entry |
| **Screen mirroring** | Same QR displayed on multiple devices | Duplicate entries |
| **Ticket resale fraud** | Seller enters with screenshot after resale | Buyer denied entry |

#### Prevention Techniques

**1. Database-Backed Single-Use Check**

```javascript
// Atomic check-and-mark with database transaction
async function validateWithReplayPrevention(ticketId) {
  return await db.transaction(async (trx) => {
    // Lock the row to prevent race conditions
    const ticket = await trx('tickets')
      .where({ id: ticketId })
      .forUpdate()
      .first();
    
    if (ticket.status === 'scanned') {
      // Already used!
      return {
        valid: false,
        reason: 'ALREADY_SCANNED',
        originalScan: {
          time: ticket.scanned_at,
          gate: ticket.scanned_gate,
          device: ticket.scanned_device
        }
      };
    }
    
    // Mark as scanned atomically
    await trx('tickets')
      .where({ id: ticketId })
      .update({
        status: 'scanned',
        scanned_at: new Date(),
        scanned_gate: gateId,
        scanned_device: deviceId
      });
    
    return { valid: true };
  });
}
```

**2. Dynamic/Rotating Barcodes**

> "These barcodes change every 15 seconds, creating a moving target for would-be counterfeiters. If you look closely at a SafeTix ticket on a phone screen, you'll see the barcode has a subtle, gliding movement. That's the anti-fraud technology in action."

**Source:** https://theticketlover.com/what-is-ticketmaster-safetix/

### 2.4 No Handling of Transferred Tickets

#### The Problem

When tickets are transferred (sold, gifted, or resold), the QR code must update.

**Common Failures:**
- Original owner retains valid QR code
- New owner receives old QR code
- Both owners can enter
- Transfer not reflected at gate

#### Proper Transfer Handling

```javascript
// When ticket is transferred
async function transferTicket(ticketId, fromUser, toUser) {
  return await db.transaction(async (trx) => {
    // 1. Verify current ownership
    const ticket = await trx('tickets')
      .where({ id: ticketId, owner_id: fromUser })
      .first();
    
    if (!ticket) {
      throw new Error('Ticket not found or not owned by sender');
    }
    
    // 2. Invalidate old QR code by regenerating secrets
    const newTicketSecret = crypto.randomBytes(32).toString('hex');
    const newNonce = crypto.randomBytes(16).toString('hex');
    
    // 3. Update ownership and secrets
    await trx('tickets')
      .where({ id: ticketId })
      .update({
        owner_id: toUser,
        ticket_secret: newTicketSecret,
        qr_nonce: newNonce,
        transfer_count: ticket.transfer_count + 1,
        transferred_at: new Date()
      });
    
    // 4. Record transfer for audit
    await trx('ticket_transfers').insert({
      ticket_id: ticketId,
      from_user: fromUser,
      to_user: toUser,
      transferred_at: new Date()
    });
    
    // 5. Generate new QR for new owner
    const newQR = await generateSecureTicketQR({
      ticketId,
      secret: newTicketSecret,
      nonce: newNonce
    });
    
    return { success: true, newQR };
  });
}
```

#### NFT Ticket Transfer Security

For blockchain-based tickets:

> "Upon sale or re-sale the tickets are transferred into Ethereum-based wallets... The event ushers use devices with software that can instantly check if a wallet address owns NFTs that grant entry to the event."

**Source:** https://www.web3contrail.com/nft-ticket-scanning-solution/

```javascript
// Validate NFT ticket ownership
async function validateNFTTicket(walletAddress, signature, message) {
  // 1. Verify wallet ownership via signature
  const recoveredAddress = ethers.utils.verifyMessage(message, signature);
  if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }
  
  // 2. Check NFT ownership on-chain
  const ticketContract = new ethers.Contract(
    TICKET_NFT_ADDRESS,
    TICKET_ABI,
    provider
  );
  
  const balance = await ticketContract.balanceOf(walletAddress);
  if (balance.eq(0)) {
    return { valid: false, reason: 'NO_TICKET_OWNED' };
  }
  
  // 3. Get ticket ID and verify event
  const tokenId = await ticketContract.tokenOfOwnerByIndex(walletAddress, 0);
  const ticketData = await ticketContract.getTicketData(tokenId);
  
  if (ticketData.eventId !== eventId) {
    return { valid: false, reason: 'WRONG_EVENT' };
  }
  
  // 4. Check if already scanned (off-chain database)
  const scanRecord = await db('nft_scans')
    .where({ token_id: tokenId.toString() })
    .first();
  
  if (scanRecord) {
    return { valid: false, reason: 'ALREADY_SCANNED' };
  }
  
  return { valid: true, tokenId, ticketData };
}
```

### 2.5 Validation Possible Before Event

#### The Problem

Tickets should only be scannable within a defined time window.

**Risks of Early Validation:**
- Tickets scanned hours/days before event
- Time-based attacks on rotating codes
- Confusion over valid scan times

#### Time Window Enforcement

```javascript
function validateTimeWindow(ticket, eventConfig) {
  const now = Date.now() / 1000;
  
  // Default: 2 hours before event start
  const earliestEntry = eventConfig.doorsOpen || 
                        (eventConfig.startTime - 2 * 60 * 60);
  
  // Latest entry: event end time
  const latestEntry = eventConfig.endTime;
  
  if (now < earliestEntry) {
    const waitMinutes = Math.ceil((earliestEntry - now) / 60);
    return {
      valid: false,
      reason: 'TOO_EARLY',
      message: `Doors open in ${waitMinutes} minutes`,
      doorsOpen: new Date(earliestEntry * 1000).toISOString()
    };
  }
  
  if (now > latestEntry) {
    return {
      valid: false,
      reason: 'EVENT_ENDED',
      message: 'This event has ended'
    };
  }
  
  return { valid: true };
}
```

---

## 3. Audit Checklist

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

## 4. Implementation Patterns

### 4.1 Complete Validation Service

```javascript
class TicketValidationService {
  constructor(config) {
    this.db = config.database;
    this.crypto = config.cryptoProvider;
    this.cache = config.redisCache;
    this.eventId = config.eventId;
    this.publicKey = config.publicKey;
  }

  async validate(qrContent, context) {
    const { deviceId, staffId, gateId } = context;
    const startTime = Date.now();
    
    try {
      // 1. Parse and verify signature
      const parseResult = this.parseAndVerifyQR(qrContent);
      if (!parseResult.valid) {
        return this.recordValidation(parseResult, context, startTime);
      }
      
      const ticketData = parseResult.payload;
      
      // 2. Validate time window
      const timeResult = this.validateTimeWindow(ticketData);
      if (!timeResult.valid) {
        return this.recordValidation(timeResult, context, startTime);
      }
      
      // 3. Check ticket exists and get current state
      const ticket = await this.getTicket(ticketData.tid);
      if (!ticket) {
        return this.recordValidation({
          valid: false,
          reason: 'TICKET_NOT_FOUND'
        }, context, startTime);
      }
      
      // 4. Verify ticket is for this event
      if (ticket.event_id !== this.eventId) {
        return this.recordValidation({
          valid: false,
          reason: 'WRONG_EVENT',
          expectedEvent: ticket.event_id
        }, context, startTime);
      }
      
      // 5. Check replay (already scanned)
      const replayResult = await this.checkAndMarkScanned(ticket, context);
      if (!replayResult.valid) {
        return this.recordValidation(replayResult, context, startTime);
      }
      
      // 6. Success!
      const successResult = {
        valid: true,
        ticketId: ticket.id,
        ticketType: ticket.type,
        attendeeName: ticket.attendee_name,
        seat: ticket.seat,
        specialInstructions: ticket.special_instructions
      };
      
      return this.recordValidation(successResult, context, startTime);
      
    } catch (error) {
      console.error('Validation error:', error);
      return this.recordValidation({
        valid: false,
        reason: 'SYSTEM_ERROR'
      }, context, startTime);
    }
  }

  parseAndVerifyQR(qrContent) {
    try {
      const { p: payload, s: signature } = JSON.parse(qrContent);
      
      // Verify signature
      const isValid = this.crypto.verify(
        'sha256',
        Buffer.from(JSON.stringify(payload)),
        this.publicKey,
        Buffer.from(signature, 'base64')
      );
      
      if (!isValid) {
        return { valid: false, reason: 'INVALID_SIGNATURE' };
      }
      
      return { valid: true, payload };
      
    } catch (error) {
      return { valid: false, reason: 'INVALID_QR_FORMAT' };
    }
  }

  validateTimeWindow(ticketData) {
    const now = Date.now() / 1000;
    
    if (ticketData.nbf && now < ticketData.nbf) {
      return {
        valid: false,
        reason: 'TOO_EARLY',
        doorsOpen: new Date(ticketData.nbf * 1000).toISOString()
      };
    }
    
    if (ticketData.exp && now > ticketData.exp) {
      return {
        valid: false,
        reason: 'TICKET_EXPIRED'
      };
    }
    
    return { valid: true };
  }

  async checkAndMarkScanned(ticket, context) {
    return await this.db.transaction(async (trx) => {
      // Row-level lock
      const lockedTicket = await trx('tickets')
        .where({ id: ticket.id })
        .forUpdate()
        .first();
      
      if (lockedTicket.scanned_at) {
        return {
          valid: false,
          reason: 'ALREADY_SCANNED',
          originalScan: {
            time: lockedTicket.scanned_at,
            gate: lockedTicket.scanned_gate
          }
        };
      }
      
      // Mark as scanned
      await trx('tickets')
        .where({ id: ticket.id })
        .update({
          scanned_at: new Date(),
          scanned_gate: context.gateId,
          scanned_device: context.deviceId,
          scanned_by: context.staffId
        });
      
      return { valid: true };
    });
  }

  async recordValidation(result, context, startTime) {
    const duration = Date.now() - startTime;
    
    await this.db('validation_log').insert({
      event_id: this.eventId,
      ticket_id: result.ticketId || null,
      device_id: context.deviceId,
      staff_id: context.staffId,
      gate_id: context.gateId,
      result: result.valid ? 'SUCCESS' : 'FAILURE',
      reason: result.reason || null,
      duration_ms: duration,
      timestamp: new Date()
    });
    
    // Update real-time metrics
    if (result.valid) {
      await this.cache.incr(`event:${this.eventId}:scanned`);
      await this.cache.incr(`gate:${context.gateId}:scanned`);
    } else {
      await this.cache.incr(`event:${this.eventId}:failed`);
    }
    
    return result;
  }
}
```

### 4.2 Dynamic Barcode Generator (SafeTix-style)

```javascript
class DynamicBarcodeGenerator {
  constructor(ticketId, customerSecret, ticketSecret) {
    this.ticketId = ticketId;
    this.customerSecret = customerSecret;
    this.ticketSecret = ticketSecret;
  }

  generate() {
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Generate TOTPs
    const customerTOTP = this.generateTOTP(this.customerSecret, timestamp);
    const ticketTOTP = this.generateTOTP(this.ticketSecret, timestamp);
    
    // Combine into barcode content
    const content = `${this.ticketId}:${customerTOTP}:${ticketTOTP}:${timestamp}`;
    
    return {
      content: Buffer.from(content).toString('base64'),
      validUntil: (Math.floor(timestamp / 15) + 1) * 15, // Valid until next 15-sec interval
      ticketId: this.ticketId
    };
  }

  generateTOTP(secret, timestamp) {
    const timeCounter = Math.floor(timestamp / 15); // 15-second intervals
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigInt64BE(BigInt(timeCounter));
    
    const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'hex'));
    hmac.update(counterBuffer);
    const hash = hmac.digest();
    
    const offset = hash[hash.length - 1] & 0x0f;
    const code = (
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff)
    ) % 1000000;
    
    return code.toString().padStart(6, '0');
  }
}

class DynamicBarcodeValidator {
  constructor(db) {
    this.db = db;
  }

  async validate(barcodeContent) {
    try {
      const decoded = Buffer.from(barcodeContent, 'base64').toString('utf8');
      const [ticketId, customerTOTP, ticketTOTP, timestamp] = decoded.split(':');
      
      // Check timestamp freshness (within 30 seconds)
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - parseInt(timestamp)) > 30) {
        return { valid: false, reason: 'BARCODE_EXPIRED' };
      }
      
      // Get ticket secrets
      const ticket = await this.db('tickets')
        .where({ id: ticketId })
        .select('customer_secret', 'ticket_secret')
        .first();
      
      if (!ticket) {
        return { valid: false, reason: 'TICKET_NOT_FOUND' };
      }
      
      // Verify TOTPs (check current and previous interval for clock skew)
      const generator = new DynamicBarcodeGenerator(
        ticketId,
        ticket.customer_secret,
        ticket.ticket_secret
      );
      
      for (const timeOffset of [0, -15, 15]) {
        const checkTime = parseInt(timestamp) + timeOffset;
        const expected = generator.generateForTime(checkTime);
        
        if (expected.customerTOTP === customerTOTP && 
            expected.ticketTOTP === ticketTOTP) {
          return { valid: true, ticketId };
        }
      }
      
      return { valid: false, reason: 'INVALID_TOTP' };
      
    } catch (error) {
      return { valid: false, reason: 'INVALID_FORMAT' };
    }
  }
}
```

### 4.3 Offline-First Validation App

```javascript
class OfflineValidationApp {
  constructor(config) {
    this.db = new LocalDatabase('tickets');
    this.syncManager = new SyncManager(config.apiEndpoint);
    this.isOnline = navigator.onLine;
    this.eventId = config.eventId;
    this.publicKey = config.publicKey;
    
    // Listen for connectivity changes
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  async initialize() {
    // Download ticket database before event
    if (this.isOnline) {
      await this.syncManager.downloadTicketDatabase(this.eventId);
    }
    
    // Load local database
    await this.db.open();
    
    // Start background sync
    this.syncManager.startPeriodicSync(2000);
  }

  async validate(qrContent) {
    // Always validate locally first for speed
    const result = await this.validateLocally(qrContent);
    
    if (this.isOnline && result.valid) {
      // Confirm with server asynchronously
      this.confirmWithServer(result.ticketId, result.localScanId);
    }
    
    return result;
  }

  async validateLocally(qrContent) {
    // 1. Verify cryptographic signature
    const parseResult = this.parseAndVerifyQR(qrContent);
    if (!parseResult.valid) return parseResult;
    
    const ticketData = parseResult.payload;
    
    // 2. Check local database
    const ticket = await this.db.get('tickets', ticketData.tid);
    if (!ticket) {
      return { valid: false, reason: 'TICKET_NOT_FOUND' };
    }
    
    // 3. Check local scan cache
    const previousScan = await this.db.get('scans', ticketData.tid);
    if (previousScan) {
      return {
        valid: false,
        reason: 'ALREADY_SCANNED',
        originalScan: previousScan
      };
    }
    
    // 4. Mark as scanned locally
    const scanRecord = {
      ticketId: ticketData.tid,
      scannedAt: new Date().toISOString(),
      deviceId: this.deviceId,
      gateId: this.gateId,
      synced: false
    };
    
    await this.db.put('scans', ticketData.tid, scanRecord);
    
    return {
      valid: true,
      ticketId: ticketData.tid,
      attendeeName: ticket.attendee_name,
      ticketType: ticket.type,
      localScanId: scanRecord.id,
      offlineMode: !this.isOnline
    };
  }

  async confirmWithServer(ticketId, localScanId) {
    try {
      const response = await fetch(`${this.apiEndpoint}/validate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ticketId,
          localScanId,
          deviceId: this.deviceId,
          gateId: this.gateId
        })
      });
      
      const result = await response.json();
      
      if (!result.valid && result.reason === 'ALREADY_SCANNED') {
        // Server shows different scan - conflict!
        await this.handleConflict(ticketId, localScanId, result.originalScan);
      } else {
        // Mark as synced
        await this.db.update('scans', ticketId, { synced: true });
      }
    } catch (error) {
      // Will be synced later
      console.warn('Server confirmation failed:', error);
    }
  }

  handleOnline() {
    this.isOnline = true;
    this.syncManager.syncPendingScans();
  }

  handleOffline() {
    this.isOnline = false;
    this.notifyStaff('Offline mode - scans will be synced when connection restored');
  }
}
```

---

## 5. Sources

### QR Code Security & Cryptographic Signing

1. JWT Introduction
   https://www.jwt.io/introduction

2. OWASP Testing JSON Web Tokens
   https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/06-Session_Management_Testing/10-Testing_JSON_Web_Tokens

3. HMAC vs RSA vs ECDSA for JWT Signing
   https://workos.com/blog/hmac-vs-rsa-vs-ecdsa-which-algorithm-should-you-use-to-sign-jwts

4. JWT with HMAC Protection - Nimbus
   https://connect2id.com/products/nimbus-jose-jwt/examples/jwt-with-hmac

5. The Hard Parts of JWT Security - Ping Identity
   https://www.pingidentity.com/en/resources/blog/post/jwt-security-nobody-talks-about.html

6. NHS Contact Tracing App JWT Vulnerability
   https://www.zofrex.com/blog/2020/10/20/alg-none-jwt-nhs-contact-tracing-app/

7. Digitally Signed and Secure QR Codes - Qryptal
   https://www.qryptal.com/landingpages/signed-qr-code/

8. What Makes a QR Code Verifiable
   https://unmitigatedrisk.com/?p=933

9. Digital Anti-Counterfeit Measures for Event Tickets
   https://www.scoredetect.com/blog/posts/safeguarding-event-tickets-digital-anti-counterfeit-measures

10. Secure Barcode Tickets - Masabi
    https://blog.masabi.com/blog/2008/04/13/ideas-for-interoperability-of-secure-barcode-tickets/

### API & Endpoint Security

11. OWASP API Security Project
    https://owasp.org/www-project-api-security/

12. OWASP API2:2023 Broken Authentication
    https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/

13. OWASP API1:2023 Broken Object Level Authorization
    https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/

14. REST Security Cheat Sheet - OWASP
    https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html

15. Bearer Authentication - Swagger
    https://swagger.io/docs/specification/v3_0/authentication/bearer-authentication/

16. Understanding Bearer Tokens - WorkOS
    https://workos.com/blog/understanding-bearer-tokens

17. RFC 6750 - OAuth 2.0 Bearer Token Usage
    https://datatracker.ietf.org/doc/html/rfc6750

18. Mitigate OWASP API Threats - Microsoft Azure
    https://learn.microsoft.com/en-us/azure/api-management/mitigate-owasp-api-threats

### Replay Attack Prevention

19. Replay Attack - Wikipedia
    https://en.wikipedia.org/wiki/Replay_attack

20. How to Prevent Replay Attacks in API Requests
    https://www.tokenmetrics.com/blog/prevent-replay-attacks-api-requests

21. Guide to Replay Attacks and Defense
    https://www.packetlabs.net/posts/a-guide-to-replay-attacks-and-how-to-defend-against-them

22. Replay Attack Prevention - NordVPN
    https://nordvpn.com/blog/replay-attack/

23. Protecting API Requests Using Nonce and Redis
    https://dev.to/raselmahmuddev/protecting-api-requests-using-nonce-redis-and-time-based-validation-11nd

24. OAuth Replay Attack Mitigation
    https://medium.com/@benjamin.botto/oauth-replay-attack-mitigation-53655a62fe53

25. Mitigate Replay Attacks Using Nonce - Auth0
    https://auth0.com/docs/get-started/authentication-and-authorization-flow/implicit-flow-with-form-post/mitigate-replay-attacks-when-using-the-implicit-flow

26. OAuth 2.0 Protection Against Replay Attacks
    https://medium.com/@haroldfinch01/how-does-oauth-2-protect-against-things-like-replay-attacks-using-the-security-token-77a390641c8f

### Dynamic/Rotating Barcodes

27. Ticketmaster SafeTix
    https://www.ticketmaster.com/safetix

28. SafeTix Technology Overview - Ticketmaster Business
    https://business.ticketmaster.com/harness-the-power-of-safetix-in-2025/

29. Reverse Engineering Ticketmaster's SafeTix
    https://conduition.io/coding/ticketmaster/

30. SafeTix Reverse-Engineered - Hackaday
    https://hackaday.com/2024/07/11/ticketmaster-safetix-reverse-engineered/

31. Ticketmaster SafeTix Explained
    https://theticketlover.com/what-is-ticketmaster-safetix/

32. Dynamic QR Codes for NFT Ticketing
    https://belong.net/blog/qr-code-integration-nft-ticketing

### Offline Validation

33. Ticket Validation and Ticket Fraud - CodeREADr
    https://www.codereadr.com/blog/ticket-fraud/

34. How to Validate Tickets with Smartphones
    https://www.codereadr.com/tutorials/validate-tickets/

35. Ticket Scanning App - Ticket Fairy
    https://www.ticketfairy.com/us/event-ticketing/ticket-scanning-app

36. Access Control App Boilerplate - Softjourn
    https://softjourn.com/access-control-app-boilerplate

37. Gate Control and Ticket Validation - Ticketor
    https://www.ticketor.com/Account/Blog/Gate-control-and-e-ticket-validation

38. Event Tickets Validation - Ticketing.events
    https://kb.ticketing.events/knowledge-base/event-tickets-validation/

### Staff Authentication & Access Control

39. Event Access Control - PassKit
    https://passkit.com/blog/event-access-control/

40. Access Control and Accreditation - Accredit Solutions
    https://www.accredit-solutions.com/access-control-and-accreditation-essential-layers-of-event-security/

41. Event Access Control - Weezevent
    https://weezevent.com/en-gb/weezaccess/access-control/

42. Access Control & Smart Credential Check-Ins - CrowdPass
    https://www.crowdpass.co/access-control-smart-credential-check-ins

43. Ticket Scanning & Access Control - Tessitura
    https://www.tessitura.com/features/access-control

### NFT/Blockchain Ticket Validation

44. NFT Ticket Verification Solution
    https://www.web3contrail.com/nft-ticket-scanning-solution/

45. NFT Ticket Authenticity Verification
    https://lawtonlibrary.com/nft-ticket-authenticity-verification-how-blockchain-stops-counterfeit-tickets-for-good

46. NFT Ticketing - Incode
    https://incode.com/blog/nft-ticket/

47. What Is NFT Ticketing - CCN
    https://www.ccn.com/education/crypto/what-is-nft-ticketing/

48. Proof of Ownership Solutions
    https://medium.com/@davidbrewer_brwr/proof-systems-a-next-step-in-nft-proliferation-68928727a56e

### Event QR Code Implementation

49. QR Code for Ticket Validation - QRCodeChimp
    https://www.qrcodechimp.com/qr-codes-for-event-tickets-with-validation/

50. Event Ticket QR Code Guide - QRCodeChimp
    https://www.qrcodechimp.com/event-ticket-qr-code-guide/

51. QR Code Check-In System - PassKit
    https://passkit.com/blog/qr-code-check-in-system/

52. QR Code Mastery for Events - The Events Calendar
    https://theeventscalendar.com/blog/qr-code-for-ticket-validation/

53. Using QR Codes for Event Check-In
    https://momentivesoftware.com/blog/using-qr-codes-for-event-check-in/

54. Best Event Ticket Scanner Software
    https://www.fielddrive.com/blog/event-ticket-scanner-software-selection

55. Scan Ticket Barcodes for Validation - Dynamsoft
    https://www.dynamsoft.com/blog/insights/scan-ticket-barcodes-and-qr-codes-for-ticket-validation/

---

## Summary

QR code ticket validation security requires multiple layers of protection:

1. **Cryptographic Foundation**
   - Sign all QR codes with ECDSA, RSA, or HMAC
   - Validate signatures on every scan
   - Reject unsigned or `alg: none` tokens
   - Use secure, randomly-generated ticket identifiers

2. **Endpoint Protection**
   - Require device and staff authentication
   - Implement rate limiting and IP restrictions
   - Log all validation attempts
   - Use HTTPS exclusively

3. **Replay Prevention**
   - Mark tickets as scanned atomically
   - Use database transactions with row-level locks
   - Consider dynamic/rotating barcodes for high-security events
   - Track scan history with timestamps and device IDs

4. **Offline Capability**
   - Pre-download ticket database
   - Use cryptographic validation locally
   - Maintain local scan cache
   - Auto-sync when connectivity returns

5. **Transfer Security**
   - Invalidate old QR codes on transfer
   - Generate new secrets for new owner
   - Maintain transfer audit trail
   - Verify current blockchain ownership (NFT)

6. **Staff Controls**
   - Role-based permissions
   - Device registration and pairing
   - Session management
   - Comprehensive audit logging

The most critical rule: **Never trust QR code content without cryptographic verification.** Every ticket must be signed, and every signature must be validated.