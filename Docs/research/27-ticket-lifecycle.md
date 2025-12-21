# Ticket Lifecycle Management Guide
## Standards, Best Practices, and Audit Checklist for NFT Ticketing Systems

**Version:** 1.0  
**Date:** December 2025  
**Purpose:** Security research and audit guide for ticket lifecycle implementation

---

## Table of Contents

1. [Standards & Best Practices](#1-standards--best-practices)
   - Ticket State Machines
   - Ticket Validation Rules
   - Transfer Restrictions
   - Ticket Revocation Scenarios
   - State Consistency Between Systems
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist](#3-audit-checklist)
4. [Sources](#4-sources)

---

## 1. Standards & Best Practices

### 1.1 Ticket State Machines

A ticket lifecycle follows a finite state machine pattern where each ticket exists in one of several predefined states, with transitions triggered by specific events or conditions.

#### Standard Ticket States

Based on industry practices from ticketing platforms and blockchain implementations, tickets should support the following states:

| State | Description | Can Enter Event | Can Transfer | Can Refund |
|-------|-------------|-----------------|--------------|------------|
| **MINTED** | Ticket created, not yet sold | No | No | No |
| **SOLD** | Purchased by attendee | No (until activated) | Yes (if allowed) | Yes (before event) |
| **ACTIVE** | Ready for use at event | Yes | Conditional | Conditional |
| **TRANSFERRED** | Ownership changed (intermediate) | No | No | No |
| **CHECKED_IN** | Scanned at venue entry | Yes (re-entry rules) | No | No |
| **USED** | Event attended, ticket consumed | No | No | No |
| **EXPIRED** | Event date passed, unused | No | No | No |
| **REFUNDED** | Money returned, ticket invalidated | No | No | No |
| **REVOKED** | Administratively cancelled | No | No | No |
| **BURNED** | Permanently destroyed on-chain | No | No | No |

#### State Transition Diagram

```
                    ┌──────────────────────────────────────────────────┐
                    │                                                  │
                    ▼                                                  │
              ┌─────────┐                                              │
              │ MINTED  │                                              │
              └────┬────┘                                              │
                   │ purchase()                                        │
                   ▼                                                   │
              ┌─────────┐    refund()     ┌──────────┐                 │
              │  SOLD   │────────────────►│ REFUNDED │                 │
              └────┬────┘                 └──────────┘                 │
                   │ activate()                                        │
                   ▼                                                   │
              ┌─────────┐    revoke()     ┌──────────┐                 │
              │ ACTIVE  │────────────────►│ REVOKED  │                 │
              └────┬────┘                 └──────────┘                 │
                   │                                                   │
        ┌──────────┼──────────┐                                        │
        │          │          │                                        │
        ▼          ▼          ▼                                        │
   transfer()  checkIn()  expire()                                     │
        │          │          │                                        │
        ▼          ▼          ▼                                        │
  ┌───────────┐ ┌─────────┐ ┌─────────┐                                │
  │TRANSFERRED│ │CHECKED_IN│ │ EXPIRED │───────────────────────────────┤
  └─────┬─────┘ └────┬────┘ └─────────┘                                │
        │            │                          burn()                 │
        │ complete() │ checkout()/complete()       │                   │
        │            │                             ▼                   │
        │            ▼                        ┌─────────┐              │
        │       ┌─────────┐                   │ BURNED  │              │
        └──────►│  USED   │──────────────────►└─────────┘              │
                └─────────┘                                            │
```

#### Transition Rules Matrix

| From State | Valid Transitions | Invalid Transitions |
|------------|-------------------|---------------------|
| MINTED | SOLD | All others |
| SOLD | ACTIVE, REFUNDED, TRANSFERRED | CHECKED_IN, USED |
| ACTIVE | CHECKED_IN, TRANSFERRED, REVOKED, EXPIRED | SOLD, MINTED |
| TRANSFERRED | ACTIVE (new owner) | CHECKED_IN, USED |
| CHECKED_IN | USED, ACTIVE (re-entry) | SOLD, TRANSFERRED |
| USED | BURNED | All others (terminal state) |
| EXPIRED | BURNED | All others (terminal state) |
| REFUNDED | BURNED | All others (terminal state) |
| REVOKED | BURNED | All others (terminal state) |
| BURNED | None | All (terminal state) |

#### Implementation Best Practice

The State pattern is the object-oriented way of modeling a state machine with software. Each state has a valid number of transitions to another state or to itself. In order to make a transition from a state to another one, an action has to be made.

Source: https://softwareparticles.com/design-patterns-state/

```typescript
// State machine implementation pattern
interface TicketState {
  canTransfer(): boolean;
  canCheckIn(): boolean;
  canRefund(): boolean;
  transfer(ticket: Ticket, newOwner: string): TicketState;
  checkIn(ticket: Ticket): TicketState;
  refund(ticket: Ticket): TicketState;
}

class ActiveState implements TicketState {
  canTransfer(): boolean { return true; }
  canCheckIn(): boolean { return true; }
  canRefund(): boolean { return true; }
  
  transfer(ticket: Ticket, newOwner: string): TicketState {
    // Validate transfer rules
    if (!ticket.transfersRemaining) {
      throw new Error('Transfer limit exceeded');
    }
    return new TransferredState();
  }
  
  checkIn(ticket: Ticket): TicketState {
    // Validate check-in rules
    if (Date.now() < ticket.eventStartTime - 4 * 60 * 60 * 1000) {
      throw new Error('Check-in not yet available');
    }
    return new CheckedInState();
  }
  
  refund(ticket: Ticket): TicketState {
    // Validate refund deadline
    if (Date.now() > ticket.refundDeadline) {
      throw new Error('Refund period expired');
    }
    return new RefundedState();
  }
}
```

---

### 1.2 Ticket Validation Rules

Ticket validation ensures only legitimate, unused tickets grant event access. Modern ticketing platforms employ multiple layers of validation.

#### Core Validation Checks

Based on industry practices, these validations must occur at check-in:

**1. Authenticity Validation**
- Verify ticket signature/hash matches on-chain record
- Confirm ticket was minted by authorized contract
- Validate cryptographic proof (for cNFTs, verify Merkle proof)

Each ticket is a unique NFT, ensuring it cannot be duplicated or counterfeited. This provides a high level of security, as each ticket's authenticity can be easily verified on the blockchain.

Source: https://sanchezsanchezsergio418.medium.com/eventchain-revolutionizing-ticketing-with-blockchain-technology-3ac39dbe20cb

**2. Ownership Validation**
- Confirm current wallet owner matches ticket holder
- Verify ownership chain is unbroken
- For transferred tickets, validate transfer was authorized

**3. Status Validation**
- Confirm ticket is in ACTIVE or valid state
- Verify ticket has not been previously used
- Check ticket is not revoked or refunded

**4. Temporal Validation**
- Verify current time is within valid entry window
- Check ticket has not expired
- Validate event date matches ticket

**5. Duplicate Entry Prevention**
- Check ticket has not already been scanned
- Validate scan timestamp is reasonable
- Cross-reference with all scanning devices

Each ticket features a unique code that can only be scanned once, preventing fraud and duplicate entries.

Source: https://ticketstripe.com/knowledge-base/event-check-in-app-to-scan-tickets/

#### Dynamic QR Code / TOTP Validation

For enhanced security, leading platforms use rotating barcodes:

When the ticket is scanned at the venue, the system looks up the ticket metadata using a bearer token, and then validates the OTPs against secrets stored in its database. TOTPs are very customizable, but generally the software industry has settled on a set of common defaults for TOTP standardization.

Source: https://conduition.io/coding/ticketmaster/

```typescript
interface TicketValidation {
  // Core validation checks
  isAuthentic: boolean;
  isOwnerValid: boolean;
  isStatusValid: boolean;
  isWithinTimeWindow: boolean;
  isNotDuplicate: boolean;
  
  // Validation metadata
  validatedAt: Date;
  validatedBy: string; // Device/scanner ID
  validationLocation: string; // Gate/entrance ID
  
  // Error details if invalid
  errorCode?: string;
  errorMessage?: string;
}

const validateTicket = async (
  ticketId: string,
  scannerContext: ScannerContext
): Promise<TicketValidation> => {
  const validation: TicketValidation = {
    isAuthentic: false,
    isOwnerValid: false,
    isStatusValid: false,
    isWithinTimeWindow: false,
    isNotDuplicate: false,
    validatedAt: new Date(),
    validatedBy: scannerContext.scannerId,
    validationLocation: scannerContext.gateId,
  };
  
  // 1. Fetch ticket from blockchain/database
  const ticket = await getTicket(ticketId);
  if (!ticket) {
    validation.errorCode = 'TICKET_NOT_FOUND';
    validation.errorMessage = 'Ticket does not exist';
    return validation;
  }
  
  // 2. Verify authenticity (on-chain verification)
  validation.isAuthentic = await verifyOnChain(ticket);
  if (!validation.isAuthentic) {
    validation.errorCode = 'INVALID_TICKET';
    validation.errorMessage = 'Ticket failed authenticity check';
    return validation;
  }
  
  // 3. Check current status
  validation.isStatusValid = ticket.status === 'ACTIVE';
  if (!validation.isStatusValid) {
    validation.errorCode = 'INVALID_STATUS';
    validation.errorMessage = `Ticket is ${ticket.status}, not ACTIVE`;
    return validation;
  }
  
  // 4. Check for duplicate scan
  const previousScan = await checkPreviousScan(ticketId);
  validation.isNotDuplicate = !previousScan;
  if (!validation.isNotDuplicate) {
    validation.errorCode = 'ALREADY_USED';
    validation.errorMessage = `Ticket scanned at ${previousScan.location} on ${previousScan.time}`;
    return validation;
  }
  
  // 5. Validate time window
  const now = Date.now();
  validation.isWithinTimeWindow = 
    now >= ticket.validFrom && now <= ticket.validUntil;
  if (!validation.isWithinTimeWindow) {
    validation.errorCode = 'OUTSIDE_TIME_WINDOW';
    validation.errorMessage = 'Ticket not valid at this time';
    return validation;
  }
  
  return validation;
};
```

---

### 1.3 Transfer Restrictions

Transfer controls are essential to prevent scalping, fraud, and maintain event integrity.

#### Types of Transfer Restrictions

Smart contracts can be programmed to enforce resale conditions, for example, capping the resale price or redirecting a percentage of resale revenue back to the event organizer or artist. Some blockchain ticket platforms restrict transfers to authorized marketplaces only.

Source: https://blog.cheers.finance/nft-ticketing-a-decentralized-solution-for-events/

**1. Transfer Limits**
```typescript
interface TransferRestrictions {
  maxTransfers: number;           // Total allowed transfers (0 = non-transferable)
  transfersRemaining: number;     // Remaining transfers for this ticket
  transferCooldown: number;       // Minimum time between transfers (seconds)
  lastTransferTime: Date | null;  // Timestamp of last transfer
}
```

**2. Temporal Restrictions**
- Freeze transfers X days before event
- Allow transfers only during specific windows
- Lock transfers after first scan

Organizers can limit the number of times a ticket can be transferred, even outright disabling transferability if desired, or set price ceilings and floors for ticket reselling.

Source: https://0xmoongate.medium.com/nft-ticketing-explained-what-is-an-nft-ticket-and-why-use-one-db481aa6bb4d

**3. Price Controls**
```typescript
interface ResaleRestrictions {
  maxResalePrice: number;         // Maximum resale price (0 = face value only)
  minResalePrice: number;         // Minimum resale price (prevent dumping)
  royaltyPercentage: number;      // Percentage to organizer on resale
  allowedMarketplaces: string[];  // Approved resale platforms
}
```

**4. Identity Requirements**
- Require KYC for transfers
- Match ticket to government ID at entry
- Restrict to same-household transfers

In cases where the resale of tickets is forbidden, NFTs can be developed as nontransferable, not to be moved to another buyer.

Source: https://www.leewayhertz.com/how-nft-ticketing-works/

#### Soul-Bound Tokens (SBTs)

For non-transferable tickets, implement as Soul-Bound Tokens:

Smart contracts can include parameters that enable or disable the ability to transfer or resell tickets, known as SBT (Soul Bound Tokens) ensuring greater control over the ticket lifecycle.

Source: https://niftykit.com/guides/nft-event-tickets

```typescript
// Soul-bound ticket implementation
class SoulBoundTicket {
  private readonly owner: string;
  private readonly mintedAt: Date;
  
  constructor(owner: string) {
    this.owner = owner;
    this.mintedAt = new Date();
  }
  
  // Transfer function that always reverts
  transfer(to: string): never {
    throw new Error('SoulBoundTicket: transfers are disabled');
  }
  
  // Only valid for original owner
  isValidFor(wallet: string): boolean {
    return wallet.toLowerCase() === this.owner.toLowerCase();
  }
}
```

---

### 1.4 Ticket Revocation Scenarios

Tickets may need to be revoked for various legitimate reasons. A robust revocation system protects both organizers and attendees.

#### Valid Revocation Scenarios

**1. Fraud Detection**
- Ticket purchased with stolen payment method
- Chargeback received from payment processor
- Bot/scalper detection during purchase

If an event is canceled, no action is required to obtain a refund. It will be processed to the original method of payment used at time of purchase as soon as funds are received from the Event Organizer.

Source: https://help.ticketmaster.com/hc/en-us/articles/9784845658641-What-happens-if-my-event-is-canceled

**2. Terms of Service Violations**
- Unauthorized resale detected
- Ticket holder banned from venue
- Violation of event policies

**3. Event Changes**
- Event cancelled
- Event rescheduled (optional refund)
- Venue change affecting ticket validity

**4. Administrative Actions**
- Duplicate ticket detection
- Technical error correction
- Legal/compliance requirements

Once a badge has been printed for the ticket, the ticket can no longer be canceled or refunded via self-service. The event organizer must invalidate the badge associated with the ticket.

Source: https://community.run.events/knowledge-base/article/ticket-cancellations-and-refunds

#### Revocation Implementation

```typescript
interface RevocationRecord {
  ticketId: string;
  revokedAt: Date;
  revokedBy: string;
  reason: RevocationReason;
  refundStatus: 'PENDING' | 'PROCESSED' | 'DENIED' | 'NOT_APPLICABLE';
  notes: string;
}

enum RevocationReason {
  FRAUD_CHARGEBACK = 'FRAUD_CHARGEBACK',
  FRAUD_STOLEN_PAYMENT = 'FRAUD_STOLEN_PAYMENT',
  TOS_VIOLATION = 'TOS_VIOLATION',
  EVENT_CANCELLED = 'EVENT_CANCELLED',
  EVENT_RESCHEDULED = 'EVENT_RESCHEDULED',
  DUPLICATE_TICKET = 'DUPLICATE_TICKET',
  TECHNICAL_ERROR = 'TECHNICAL_ERROR',
  LEGAL_COMPLIANCE = 'LEGAL_COMPLIANCE',
  ADMIN_REQUEST = 'ADMIN_REQUEST',
}

const revokeTicket = async (
  ticketId: string,
  reason: RevocationReason,
  adminId: string,
  notes: string
): Promise<RevocationRecord> => {
  // 1. Validate ticket exists and is revocable
  const ticket = await getTicket(ticketId);
  if (!ticket) {
    throw new Error('Ticket not found');
  }
  
  const nonRevocableStates = ['USED', 'BURNED', 'REVOKED'];
  if (nonRevocableStates.includes(ticket.status)) {
    throw new Error(`Cannot revoke ticket in ${ticket.status} state`);
  }
  
  // 2. Update ticket status
  await updateTicketStatus(ticketId, 'REVOKED');
  
  // 3. Update blockchain state (for NFT tickets)
  await updateOnChainStatus(ticketId, 'REVOKED');
  
  // 4. Create revocation record
  const record: RevocationRecord = {
    ticketId,
    revokedAt: new Date(),
    revokedBy: adminId,
    reason,
    refundStatus: determineRefundStatus(reason),
    notes,
  };
  
  await saveRevocationRecord(record);
  
  // 5. Notify ticket holder
  await notifyTicketHolder(ticketId, reason);
  
  // 6. Log to audit trail
  await logAuditEvent({
    action: 'TICKET_REVOKED',
    ticketId,
    actor: adminId,
    reason,
    timestamp: new Date(),
  });
  
  return record;
};
```

---

### 1.5 State Consistency Between Systems

Maintaining consistency between blockchain state and database state is critical for hybrid ticketing systems.

#### Consistency Challenges

| System | Characteristics | Challenge |
|--------|----------------|-----------|
| **Blockchain** | Immutable, slow finality, eventual consistency | Transactions may fail or be dropped |
| **Database** | Mutable, fast, strong consistency | Can diverge from blockchain |
| **Cache** | Volatile, fastest | May show stale state |
| **Scanning Devices** | Offline-capable, local state | May miss real-time updates |

#### Reconciliation Strategy

Before your event, the app downloads the complete ticket database to each device, including validation rules and access permissions. During operation, the app can scan and validate tickets without any internet connection. Each device maintains its own record of scanned tickets, and when internet connectivity is restored, the devices automatically sync with the central database to prevent duplicate entries.

Source: https://www.ticketfairy.com/us/event-ticketing/ticket-scanning-app

```typescript
interface ReconciliationResult {
  ticketId: string;
  databaseState: TicketState;
  blockchainState: TicketState;
  isConsistent: boolean;
  discrepancy?: string;
  resolution?: 'DB_WINS' | 'BLOCKCHAIN_WINS' | 'MANUAL_REVIEW';
}

class StateReconciler {
  async reconcile(ticketId: string): Promise<ReconciliationResult> {
    // 1. Fetch database state
    const dbTicket = await this.database.getTicket(ticketId);
    
    // 2. Fetch blockchain state (use finalized commitment)
    const chainTicket = await this.blockchain.getTicket(ticketId, 'finalized');
    
    // 3. Compare states
    const result: ReconciliationResult = {
      ticketId,
      databaseState: dbTicket?.status,
      blockchainState: chainTicket?.status,
      isConsistent: dbTicket?.status === chainTicket?.status,
    };
    
    if (!result.isConsistent) {
      result.discrepancy = `DB: ${result.databaseState}, Chain: ${result.blockchainState}`;
      result.resolution = this.determineResolution(dbTicket, chainTicket);
      
      // Log discrepancy
      await this.logDiscrepancy(result);
      
      // Auto-resolve if possible
      if (result.resolution !== 'MANUAL_REVIEW') {
        await this.resolve(result);
      }
    }
    
    return result;
  }
  
  private determineResolution(
    dbTicket: Ticket | null,
    chainTicket: ChainTicket | null
  ): 'DB_WINS' | 'BLOCKCHAIN_WINS' | 'MANUAL_REVIEW' {
    // Blockchain is source of truth for:
    // - Ownership
    // - Transfer history
    // - Burned/destroyed status
    
    // Database is source of truth for:
    // - Check-in status (may not be on-chain)
    // - Refund processing status
    // - Administrative notes
    
    if (!chainTicket) {
      // Ticket burned on-chain but exists in DB
      return 'BLOCKCHAIN_WINS'; // Mark as burned in DB
    }
    
    if (!dbTicket) {
      // Ticket exists on-chain but not in DB
      return 'BLOCKCHAIN_WINS'; // Create DB record
    }
    
    // Complex discrepancies need manual review
    return 'MANUAL_REVIEW';
  }
}
```

#### Consistency Best Practices

1. **Use finalized commitment for permanent updates**
   - Never update database to terminal states (USED, BURNED) until blockchain is finalized

2. **Implement idempotent operations**
   - Same operation executed multiple times produces same result
   - Use transaction IDs to deduplicate

3. **Event sourcing for audit trail**
   - Store all state changes as immutable events
   - Rebuild state from event log if needed

4. **Periodic reconciliation jobs**
   - Schedule regular consistency checks
   - Alert on discrepancies exceeding threshold

5. **Offline-first with sync**
   - Scanning devices work offline
   - Sync when connectivity restored
   - Conflict resolution for concurrent updates

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Invalid State Transitions Allowed

**Problem:** Ticket transitions to invalid state without proper validation.

**Examples:**
- USED ticket transitions back to ACTIVE
- REVOKED ticket transitions to TRANSFERRED
- EXPIRED ticket transitions to CHECKED_IN

**Consequences:**
- Tickets reused fraudulently
- Refunds issued for already-used tickets
- Entry granted to invalid tickets

**Correct Approach:**
```typescript
// Define allowed transitions explicitly
const VALID_TRANSITIONS: Record<TicketState, TicketState[]> = {
  MINTED: ['SOLD'],
  SOLD: ['ACTIVE', 'REFUNDED'],
  ACTIVE: ['CHECKED_IN', 'TRANSFERRED', 'REVOKED', 'EXPIRED'],
  TRANSFERRED: ['ACTIVE'],
  CHECKED_IN: ['USED', 'ACTIVE'], // ACTIVE only for re-entry
  USED: ['BURNED'],  // Terminal - can only burn
  EXPIRED: ['BURNED'],
  REFUNDED: ['BURNED'],
  REVOKED: ['BURNED'],
  BURNED: [],  // Terminal - no transitions
};

const validateTransition = (
  currentState: TicketState,
  newState: TicketState
): boolean => {
  const allowedStates = VALID_TRANSITIONS[currentState];
  return allowedStates.includes(newState);
};
```

---

### 2.2 Tickets Usable After Transfer

**Problem:** Original owner can still use ticket after transferring to new owner.

**Causes:**
- QR code cached on original device
- Database not updated synchronously with blockchain
- Scanner using stale ticket data

**Consequences:**
- Multiple people enter with same ticket
- Legitimate new owner denied entry
- Revenue loss from duplicate entries

The purpose of gate control is to validate tickets at the gate and admit valid tickets to your event while distinguishing and rejecting all invalid and duplicate tickets. Invalid Tickets are tickets that are generated fraudulently or belong to another event or have been purchased but later refunded.

Source: https://www.ticketor.com/how-to/Gate-Control-and-E-Ticket-Validation

**Correct Approach:**
```typescript
const transferTicket = async (
  ticketId: string,
  fromOwner: string,
  toOwner: string
): Promise<void> => {
  // 1. Invalidate all existing QR codes/tokens
  await invalidateAllTokens(ticketId);
  
  // 2. Update ownership on blockchain FIRST
  const txSignature = await updateOwnershipOnChain(ticketId, toOwner);
  
  // 3. Wait for blockchain confirmation
  await waitForConfirmation(txSignature, 'finalized');
  
  // 4. Update database AFTER blockchain confirmed
  await updateDatabaseOwnership(ticketId, toOwner);
  
  // 5. Generate new access token for new owner only
  const newToken = await generateAccessToken(ticketId, toOwner);
  
  // 6. Send new token to new owner
  await sendTokenToOwner(toOwner, newToken);
  
  // 7. Notify all scanning devices of ownership change
  await broadcastOwnershipChange(ticketId, toOwner);
};
```

---

### 2.3 Duplicate Ticket Usage

**Problem:** Same ticket used for multiple entries.

**Causes:**
- Screenshot of QR code shared
- PDF ticket forwarded to multiple people
- Scanning devices not synchronized
- Offline scanners not reconciled

Without robust preventative measures, a single barcode could be printed dozens of times and sold to unsuspecting fans.

Source: https://www.ticketfairy.com/blog/2025/07/11/festival-ticket-fraud-prevention-spotting-and-avoiding-counterfeit-tickets/

**Consequences:**
- Overcrowding and safety issues
- Revenue loss
- Legitimate ticket holders denied entry

**Correct Approach:**
```typescript
interface ScanRecord {
  ticketId: string;
  scannedAt: Date;
  scannerId: string;
  gateId: string;
  scanResult: 'ADMITTED' | 'DENIED' | 'RE_ENTRY';
}

const scanTicket = async (
  ticketId: string,
  scannerContext: ScannerContext
): Promise<ScanResult> => {
  // 1. Check for previous scans across ALL devices
  const previousScans = await getPreviousScans(ticketId);
  
  if (previousScans.length > 0) {
    const lastScan = previousScans[previousScans.length - 1];
    
    // Check if this is valid re-entry
    if (lastScan.scanResult === 'ADMITTED' && isReEntryAllowed(ticketId)) {
      // Valid re-entry - log and allow
      return { result: 'RE_ENTRY', previousScan: lastScan };
    }
    
    // Duplicate scan - DENY
    return {
      result: 'DENIED',
      reason: 'ALREADY_SCANNED',
      previousScan: lastScan,
      message: `Already scanned at ${lastScan.gateId} at ${lastScan.scannedAt}`,
    };
  }
  
  // 2. Mark as scanned BEFORE admitting
  const scanRecord = await recordScan(ticketId, scannerContext, 'ADMITTED');
  
  // 3. Sync to all devices immediately
  await broadcastScan(scanRecord);
  
  // 4. Update ticket status to CHECKED_IN
  await updateTicketStatus(ticketId, 'CHECKED_IN');
  
  return { result: 'ADMITTED', scanRecord };
};
```

---

### 2.4 State Mismatch Between Database and Blockchain

**Problem:** Ticket state differs between off-chain database and on-chain record.

**Causes:**
- Transaction submitted but not confirmed
- Database updated before blockchain finalized
- Failed transaction not handled
- Network partition during update

**Consequences:**
- Ticket appears valid in one system, invalid in another
- Ownership disputes
- Double-spending attacks

NFTs carry a redeemable/redeemed status and are marked as redeemed after their associated offer has been claimed. This allows the owner to keep the NFT as a digital collectible in perpetuity.

Source: https://www.nft.kred/help/what-happens-to-a-redeemed-ticket

**Correct Approach:**
```typescript
// Always update in correct order based on state type
const updateTicketState = async (
  ticketId: string,
  newState: TicketState,
  isOnChainState: boolean
): Promise<void> => {
  if (isOnChainState) {
    // For states that must be on-chain (ownership, burned, etc.)
    // 1. Submit blockchain transaction
    const txSig = await submitStateChange(ticketId, newState);
    
    // 2. Wait for FINALIZED confirmation
    const confirmed = await waitForFinality(txSig);
    if (!confirmed) {
      throw new Error('Blockchain transaction failed');
    }
    
    // 3. ONLY THEN update database
    await updateDatabase(ticketId, newState);
  } else {
    // For states that are off-chain only (CHECKED_IN, internal statuses)
    // Update database first (blockchain doesn't need to know)
    await updateDatabase(ticketId, newState);
    
    // Optionally log to blockchain for audit
    await logToBlockchain(ticketId, newState);
  }
};
```

---

### 2.5 Missing Audit Trail for State Changes

**Problem:** No record of who changed ticket state, when, and why.

**Causes:**
- Logging not implemented
- Logs not immutable
- Logs not comprehensive

**Consequences:**
- Cannot investigate fraud
- Cannot prove compliance
- Cannot resolve disputes
- Cannot perform forensic analysis

Audit logs provide a chronological record of who did what, where, and when, making them essential for security, compliance, accountability, and cyber forensics by tracking user actions, system changes, and events.

Source: https://www.splunk.com/en_us/blog/learn/audit-logs.html

**Correct Approach:**
```typescript
interface AuditLogEntry {
  // What happened
  eventType: string;
  action: string;
  
  // What was affected
  entityType: 'TICKET' | 'EVENT' | 'USER' | 'PAYMENT';
  entityId: string;
  
  // State change details
  previousState: any;
  newState: any;
  
  // Who did it
  actorType: 'USER' | 'ADMIN' | 'SYSTEM' | 'SCANNER';
  actorId: string;
  
  // When and where
  timestamp: Date;
  ipAddress?: string;
  deviceId?: string;
  
  // Additional context
  transactionId?: string;
  blockchainTxHash?: string;
  notes?: string;
}

const logStateChange = async (
  ticket: Ticket,
  newState: TicketState,
  actor: Actor,
  context: ChangeContext
): Promise<void> => {
  const entry: AuditLogEntry = {
    eventType: 'TICKET_STATE_CHANGE',
    action: `${ticket.status} -> ${newState}`,
    entityType: 'TICKET',
    entityId: ticket.id,
    previousState: { status: ticket.status, owner: ticket.owner },
    newState: { status: newState, owner: ticket.owner },
    actorType: actor.type,
    actorId: actor.id,
    timestamp: new Date(),
    ipAddress: context.ipAddress,
    deviceId: context.deviceId,
    transactionId: context.transactionId,
    blockchainTxHash: context.txHash,
  };
  
  // Write to immutable audit log
  await auditLog.append(entry);
  
  // Also write to blockchain for critical changes
  if (isCriticalChange(ticket.status, newState)) {
    await blockchainAuditLog.append(entry);
  }
};
```

---

## 3. Audit Checklist

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

## 4. Sources

### Industry Ticketing Platforms

- **Ticketmaster SafeTix (Rotating Barcodes):** https://conduition.io/coding/ticketmaster/
- **Eventbrite Ticket Transfer:** https://www.eventbrite.com/help/en-us/articles/431834/how-to-transfer-tickets-to-someone-else/
- **Ticketmaster Event Cancellation Policy:** https://help.ticketmaster.com/hc/en-us/articles/9784845658641-What-happens-if-my-event-is-canceled
- **Run.events Ticket Cancellations:** https://community.run.events/knowledge-base/article/ticket-cancellations-and-refunds

### NFT Ticketing Platforms

- **EventChain Blockchain Ticketing:** https://sanchezsanchezsergio418.medium.com/eventchain-revolutionizing-ticketing-with-blockchain-technology-3ac39dbe20cb
- **NFT.Kred Redeemed Status:** https://www.nft.kred/help/what-happens-to-a-redeemed-ticket
- **LimeChain NFT Ticketing:** https://limechain.tech/blog/what-is-nft-ticketing
- **NiftyKit NFT Event Tickets:** https://niftykit.com/guides/nft-event-tickets
- **Moongate NFT Ticketing:** https://0xmoongate.medium.com/nft-ticketing-explained-what-is-an-nft-ticket-and-why-use-one-db481aa6bb4d
- **OpenSea NFT Ticketing Guide:** https://opensea.io/learn/nft/what-is-nft-ticketing
- **LeewayHertz NFT Ticketing:** https://www.leewayhertz.com/how-nft-ticketing-works
- **Cheers.finance NFT Ticketing:** https://blog.cheers.finance/nft-ticketing-a-decentralized-solution-for-events/

### Ticket Validation & Fraud Prevention

- **Ticket Fairy Fraud Prevention:** https://www.ticketfairy.com/blog/2025/07/11/festival-ticket-fraud-prevention-spotting-and-avoiding-counterfeit-tickets/
- **Ticket Fairy Scanning App:** https://www.ticketfairy.com/us/event-ticketing/ticket-scanning-app
- **TicketStripe Check-in App:** https://ticketstripe.com/knowledge-base/event-check-in-app-to-scan-tickets/
- **Ticketor Gate Control:** https://www.ticketor.com/how-to/Gate-Control-and-E-Ticket-Validation
- **QRCodeChimp Event Tickets:** https://www.qrcodechimp.com/event-ticket-qr-code-guide/
- **Dynamsoft Ticket Scanning:** https://www.dynamsoft.com/blog/insights/scan-ticket-barcodes-and-qr-codes-for-ticket-validation/

### State Machine Design Patterns

- **Refactoring.guru State Pattern:** https://refactoring.guru/design-patterns/state
- **GeeksforGeeks State Pattern:** https://www.geeksforgeeks.org/system-design/state-design-pattern/
- **Software Particles State Pattern:** https://softwareparticles.com/design-patterns-state/
- **SourceMaking State Pattern:** https://sourcemaking.com/design_patterns/state
- **PMI State Pattern:** https://www.pmi.org/disciplined-agile/the-design-patterns-repository/the-state-pattern

### Audit Trail & Compliance

- **Splunk Audit Logs:** https://www.splunk.com/en_us/blog/learn/audit-logs.html
- **Datadog Audit Trail:** https://docs.datadoghq.com/account_management/audit_trail/
- **Datadog Audit Logging Guide:** https://www.datadoghq.com/knowledge-center/audit-logging/
- **AuditBoard Audit Trail:** https://auditboard.com/blog/what-is-an-audit-trail
- **DiliTrust Audit Trail:** https://www.dilitrust.com/audit-trail/
- **DataSunrise Audit Trails:** https://www.datasunrise.com/knowledge-center/data-audit-trails/

### Refund & Cancellation Policies

- **Events Calendar Refunds:** https://theeventscalendar.com/knowledgebase/how-to-refund-or-cancel-a-tickets-order/
- **Imagina Refund Best Practices:** https://imagina.com/en/blog/article/refund-ticket-event/
- **ClearEvent Refund Policy:** https://help.clearevent.com/en/articles/1002005-setting-a-refund-policy
- **Ticketbud Refund Guide:** https://www.ticketbud.com/blog/event-ticket-refunds-a-guide-for-event-organizers-and-attendees/

---

## Appendix: Quick Reference

### State Transition Commands
```bash
# Verify all states defined
grep -rn "TicketState\|TicketStatus" --include="*.ts"

# Find all transition logic
grep -rn "transition\|changeState\|updateStatus" --include="*.ts"

# Check terminal state handling
grep -rn "USED\|BURNED\|REVOKED\|EXPIRED" --include="*.ts" | grep -v "from\|=>"
```

### Validation Commands
```bash
# Find validation at check-in
grep -rn "checkIn\|scan\|validate" --include="*.ts" -A 10 | grep -E "(if|return|throw)"

# Check duplicate prevention
grep -rn "alreadyUsed\|duplicate\|previousScan" --include="*.ts"
```

### Audit Log Commands
```bash
# Find all audit log calls
grep -rn "audit\|log.*change\|logEvent" --include="*.ts" | grep -i "ticket"

# Verify log contains required fields
grep -rn "AuditLogEntry\|LogEntry" --include="*.ts" -A 20
```

---

**Document Version:** 1.0  
**Last Updated:** December 2025  
**Maintained By:** TicketToken Security Team