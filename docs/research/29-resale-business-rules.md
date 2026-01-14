# Secondary Ticket Market Business Rules
## Regulations, Best Practices, and Audit Checklist

**Version:** 1.0  
**Date:** December 2025  
**Purpose:** Security research and compliance guide for ticket resale platform business rules

---

## Table of Contents

1. [Standards & Best Practices](#1-standards--best-practices)
   - Resale Price Restrictions
   - Resale Timing Restrictions
   - Transfer Limits per Ticket
   - Anti-Scalping Measures
   - Venue/Artist Resale Policies
   - Legal Requirements by Jurisdiction
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist](#3-audit-checklist)
4. [Sources](#4-sources)

---

## 1. Standards & Best Practices

### 1.1 Resale Price Restrictions

Price controls on ticket resale vary significantly by jurisdiction. Understanding these restrictions is critical for platform compliance.

#### Price Cap Categories

| Cap Type | Description | Examples |
|----------|-------------|----------|
| **Face Value Only** | Resale cannot exceed original purchase price | Ireland, UK (pending) |
| **Face Value + Fixed Amount** | Small markup allowed ($1-$3) | Massachusetts ($2), Rhode Island ($3), South Carolina ($1) |
| **Face Value + Percentage** | Percentage markup permitted | France/Germany/Netherlands (~20%), Pennsylvania (25%) |
| **No Cap** | Free market pricing | Most US states, federal level |
| **Location-Based** | Cap applies only near venues | Arizona (within 200 ft), Nebraska (within 150 ft) |

#### Jurisdictions with Price Caps

**Ireland - Sale of Tickets Act 2021:**
The Act commenced on 31 July 2021 making it illegal in Ireland to sell tickets for live events, matches, and concerts for more than face-value. Violations can result in fines up to €100,000 or imprisonment for up to two years.

Source: https://www.lexology.com/library/detail.aspx?g=a9086dba-fd5a-4fd1-86da-ae12619c5c8f

**United Kingdom - November 2025 Announcement:**
Ticket resale above face value will be illegal – this will be defined in legislation as the original ticket price plus unavoidable fees, including service charges. Service fees charged by resale platforms will be capped to prevent the price limit being undermined. Businesses who break the regulations could be subject to financial penalties of up to 10% of global turnover.

Source: https://www.gov.uk/government/news/government-bans-ticket-touting-to-protect-fans-from-rip-off-prices

**Massachusetts:**
Under M.G.L. c. 140 § 185D, a licensed ticket reseller may not resell any ticket to a theatrical exhibition, public show or amusement for more than $2 above the printed price, except for service charges.

Source: https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXX/Chapter140/Section185D

**Rhode Island:**
General Laws § 5-22-26 caps resale price at $3 above face value plus legitimate service charges.

Source: https://ticketflipping.com/resources/ticket-resale-laws-by-us-state/

**European Standards:**
In countries like France, Germany and the Netherlands, ticket resellers face limits on how much tickets can be marked up on secondary sites — typically 20 percent over face value.

Source: https://apcp.assembly.ca.gov/system/files/2024-07/sb-785-caballero-apcp-analysis_1.pdf

#### Platform-Enforced Price Controls

**Ticketmaster Face Value Exchange:**
Tickets can only be resold on Ticketmaster at face value for the price that was paid, so fans can make their money back while making another fan's night. To ensure Face Value Exchange works as intended, all tickets are mobile-only and restricted from transfer.

Source: https://blog.ticketmaster.com/face-value-exchange/

**Festival/Venue Price Caps:**
Glastonbury Festival (UK) strictly prohibits any mark-up. Their tickets are personalized with photo ID and are non-transferable except through the festival's own resale in a limited window – any ticket resold privately is void.

Source: https://www.ticketfairy.com/blog/2025/09/21/verified-resale-exchanges-enabling-safe-fan-to-fan-festival-ticket-swaps-and-fighting-scalping/

#### Implementation Patterns

```typescript
interface PriceCapConfig {
  type: 'NONE' | 'FACE_VALUE' | 'FIXED_MARKUP' | 'PERCENTAGE_MARKUP';
  maxMarkupAmount?: number;      // For FIXED_MARKUP (e.g., 2 for $2)
  maxMarkupPercent?: number;     // For PERCENTAGE_MARKUP (e.g., 20 for 20%)
  includesServiceFees?: boolean; // Whether fees count toward cap
  jurisdiction: string;
  enforceOnPlatform: boolean;
}

const validateResalePrice = (
  originalPrice: number,
  resalePrice: number,
  config: PriceCapConfig
): ValidationResult => {
  
  switch (config.type) {
    case 'FACE_VALUE':
      if (resalePrice > originalPrice) {
        return {
          valid: false,
          maxAllowedPrice: originalPrice,
          reason: `Resale price cannot exceed face value of ${originalPrice}`,
        };
      }
      break;
      
    case 'FIXED_MARKUP':
      const maxFixed = originalPrice + (config.maxMarkupAmount || 0);
      if (resalePrice > maxFixed) {
        return {
          valid: false,
          maxAllowedPrice: maxFixed,
          reason: `Resale price cannot exceed ${maxFixed} (face value + ${config.maxMarkupAmount})`,
        };
      }
      break;
      
    case 'PERCENTAGE_MARKUP':
      const maxPercent = originalPrice * (1 + (config.maxMarkupPercent || 0) / 100);
      if (resalePrice > maxPercent) {
        return {
          valid: false,
          maxAllowedPrice: maxPercent,
          reason: `Resale price cannot exceed ${config.maxMarkupPercent}% above face value`,
        };
      }
      break;
      
    case 'NONE':
    default:
      // No price cap - allow any price
      break;
  }
  
  return { valid: true };
};
```

---

### 1.2 Resale Timing Restrictions

Timing restrictions prevent last-minute fraud and ensure tickets can be verified before events.

#### Cutoff Time Categories

| Restriction Type | Description | Common Values |
|-----------------|-------------|---------------|
| **Sales Cutoff** | Latest time resale listings accepted | 1-24 hours before event |
| **Transfer Cutoff** | Latest time tickets can be transferred | 24-72 hours before event |
| **Listing Availability** | When listings become active | Up to 1 hour after event starts |
| **Delivery Deadline** | When tickets must be delivered to buyer | Hours to days before event |

#### Industry Standards

**Ticketmaster Face Value Exchange:**
Tickets may be listed up until one hour after the event start time. However, the sooner you can list your tickets, the better the opportunity for them to be purchased by another fan. Once it's been an hour since the event started, any tickets that have not sold will be placed back into your account.

Source: https://blog.ticketmaster.com/face-value-exchange/

**Taylor Swift Eras Tour Transfer Restrictions:**
Ticketmaster restricted ticket transfers for Swift's concerts to begin only 72 hours before the event. Previously, fans could transfer tickets between their Ticketmaster accounts at any time.

Source: https://nowtoronto.com/news/ticketmaster-introduces-new-restrictions-on-taylor-swift-ticket-transfers-one-month-before-toronto-show/

**Eric Church Tour Policy:**
Tickets to country star Eric Church's shows aren't sent out until 24 hours before each show in order to verify that the buyers are real fans.

Source: https://www.cbc.ca/amp/1.6667244

#### Implementation Patterns

```typescript
interface ResaleTimingConfig {
  listingCutoffHours: number;      // Hours before event to stop accepting new listings
  transferCutoffHours: number;     // Hours before event to stop transfers
  deliveryCutoffHours: number;     // Hours before event tickets must be delivered
  allowPostEventListing: boolean;  // Allow listing after event started
  postEventListingWindowMinutes: number; // Minutes after start to accept listings
}

const validateResaleTiming = (
  event: Event,
  action: 'LIST' | 'TRANSFER' | 'PURCHASE',
  config: ResaleTimingConfig
): ValidationResult => {
  const now = new Date();
  const eventStart = new Date(event.startTime);
  const hoursUntilEvent = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  // Check if event has already ended
  const eventEnd = new Date(event.endTime);
  if (now > eventEnd) {
    return {
      valid: false,
      reason: 'Event has ended. Resale operations are no longer permitted.',
    };
  }
  
  // Check if event has started (with grace period for listings)
  if (now > eventStart) {
    if (action === 'LIST' && config.allowPostEventListing) {
      const minutesSinceStart = (now.getTime() - eventStart.getTime()) / (1000 * 60);
      if (minutesSinceStart > config.postEventListingWindowMinutes) {
        return {
          valid: false,
          reason: `Listing window closed ${config.postEventListingWindowMinutes} minutes after event start`,
        };
      }
    } else if (action !== 'LIST') {
      return {
        valid: false,
        reason: 'Transfers and purchases not allowed after event has started',
      };
    }
  }
  
  // Check action-specific cutoffs
  switch (action) {
    case 'LIST':
      if (hoursUntilEvent < config.listingCutoffHours && hoursUntilEvent > 0) {
        return {
          valid: false,
          reason: `Listing cutoff reached. Listings close ${config.listingCutoffHours} hours before event.`,
        };
      }
      break;
      
    case 'TRANSFER':
      if (hoursUntilEvent < config.transferCutoffHours) {
        return {
          valid: false,
          reason: `Transfer cutoff reached. Transfers close ${config.transferCutoffHours} hours before event.`,
        };
      }
      break;
      
    case 'PURCHASE':
      if (hoursUntilEvent < config.deliveryCutoffHours) {
        return {
          valid: false,
          reason: `Purchase cutoff reached. Cannot guarantee delivery within ${config.deliveryCutoffHours} hours.`,
        };
      }
      break;
  }
  
  return { valid: true };
};
```

---

### 1.3 Transfer Limits per Ticket

Transfer limits prevent tickets from being passed through multiple hands, reducing scalping and fraud potential.

#### Transfer Limit Categories

| Limit Type | Description | Use Case |
|------------|-------------|----------|
| **Non-Transferable** | No transfers allowed | High-demand events, fraud prevention |
| **Single Transfer** | One transfer permitted | Balance between flexibility and control |
| **Limited Transfers** | Fixed number allowed (2-5) | General events with moderate controls |
| **Unlimited Transfers** | No restrictions | Low-risk events |
| **Official Channel Only** | Transfers only through platform | Platform revenue, tracking |

#### Industry Implementations

**Non-Transferable Tickets:**
Some performers, promoters and venues use paperless tickets which require the credit card holder who purchased them to show the credit card and ID at the door of the event. This impedes the right of the ticket owner to employ them as desired.

Source: https://www.protectticketrights.com/the-issues

**State Laws Requiring Transferability:**
Six states have passed laws that require consumers be offered a freely transferable ticket option (meaning not mobile-only and not locked to one specific ticketing platform). These states include Colorado, Connecticut, Illinois, New York, Utah, and Virginia.

Source: https://www.protectticketrights.com/the-issues

**UK Pending Legislation:**
Individuals will be banned from reselling more tickets than they were entitled to buy in the initial ticket sale.

Source: https://www.gov.uk/government/news/government-bans-ticket-touting-to-protect-fans-from-rip-off-prices

**Artist-Specific Policies:**
Pearl Jam tickets are non-transferable except on fan-to-fan exchanges; The Black Keys have ordered Ticketmaster to invalidate resold tickets and turn away fans carrying them.

Source: https://www.cbc.ca/amp/1.6667244

#### Implementation Patterns

```typescript
interface TransferLimitConfig {
  maxTransfers: number;           // 0 = non-transferable, -1 = unlimited
  requireOfficialChannel: boolean;
  trackTransferChain: boolean;
  allowedTransferMethods: TransferMethod[];
  cooldownPeriodHours: number;    // Time between transfers
}

enum TransferMethod {
  PLATFORM_TRANSFER = 'PLATFORM_TRANSFER',
  DIRECT_TRANSFER = 'DIRECT_TRANSFER',
  RESALE_MARKETPLACE = 'RESALE_MARKETPLACE',
}

interface TicketTransferHistory {
  ticketId: string;
  transfers: TransferRecord[];
}

interface TransferRecord {
  fromUserId: string;
  toUserId: string;
  transferredAt: Date;
  method: TransferMethod;
  transactionId: string;
}

const validateTransfer = (
  ticket: Ticket,
  transferHistory: TicketTransferHistory,
  config: TransferLimitConfig,
  method: TransferMethod
): ValidationResult => {
  
  // Check if transfers are allowed at all
  if (config.maxTransfers === 0) {
    return {
      valid: false,
      reason: 'This ticket is non-transferable',
    };
  }
  
  // Check transfer count (unless unlimited)
  if (config.maxTransfers > 0) {
    if (transferHistory.transfers.length >= config.maxTransfers) {
      return {
        valid: false,
        reason: `Maximum transfers (${config.maxTransfers}) reached for this ticket`,
      };
    }
  }
  
  // Check transfer method
  if (!config.allowedTransferMethods.includes(method)) {
    return {
      valid: false,
      reason: `Transfer method ${method} not allowed. Use: ${config.allowedTransferMethods.join(', ')}`,
    };
  }
  
  // Check cooldown period
  if (transferHistory.transfers.length > 0 && config.cooldownPeriodHours > 0) {
    const lastTransfer = transferHistory.transfers[transferHistory.transfers.length - 1];
    const hoursSinceLastTransfer = 
      (Date.now() - new Date(lastTransfer.transferredAt).getTime()) / (1000 * 60 * 60);
      
    if (hoursSinceLastTransfer < config.cooldownPeriodHours) {
      return {
        valid: false,
        reason: `Transfer cooldown in effect. Wait ${config.cooldownPeriodHours - hoursSinceLastTransfer} more hours.`,
      };
    }
  }
  
  return { valid: true };
};
```

---

### 1.4 Anti-Scalping Measures

Comprehensive anti-scalping strategies combine technical, policy, and enforcement measures.

#### Technical Measures

| Measure | Description | Effectiveness |
|---------|-------------|---------------|
| **Bot Detection** | CAPTCHA, device fingerprinting, behavioral analysis | HIGH |
| **Purchase Limits** | Max tickets per transaction/account | MEDIUM |
| **Verified Fan Programs** | Pre-registration and screening | HIGH |
| **Dynamic Pricing** | Real-time price adjustment | MEDIUM |
| **Delayed Ticket Delivery** | Tickets released close to event | MEDIUM |
| **Personalized Tickets** | Name/photo on ticket, ID required at entry | HIGH |
| **Rotating QR Codes** | Codes refresh every 15 seconds | HIGH |
| **Credit Card Entry** | Original payment card required for entry | HIGH |

**Bot Detection Standards:**
The federal BOTS Act of 2016 prohibits using automated software to bypass purchase limits or security measures. Scalpers use automated bots to complete online forms faster than humans can type, conducting hundreds or thousands of purchases simultaneously.

Source: https://www.freshtix.com/blog/how-to-prevent-ticket-scalping-strategies-for-event-organizers

**Ticketmaster Verified Fan:**
During the Taylor Swift Eras Tour, Ticketmaster launched the Verified Fan program. Fans had to pre-register and receive unique access codes. This system blocked millions of bot attempts and helped real fans get tickets.

Source: https://www.geetest.com/en/article/is-ticket-scalping-illegal-laws-2025-guide

**Personalized Ticketing:**
Personalized ticketing requires attendees to provide personal information during purchase, including name, email, and sometimes photo ID. Advanced systems incorporate the ticket holder's photo onto digital tickets, making unauthorized resale difficult.

Source: https://blog.ticketfairy.com/2025/01/27/anti-scalping-for-event-success-7-practices-to-boost-your-success/

**Purchase Limits:**
A common approach is to restrict purchases to two or four tickets per transaction, ensuring a more equitable distribution among genuine fans.

Source: https://www.ticketfairy.com/blog/2025/01/27/anti-scalping-for-event-success-7-practices-to-boost-your-success/

#### Policy Measures

**Speculative Ticket Sales Ban:**
Minnesota law (effective Jan 1, 2025) bans speculative ticketing — the practice of listing a ticket on secondary sites before a reseller owns it. The law made Minnesota the fourth state to ban speculative ticketing, following Arizona, Maryland and Nevada.

Source: https://www.billboard.com/pro/tim-walz-signed-law-protect-ticket-buyers-minnesota-governor/

**All-In Pricing Requirements:**
Minnesota's Ticketing Fairness Act requires "all-in pricing" to ensure ticket buyers know the total cost of a ticket up front.

Source: https://www.house.mn.gov/NewLaws/story/2024/5564

#### Enforcement Measures

| Measure | Description | Legal Basis |
|---------|-------------|-------------|
| **Account Suspension** | Ban violating accounts | Platform ToS |
| **Ticket Cancellation** | Void tickets resold illegally | Artist/venue policy |
| **Legal Action** | Sue bot operators | BOTS Act, state laws |
| **Entry Denial** | Refuse entry for resold tickets | Venue policy |

---

### 1.5 Venue/Artist Resale Policies

Artists and venues increasingly exercise control over ticket resale through contractual and technical measures.

#### Artist Policy Examples

**Ed Sheeran - Face Value Only:**
Pop star Ed Sheeran has a strict 'ethical resale' policy for tickets to his shows. He doesn't allow his tickets to be resold above "face value."

Source: https://www.cbc.ca/amp/1.6667244

**Taylor Swift - Verified Fan + Transfer Restrictions:**
Swift's touring team sought to keep tickets for the Eras Tour off the secondary market and met with Ticketmaster executives to discuss how to best prevent mass ticket scalping. The tour used Ticketmaster's Verified Fan platform to screen out scalpers.

Source: https://www.billboard.com/pro/taylor-swift-eras-tour-fans-biggest-ticket-scalper/

**Miley Cyrus / Adele - Credit Card Entry:**
Miley Cyrus and Adele have required concertgoers to present the credit card used to purchase their tickets.

Source: https://www.cbc.ca/amp/1.6667244

**The Black Keys - Ticket Invalidation:**
The Black Keys have ordered Ticketmaster to invalidate resold tickets and turn away fans carrying them.

Source: https://www.cbc.ca/amp/1.6667244

#### Venue/Event Policy Framework

```typescript
interface ResalePolicy {
  eventId: string;
  policyType: 'OPEN' | 'RESTRICTED' | 'CLOSED';
  
  // Price controls
  priceRestriction: {
    type: 'NONE' | 'FACE_VALUE' | 'CAPPED';
    maxMarkupPercent?: number;
  };
  
  // Transfer controls
  transferPolicy: {
    allowed: boolean;
    maxTransfers: number;
    officialChannelOnly: boolean;
    cutoffHoursBeforeEvent: number;
  };
  
  // Verification requirements
  entryRequirements: {
    originalPurchaserOnly: boolean;
    creditCardRequired: boolean;
    photoIdRequired: boolean;
    nameMatchRequired: boolean;
  };
  
  // Approved channels
  approvedResaleChannels: string[];  // e.g., ['ticketmaster', 'axs']
  
  // Enforcement
  enforcement: {
    cancelUnapprovedResales: boolean;
    denyEntryForResales: boolean;
    refundPolicy: 'FULL' | 'PARTIAL' | 'NONE';
  };
}
```

---

### 1.6 Legal Requirements by Jurisdiction

#### United States - Federal Level

**BOTS Act (Better Online Ticket Sales Act) - 2016:**
The BOTS Act prohibits the use of automated software (bots) to bypass ticket purchase limits on primary seller websites. It does not make ticket resale illegal, but targets unfair bulk buying practices using bots.

Source: https://www.geetest.com/en/article/is-ticket-scalping-illegal-laws-2025-guide

**FTC Enforcement (2025):**
Executive orders aim to strengthen enforcement of laws like the BOTS Act, improve transparency in ticket pricing, and coordinate efforts among federal, state, and local agencies to combat ticket scalping.

Source: https://www.geetest.com/en/article/is-ticket-scalping-illegal-laws-2025-guide

#### United States - State Level Summary

| State | Price Cap | Broker License | Distance Restriction | Key Provisions |
|-------|-----------|----------------|---------------------|----------------|
| **Massachusetts** | $2 above face | Required | None | Oldest anti-scalping law |
| **Rhode Island** | $3 above face | Required | None | License revocation for violations |
| **Kentucky** | Face value only | Required | None | Misdemeanor for violations |
| **Arizona** | Face value | None | 200 feet | Location-based restriction |
| **Georgia** | None | Required | 1,500-2,700 ft | Large venue restrictions |
| **New York** | None | Required | 1,500 ft | Comprehensive disclosure rules |
| **Minnesota** | None | None | None | Speculative sales ban (2025) |
| **Colorado** | None | None | None | Refund guarantees required |
| **Nebraska** | Face value | None | 150 ft | Location-based restriction |
| **South Carolina** | $1 above face | None | 500 ft | Location + price cap |

Source: https://ticketflipping.com/resources/ticket-resale-laws-by-us-state/

#### International Jurisdictions

**Ireland - Sale of Tickets Act 2021:**
- Resale above face value prohibited for designated events/venues
- Applies to venues with 1,000+ capacity
- Fines up to €100,000 or 2 years imprisonment
- Exemption for charitable fundraising

Source: https://www.gov.ie/en/press-release/71f1a-new-law-banning-ticket-touting-comes-into-force/

**United Kingdom (Pending 2025/2026):**
- Resale above face value to be illegal
- Service fee caps on resale platforms
- Platforms required to monitor compliance
- Penalties up to 10% of global turnover
- Individual resale quantity limits

Source: https://www.gov.uk/government/news/government-bans-ticket-touting-to-protect-fans-from-rip-off-prices

**Australia (State-Level):**
Price caps on resales, of either 10% of face value or face value plus any associated fees, and designation or registration systems, where the criminalisation of touting applies only to specific venues and/or events.

Source: https://www.entsportslawjournal.com/article/id/1582/

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 No Price Cap Enforcement

**Problem:** Platform allows unlimited markup despite jurisdiction-specific caps or artist/venue policies.

**Causes:**
- No jurisdiction detection for user/event location
- Price validation happens client-side only
- Artist/venue price policies not integrated into listing flow
- No real-time price monitoring for listed tickets

**Consequences:**
- Legal liability in capped jurisdictions
- Breach of venue/artist contracts
- Consumer complaints and chargebacks
- Regulatory investigation

**Detection Signs:**
- Tickets listed at 10x+ face value in Ireland/UK events
- Massachusetts event tickets exceed $2 markup
- Artist "face value only" events listed at premium

**Correct Approach:**
```typescript
const createResaleListing = async (
  ticketId: string,
  askingPrice: number,
  sellerId: string
): Promise<ListingResult> => {
  const ticket = await getTicket(ticketId);
  const event = await getEvent(ticket.eventId);
  
  // Get applicable price rules
  const priceRules = await getPriceRules({
    eventId: event.id,
    venueJurisdiction: event.venue.jurisdiction,
    sellerJurisdiction: await getUserJurisdiction(sellerId),
    artistPolicy: event.artistResalePolicy,
    venuePolicy: event.venueResalePolicy,
  });
  
  // Validate against most restrictive applicable rule
  const mostRestrictive = getMostRestrictiveRule(priceRules);
  const validation = validateResalePrice(ticket.originalPrice, askingPrice, mostRestrictive);
  
  if (!validation.valid) {
    return {
      success: false,
      error: validation.reason,
      maxAllowedPrice: validation.maxAllowedPrice,
    };
  }
  
  // Create listing with price audit trail
  return createListingWithAudit(ticketId, askingPrice, sellerId, priceRules);
};
```

---

### 2.2 Resale Allowed After Event Starts

**Problem:** Platform permits ticket resale or transfer after the event has begun or ended.

**Causes:**
- No real-time event state synchronization
- Missing automatic cutoff triggers
- Manual status updates required
- Timezone handling errors

**Consequences:**
- Buyers purchase unusable tickets
- Fraud potential (selling ticket after using it)
- Chargebacks and disputes
- Platform reputation damage

**Detection Signs:**
- Tickets listed/sold minutes before event end
- Transfer requests during live event
- Multiple scans of same ticket barcode
- Customer complaints about denied entry

**Industry Standard:**
Tickets may be listed up until one hour after the event start time. Once it's been an hour since the event started, any tickets that have not sold will be placed back into your account.

Source: https://blog.ticketmaster.com/face-value-exchange/

**Correct Approach:**
```typescript
const validateResaleWindow = async (
  ticketId: string,
  action: 'LIST' | 'PURCHASE' | 'TRANSFER'
): Promise<ValidationResult> => {
  const ticket = await getTicket(ticketId);
  const event = await getEvent(ticket.eventId);
  const now = new Date();
  
  // Event has ended - no resale operations allowed
  if (now >= new Date(event.endTime)) {
    await invalidateAllListings(ticket.eventId);
    return {
      valid: false,
      reason: 'Event has ended. All resale operations are closed.',
    };
  }
  
  // Event has started - apply post-start rules
  if (now >= new Date(event.startTime)) {
    const minutesSinceStart = (now.getTime() - new Date(event.startTime).getTime()) / 60000;
    
    // Only allow listing within grace period
    if (action === 'LIST' && minutesSinceStart > 60) {
      return {
        valid: false,
        reason: 'Listing window closed 1 hour after event start.',
      };
    }
    
    // No purchases or transfers after event starts
    if (action === 'PURCHASE' || action === 'TRANSFER') {
      return {
        valid: false,
        reason: 'Purchases and transfers disabled after event starts.',
      };
    }
  }
  
  return { valid: true };
};
```

---

### 2.3 Unlimited Transfers Enabling Scalping

**Problem:** Tickets can be transferred unlimited times, enabling scalpers to obscure the chain of custody.

**Causes:**
- No transfer counting mechanism
- Transfer history not tracked
- Each transfer treated independently
- No cooldown between transfers

**Consequences:**
- Scalpers use "burner" accounts for transfers
- Fraud harder to trace
- Stolen tickets easily laundered
- Original purchaser protections bypassed

**UK Legislation Example:**
Individuals will be banned from reselling more tickets than they were entitled to buy in the initial ticket sale.

Source: https://www.gov.uk/government/news/government-bans-ticket-touting-to-protect-fans-from-rip-off-prices

**Correct Approach:**
```typescript
interface TicketTransferConfig {
  maxTransfers: number;
  cooldownHours: number;
  requireVerification: boolean;
}

const processTransfer = async (
  ticketId: string,
  fromUserId: string,
  toUserId: string,
  config: TicketTransferConfig
): Promise<TransferResult> => {
  // Get complete transfer history
  const history = await getTransferHistory(ticketId);
  
  // Check transfer limit
  if (history.length >= config.maxTransfers) {
    return {
      success: false,
      error: `Maximum transfers (${config.maxTransfers}) reached. Ticket cannot be transferred again.`,
    };
  }
  
  // Check cooldown period
  if (history.length > 0) {
    const lastTransfer = history[history.length - 1];
    const hoursSinceLastTransfer = 
      (Date.now() - lastTransfer.timestamp) / (1000 * 60 * 60);
    
    if (hoursSinceLastTransfer < config.cooldownHours) {
      return {
        success: false,
        error: `Transfer cooldown in effect. Try again in ${Math.ceil(config.cooldownHours - hoursSinceLastTransfer)} hours.`,
      };
    }
  }
  
  // Verify recipient identity if required
  if (config.requireVerification) {
    const verified = await verifyUserIdentity(toUserId);
    if (!verified) {
      return {
        success: false,
        error: 'Recipient must complete identity verification before receiving transfers.',
      };
    }
  }
  
  // Process transfer with full audit trail
  return executeTransfer(ticketId, fromUserId, toUserId, history);
};
```

---

### 2.4 No Verification of Reseller Identity

**Problem:** Anyone can list tickets for sale without identity verification.

**Causes:**
- Account creation without verification
- No KYC (Know Your Customer) requirements
- Anonymous listing allowed
- Payment methods not verified

**Consequences:**
- Fraudulent sellers list fake tickets
- Stolen tickets sold with impunity
- No accountability for scams
- Tax evasion by high-volume sellers

**Industry Standard (StubHub):**
To start, sellers must create an account on StubHub and verify their identity. After setting up their account, they can list their tickets. The verification step is key to keep StubHub safe.

Source: https://theticketlover.com/how-does-stubhub-work-for-sellers/

**Verification Requirements:**
- Government-issued photo ID (driver's license, passport, etc.)
- Proof of address (utility bill, bank statement, etc.)
- Tax identification documents (W-9 form for U.S. sellers)

Source: https://theticketlover.com/how-does-stubhub-work-for-sellers/

**Correct Approach:**
```typescript
interface SellerVerificationLevel {
  level: 'BASIC' | 'VERIFIED' | 'TRUSTED';
  requirements: VerificationRequirement[];
  privileges: SellerPrivilege[];
}

const VERIFICATION_LEVELS: SellerVerificationLevel[] = [
  {
    level: 'BASIC',
    requirements: ['EMAIL_VERIFIED', 'PHONE_VERIFIED'],
    privileges: ['LIST_UP_TO_5_TICKETS', 'SINGLE_EVENT'],
  },
  {
    level: 'VERIFIED',
    requirements: ['EMAIL_VERIFIED', 'PHONE_VERIFIED', 'ID_VERIFIED', 'PAYMENT_VERIFIED'],
    privileges: ['LIST_UP_TO_50_TICKETS', 'MULTIPLE_EVENTS', 'INSTANT_PAYOUT'],
  },
  {
    level: 'TRUSTED',
    requirements: ['VERIFIED_REQUIREMENTS', 'TAX_ID_PROVIDED', 'SALES_HISTORY', 'LOW_DISPUTE_RATE'],
    privileges: ['UNLIMITED_LISTINGS', 'PRIORITY_SUPPORT', 'REDUCED_FEES'],
  },
];

const validateSellerListing = async (
  sellerId: string,
  listingRequest: ListingRequest
): Promise<ValidationResult> => {
  const seller = await getSeller(sellerId);
  const requiredLevel = determineRequiredVerificationLevel(listingRequest);
  
  if (VERIFICATION_LEVELS.indexOf(seller.verificationLevel) < 
      VERIFICATION_LEVELS.indexOf(requiredLevel)) {
    return {
      valid: false,
      reason: `This listing requires ${requiredLevel.level} verification.`,
      requiredVerification: requiredLevel.requirements,
    };
  }
  
  return { valid: true };
};
```

---

### 2.5 Missing Venue Approval for Resale

**Problem:** Platform allows resale of tickets without checking if venue/artist has approved resale.

**Causes:**
- No integration with venue/artist policies
- Policies not captured at event creation
- Opt-in resale assumed for all events
- No contractual checks

**Consequences:**
- Breach of artist/venue agreements
- Tickets invalidated at entry
- Fans denied entry with valid-looking tickets
- Legal action from rights holders

**Industry Practice:**
Ticket resale eligibility depends on the event. Most tickets bought on Ticketmaster can be resold, but the Event Organizer makes the final decision.

Source: https://www.ticketmaster.com/sell

Resale is at the Event Organizer's discretion and may be removed at any time.

Source: https://www.ticketmaster.com/ticketing101

**Correct Approach:**
```typescript
interface EventResaleApproval {
  eventId: string;
  resaleAllowed: boolean;
  approvedPlatforms: string[];
  restrictions: ResaleRestriction[];
  approvalDate: Date;
  approvedBy: string;
}

const validateEventResaleApproval = async (
  eventId: string,
  platform: string
): Promise<ValidationResult> => {
  const approval = await getEventResaleApproval(eventId);
  
  // Check if resale is allowed at all
  if (!approval.resaleAllowed) {
    return {
      valid: false,
      reason: 'Event organizer has not approved ticket resale for this event.',
    };
  }
  
  // Check if this platform is approved
  if (approval.approvedPlatforms.length > 0 && 
      !approval.approvedPlatforms.includes(platform)) {
    return {
      valid: false,
      reason: `Resale only permitted through: ${approval.approvedPlatforms.join(', ')}`,
    };
  }
  
  // Check any specific restrictions
  for (const restriction of approval.restrictions) {
    const check = await evaluateRestriction(restriction, eventId);
    if (!check.passed) {
      return {
        valid: false,
        reason: check.reason,
      };
    }
  }
  
  return { valid: true };
};
```

---

## 3. Audit Checklist

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

## 4. Sources

### Government & Legal Sources

**United States - Federal:**
- BOTS Act (15 U.S.C. § 45c): https://www.congress.gov/bill/114th-congress/senate-bill/3183
- NCSL State Legislation Summary 2024: https://www.ncsl.org/financial-services/event-ticket-sales-2024-legislation

**United States - State Laws:**
- Ticket Resale Laws by State (Nov 2025): https://ticketflipping.com/resources/ticket-resale-laws-by-us-state/
- Massachusetts Gen. Laws c.140 § 185D: https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXX/Chapter140/Section185D
- Minnesota HF 1989 (Ticketing Fairness Act): https://www.house.mn.gov/NewLaws/story/2024/5564
- California SB 785 Analysis: https://apcp.assembly.ca.gov/system/files/2024-07/sb-785-caballero-apcp-analysis_1.pdf

**International:**
- Ireland Sale of Tickets Act 2021: https://www.gov.ie/en/press-release/71f1a-new-law-banning-ticket-touting-comes-into-force/
- Ireland Act Legal Analysis: https://www.lexology.com/library/detail.aspx?g=a9086dba-fd5a-4fd1-86da-ae12619c5c8f
- UK Government Ticket Touting Ban (Nov 2025): https://www.gov.uk/government/news/government-bans-ticket-touting-to-protect-fans-from-rip-off-prices
- UK Legislation Analysis: https://www.pinsentmasons.com/out-law/news/uk-cap-ticket-reselling-mark-ups
- UK Parliamentary Research: https://researchbriefings.files.parliament.uk/documents/SN04715/SN04715.pdf

### Industry Platform Policies

**Ticketmaster:**
- Ticketing 101: https://www.ticketmaster.com/ticketing101
- Face Value Exchange: https://blog.ticketmaster.com/face-value-exchange/
- Resale Purchase Policy: https://legal.ticketmaster.com/resale-purchase-policy/
- Sell Your Tickets: https://www.ticketmaster.com/sell

**StubHub:**
- Seller FAQ: https://stubhub.community/t5/Selling-Tickets/Selling-and-Sold-Tickets-FAQ/td-p/196384
- How StubHub Works for Sellers: https://theticketlover.com/how-does-stubhub-work-for-sellers/

**AXS:**
- Fan Update: https://www.axs.com/fan-update
- Rescheduled Events: https://support.axs.com/hc/en-us/articles/360012528900-My-event-was-rescheduled-What-do-I-do

### Anti-Scalping & Best Practices

- How to Prevent Ticket Scalping (FreshTix): https://www.freshtix.com/blog/how-to-prevent-ticket-scalping-strategies-for-event-organizers
- Anti-Scalping Practices (Ticket Fairy): https://blog.ticketfairy.com/2025/01/27/anti-scalping-for-event-success-7-practices-to-boost-your-success/
- Verified Resale Exchanges (Ticket Fairy): https://www.ticketfairy.com/blog/2025/09/21/verified-resale-exchanges-enabling-safe-fan-to-fan-festival-ticket-swaps-and-fighting-scalping/
- Is Ticket Scalping Illegal 2025 Guide: https://www.geetest.com/en/article/is-ticket-scalping-illegal-laws-2025-guide
- Ticket Resale Wikipedia: https://en.wikipedia.org/wiki/Ticket_resale

### Artist/Venue Policy Examples

- Taylor Swift Transfer Restrictions: https://nowtoronto.com/news/ticketmaster-introduces-new-restrictions-on-taylor-swift-ticket-transfers-one-month-before-toronto-show/
- Eras Tour Scalping Analysis: https://www.billboard.com/pro/taylor-swift-eras-tour-fans-biggest-ticket-scalper/
- Artist Resale Policies (CBC): https://www.cbc.ca/amp/1.6667244
- Transfer Policy Issues: https://www.protectticketrights.com/the-issues

### Consumer Rights & Legal Analysis

- Is Reselling Tickets Legal 2025: https://www.concertsandtickets.com/blog/is-reselling-tickets-legal/
- Ireland Ticket Consumer Info: https://www.citizensinformation.ie/en/consumer/shopping/tickets-events/
- Entertainment & Sports Law Journal: https://www.entsportslawjournal.com/article/id/1582/

---

## Appendix: Quick Reference

### Jurisdiction Price Cap Quick Reference

| Jurisdiction | Cap Type | Amount | Notes |
|--------------|----------|--------|-------|
| Ireland | Face Value | 0% | €100k fine / 2 years prison |
| UK (pending) | Face Value | 0% | 10% global turnover penalty |
| Massachusetts | Face + Fixed | $2 | License required |
| Rhode Island | Face + Fixed | $3 | License required |
| South Carolina | Face + Fixed | $1 | Within 500ft only |
| Pennsylvania | Face + Percent | 25% | Internet exempt |
| France/Germany | Face + Percent | ~20% | Varies by event |
| Arizona | Face Value | 0% | Within 200ft only |
| Most US States | No Cap | N/A | Market rate |

### Critical Validation Checklist

```typescript
// Minimum validations for every resale transaction
const validateResaleTransaction = async (
  ticket: Ticket,
  seller: Seller,
  askingPrice: number,
  event: Event
): Promise<ValidationResult[]> => {
  return await Promise.all([
    // 1. Price cap compliance
    validatePriceCap(ticket.originalPrice, askingPrice, event.jurisdiction),
    
    // 2. Timing window
    validateResaleWindow(event.startTime, event.endTime),
    
    // 3. Transfer limits
    validateTransferLimit(ticket.id, ticket.transferHistory),
    
    // 4. Seller verification
    validateSellerVerification(seller.id, seller.verificationLevel),
    
    // 5. Event resale approval
    validateEventResaleApproval(event.id, event.resalePolicy),
    
    // 6. Ticket authenticity
    validateTicketAuthenticity(ticket.id, ticket.originalPurchaser),
    
    // 7. Not already used
    validateTicketNotUsed(ticket.id, ticket.status),
  ]);
};
```

---

**Document Version:** 1.0  
**Last Updated:** December 2025  
**Maintained By:** TicketToken Security Team